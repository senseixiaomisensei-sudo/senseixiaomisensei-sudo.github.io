# PostPrep RVC 变声 - 一键启动（本地 GPU 服务 + 公网隧道 + 线上配置）
# 每次开机后运行本脚本即可恢复线上变声功能。
# 前置：一次性执行过 setup-rvc.ps1，且本机已完成 `npx wrangler login`。
# 用法: powershell -ExecutionPolicy Bypass -File start-all.ps1

param([switch]$NoWatchdog, [switch]$LocalOnly)

. (Join-Path $PSScriptRoot 'startup_health.ps1')
Set-RvcDirectNetwork
$startupMutex = Enter-RvcStartupMutex 'Global\PostPrepRvcStartup'
if (-not $startupMutex) { Write-Warning '另一启动流程仍在运行；本次未执行恢复。'; exit 75 }
try {

$ErrorActionPreference = "Stop"
$env:XDG_CONFIG_HOME = "D:\UserTemp\wrangler-config"
$env:WRANGLER_LOG = "error"
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\rvc-local"))
# Use the checked official-runtime virtual environment for both the GPU
# service and the narrow proxy. The legacy local .venv can be stale after a
# Python/uv upgrade, which otherwise leaves the public route unavailable
# after reboot.
$OfficialVenvPython = "D:\数据\rvc-runtime\.venv\Scripts\python.exe"
$ModelsDir = Join-Path $Root "models"
$TokenFile = Join-Path $Root ".gateway-token"
$CfBin = Join-Path $Root "bin\cloudflared.exe"
$TunnelLog = Join-Path $Root "tunnel.log"
$LocalPort = if ($env:RVC_PORT) { $env:RVC_PORT } else { "8088" }
$SiteDir = [IO.Path]::GetFullPath((Join-Path $Root "..\site"))
# 窄代理端口：只暴露 /healthz、/v1/models、/v1/convert、/v1/output/<job>，隧道只指向它
$ProxyPort = if ($env:RVC_PROXY_PORT) { $env:RVC_PROXY_PORT } else { "8090" }
$ProxyScript = Join-Path $SiteDir "rvc-service\tunnel_proxy.py"
$WatchdogScript = Join-Path $SiteDir "rvc-service\watchdog.ps1"

function Step([string]$message) { Write-Host ""; Write-Host "==> $message" -ForegroundColor Cyan }

Step "1/5 准备令牌"
if (-not (Test-Path $TokenFile)) {
  $token = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 })).Replace("+", "A").Replace("/", "B").TrimEnd("=")
  Set-Content -Path $TokenFile -Value $token -NoNewline
}
$Token = (Get-Content $TokenFile -Raw).Trim()

Step "2/5 启动本地 RVC 服务（GPU）"
$healthy = Test-RvcLocalReady $LocalPort $Token
# 端口已被占用（典型：上一实例冷启动加载权重中，healthz 尚未 ready）时绝不再起第二个
# uvicorn，否则两个进程同时绑定同一端口，请求随机落到新旧进程，行为时好时坏。
# 冷启动到绑定端口需要十几秒，所以先给端口一小段出现窗口再决定是否另起实例。
if (-not $healthy) {
  $portListening = $null
  for ($i = 0; $i -lt 6 -and -not $portListening; $i++) {
    Start-Sleep -Seconds 3
    $portListening = Test-RvcTcpPort $LocalPort
    if ($portListening) {
      $healthy = Wait-RvcLocalReady $LocalPort $Token 150
      if ($healthy) { Write-Host "本地服务已在启动中，等待就绪 OK" }
      else { throw "端口 $LocalPort 已被占用，但 GPU 未就绪；保留现有进程，请查看 gpu-service-runtime.log.err。" }
      break
    }
  }
}
if (-not $healthy) {
  # 官方 RVC 2.3.260718 运行时（setup-official-rvc.ps1 装在 D:\数据\rvc-runtime）；服务代码用 site 仓库里的 rvc-service。
  if (-not (Test-Path $OfficialVenvPython)) { throw "未找到官方运行时: $OfficialVenvPython，请先运行 site\rvc-service\setup-official-rvc.ps1" }
  $env:RVC_GATEWAY_TOKEN = $Token
  try { $env:RVC_BACKEND_BUILD_SHA = (& git -C $SiteDir rev-parse HEAD).Trim() }
  catch { $env:RVC_BACKEND_BUILD_SHA = "" }
  $env:RVC_MODELS_DIR = $ModelsDir
  $env:RVC_OFFICIAL_ROOT = "D:\数据\rvc-runtime\official-rvc"
  $env:RVC_RUNTIME_CACHE = "D:\rvc-cache"
  $env:RVC_WORK_ROOT = Join-Path $Root "work"
  $env:RVC_OUTPUT_ROOT = Join-Path $Root "output"
  $env:RVC_DIAGNOSTIC_ROOT = Join-Path $Root "diagnostics"
  $env:RVC_SEPARATOR_MODELS_DIR = "D:\数据\rvc-runtime\pymss-models"
  $env:RVC_SEPARATOR_MODEL = "model_bs_roformer_ep_368_sdr_12.9628.ckpt"
  $env:RVC_SEPARATOR_DEVICE = "cuda"
  $env:RVC_MAX_CONCURRENCY = "1"
  # Keep the deployed process on the validated shared frame/phase clock.
  # Operators can explicitly set either flag to 0 for a controlled rollback.
  if (-not (Test-Path Env:RVC_TIMELINE_INFERENCE)) { $env:RVC_TIMELINE_INFERENCE = "1" }
  if (-not (Test-Path Env:RVC_TIMELINE_CONSENSUS)) { $env:RVC_TIMELINE_CONSENSUS = "1" }
  # Per-model HuBERT graph captures retain large private CUDA pools across
  # character switches on this 8 GiB device. Eager inference is the stable
  # default; an operator may explicitly opt back in for a controlled trial.
  if (-not (Test-Path Env:RVC_CUDA_GRAPH)) { $env:RVC_CUDA_GRAPH = "0" }
  $env:CUBLAS_WORKSPACE_CONFIG = ":4096:8"
  $ServiceAppDir = Join-Path $SiteDir "rvc-service"
  $ServiceLog = Join-Path $Root "gpu-service-runtime.log"
  Start-Process -FilePath $OfficialVenvPython -ArgumentList "-m","uvicorn","app.main:app","--app-dir",$ServiceAppDir,"--host","127.0.0.1","--port",$LocalPort,"--no-access-log" -RedirectStandardOutput $ServiceLog -RedirectStandardError "$ServiceLog.err" -WindowStyle Hidden
  # Bound cold loading while keeping the existing process on a slow boot.
  $healthy = Wait-RvcLocalReady $LocalPort $Token 150
}
if (-not $healthy) { throw "本地 RVC 服务启动失败，请查看日志。" }
Write-Host "本地服务 OK"

Step "3/5 启动窄代理与公网隧道（trycloudflare）"
# 窄代理（tunnel_proxy.py）监听 8090，只放行服务端到服务的 RVC 路由；隧道只指向它，GPU 服务保持仅回环访问。
$proxyListening = Test-RvcTcpPort $ProxyPort
if (-not $proxyListening) {
  if (-not (Test-Path $ProxyScript)) { throw "未找到窄代理脚本: $ProxyScript" }
  $env:RVC_GATEWAY_TOKEN = $Token
  $env:RVC_PROXY_PORT = $ProxyPort
  $env:RVC_UPSTREAM_PORT = $LocalPort
  if (-not (Test-Path $OfficialVenvPython)) { throw "未找到代理运行时: $OfficialVenvPython" }
  $ProxyLog = Join-Path $Root 'tunnel-proxy.log'
  Start-Process -FilePath $OfficialVenvPython -ArgumentList "-u",$ProxyScript -RedirectStandardOutput $ProxyLog -RedirectStandardError "$ProxyLog.err" -WindowStyle Hidden
}
if (-not (Wait-RvcLocalReady $ProxyPort $Token 10)) { throw '窄代理未就绪，请查看 tunnel-proxy.log.err。' }
if ($LocalOnly) { Write-Host '本地 GPU 与代理已就绪；未执行公网发布。'; return }
$TunnelUrl = ""
# cloudflared 把 quick tunnel 地址写到 stderr，所以两个日志文件都要扫。
function Find-TunnelUrl([string]$logPath) {
  foreach ($candidate in @($logPath, "$logPath.err")) {
    if (Test-Path $candidate) {
      $text = Get-Content $candidate -Raw -ErrorAction SilentlyContinue
      if ($text) {
        $matches = [regex]::Matches($text, "https://[a-z0-9-]+\.trycloudflare\.com")
        foreach ($m in $matches) { if ($m.Value -ne "https://api.trycloudflare.com") { return $m.Value } }
      }
    }
  }
  return ""
}
$TunnelUrl = Find-TunnelUrl $TunnelLog
$tunnelAlive = $false
. (Join-Path $PSScriptRoot "tunnel_health.ps1")
if ($TunnelUrl -and (Test-RvcRegisteredTunnel $TunnelLog)) {
  # A registered connector is not dead just because an operator-side probe
  # times out. Reuse it and verify end-to-end below before synchronizing Worker.
  $tunnelAlive = $true
  Write-Host "现有隧道连接仍已注册，复用连接并验证公网入口"
} elseif ($TunnelUrl) {
  $tHost = ([Uri]$TunnelUrl).Host
  $tRes = curl.exe -s --max-time 6 --noproxy "*" --resolve "${tHost}:443:172.66.47.151" "$TunnelUrl/healthz" -H "Authorization: Bearer $Token"
  if ($tRes -notmatch '"ready":\s*true') {
    $tRes = curl.exe -s --max-time 6 "$TunnelUrl/healthz" -H "Authorization: Bearer $Token"
  }
  $tunnelAlive = ($tRes -match '"ready":\s*true')
}
if (-not $tunnelAlive) {
  Get-Process cloudflared -ErrorAction SilentlyContinue |
    Where-Object { -not $_.Path -or $_.Path -eq $CfBin } |
    Stop-Process -Force
  Remove-Item $TunnelLog, "$TunnelLog.err" -ErrorAction SilentlyContinue
  Set-RvcDirectNetwork
  $quickArgs = @()
  if (-not (Test-RvcTcpPort 8091)) {
    Start-Process -FilePath $OfficialVenvPython -ArgumentList (Join-Path $SiteDir 'rvc-service\quick_tunnel_registration.py') -WindowStyle Hidden
    Start-Sleep -Seconds 2
  }
  $quickArgs = @('--quick-service', 'http://127.0.0.1:8091')
  # Large real uploads stalled on this host's QUIC connection while HTTP/2
  # completed the identical upload. Preserve an explicit operator override.
  $tunnelProtocol = if ($env:RVC_TUNNEL_PROTOCOL) { $env:RVC_TUNNEL_PROTOCOL } else { "http2" }
  if ($tunnelProtocol -notin @("http2", "quic", "auto")) { throw "Invalid RVC_TUNNEL_PROTOCOL" }
  $runner = Join-Path $PSScriptRoot 'run_cloudflared.py'
  $runnerArgs = @('-u',$runner,'--executable',$CfBin,'--origin',"http://127.0.0.1:$ProxyPort",
    '--protocol',$tunnelProtocol,'--registration','http://127.0.0.1:8091','--log-path',$TunnelLog)
  $tunnelLauncher = Start-Process -FilePath $OfficialVenvPython -ArgumentList ($runnerArgs | ForEach-Object { '"' + $_ + '"' }) -WindowStyle Hidden -PassThru
  $TunnelUrl = ""
  for ($i = 0; $i -lt 40 -and -not $TunnelUrl; $i++) {
    Start-Sleep -Seconds 1
    $TunnelUrl = Find-TunnelUrl $TunnelLog
    if (-not $TunnelUrl -and $tunnelLauncher.HasExited) {
      throw "Tunnel runner exited with code $($tunnelLauncher.ExitCode); see $TunnelLog.err"
    }
  }
  if (-not $TunnelUrl) { throw "隧道启动失败，请查看 $TunnelLog" }
}
$verifiedTunnel = $false
$tHost = ([Uri]$TunnelUrl).Host
for ($probeAttempt = 0; $probeAttempt -lt 6 -and -not $verifiedTunnel; $probeAttempt++) {
  try {
    # 1. Clean IP Anycast probe (direct, bypasses domestic DNS poisoning and proxy errors)
    $h = curl.exe -s --max-time 6 --noproxy "*" --resolve "${tHost}:443:172.66.47.151" "$TunnelUrl/healthz" -H "Authorization: Bearer $Token"
    if ($h -match '"ready":\s*true') { $verifiedTunnel = $true; break }
    # System DNS is also tested directly; never fall back to a VPN proxy.
    $hDirect = curl.exe -s --max-time 6 --noproxy "*" "$TunnelUrl/healthz" -H "Authorization: Bearer $Token"
    if ($hDirect -match '"ready":\s*true') { $verifiedTunnel = $true; break }
  } catch {}
  if (-not $verifiedTunnel) { Start-Sleep -Seconds 2 }
}
if (-not $verifiedTunnel) { throw "隧道健康检查未通过，不覆盖线上入口" }
Write-Host "隧道地址: $TunnelUrl"

Step "4/5 原子同步 Worker 隧道配置"
# 试听与下载也走 /rvc-api/output。隧道重连只刷新 Worker 密钥，
# 不再为了一个地址变化重复构建整个 Pages 站点。
$SecretFile = Join-Path $env:TEMP ("postprep-rvc-worker-secrets-" + [guid]::NewGuid().ToString("N") + ".json")
try {
  @{
    POSTPREP_RVC_DIRECT_BASE_URL = $TunnelUrl
    POSTPREP_RVC_INFERENCE_TOKEN = $Token
  } | ConvertTo-Json | Set-Content -LiteralPath $SecretFile -Encoding UTF8
  $cleanDnsCjs = Join-Path $PSScriptRoot "clean-cf-dns.cjs"
  $nodeArgs = @()
  if (Test-Path $cleanDnsCjs) {
    $nodeArgs += @("-r", $cleanDnsCjs)
  }
  $wranglerJs = Resolve-RvcWrangler $SiteDir
  $nodeArgs += @($wranglerJs, "secret", "bulk", $SecretFile, "--config", (Join-Path $SiteDir "worker\wrangler.toml"))
  $SyncLog = Join-Path $Root 'worker-sync.log'
  $syncProcess = Start-Process -FilePath 'node.exe' -ArgumentList ($nodeArgs | ForEach-Object { '"' + $_ + '"' }) -RedirectStandardOutput $SyncLog -RedirectStandardError "$SyncLog.err" -WindowStyle Hidden -PassThru
  if (-not $syncProcess.WaitForExit(90000)) {
    $syncProcess.Kill()
    $syncProcess.WaitForExit()
    throw 'Worker 同步超过 90 秒，请查看 worker-sync.log.err；保留现有线上入口。'
  }
  if ($syncProcess.ExitCode -ne 0) { throw "Worker 隧道密钥同步失败，请查看 worker-sync.log.err。" }
} finally {
  Remove-Item -LiteralPath $SecretFile -Force -ErrorAction SilentlyContinue
}

Step "5/5 线上自检"
Start-Sleep -Seconds 5
$status = curl.exe -s --noproxy "*" "https://postprep-ae6.pages.dev/rvc-api/status" -H "Origin: https://senseixiaomisensei-sudo.github.io" --max-time 30
if ($status -notmatch '"ready":\s*true') {
  $status = curl.exe -s --noproxy "*" "https://postprep-ae6.pages.dev/rvc-api/status" -H "Origin: https://senseixiaomisensei-sudo.github.io" --max-time 30
}
Write-Host "Pages relay /rvc-api/status: $status"
if ($status -match '"ready":\s*true') {
  Write-Host ""
  Write-Host "全部就绪！打开 https://senseixiaomisensei-sudo.github.io/rvc.html 即可在线变声。" -ForegroundColor Green
} else {
  throw "线上入口未就绪；本地启动不等于发布成功，请检查 worker-sync.log.err 与隧道日志。"
}

if (-not $NoWatchdog -and (Test-Path -LiteralPath $WatchdogScript)) {
  $WatchdogPidFile = Join-Path $Root "watchdog.pid"
  $watchdogRunning = $false
  $watchdogProbe = Enter-RvcStartupMutex 'Global\PostPrepRvcWatchdog'
  if (-not $watchdogProbe) { $watchdogRunning = $true }
  else { $watchdogProbe.ReleaseMutex(); $watchdogProbe.Dispose() }
  if (-not $watchdogRunning) {
    $watchdogTask = Get-ScheduledTask -TaskName "PostPrepRvcWatchdog" -ErrorAction SilentlyContinue
    if ($watchdogTask -and $watchdogTask.State -ne "Disabled") {
      Start-ScheduledTask -TaskName "PostPrepRvcWatchdog"
    } else {
      Start-Process -FilePath "pwsh.exe" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",$WatchdogScript -WindowStyle Hidden
    }
    Write-Host "稳定性看门狗已启动。" -ForegroundColor Green
  }
}
} finally {
  $startupMutex.ReleaseMutex()
  $startupMutex.Dispose()
}

