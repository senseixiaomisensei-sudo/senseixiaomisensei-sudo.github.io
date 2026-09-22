# PostPrep RVC 变声 - 一键启动（本地 GPU 服务 + 公网隧道 + 线上配置）
# 每次开机后运行本脚本即可恢复线上变声功能。
# 前置：一次性执行过 setup-rvc.ps1，且本机已完成 `npx wrangler login`。
# 用法: powershell -ExecutionPolicy Bypass -File start-all.ps1

param([switch]$NoWatchdog)

$startupCreated = $false
$startupMutex = New-Object Threading.Mutex($true, "Local\PostPrepRvcStartup", [ref]$startupCreated)
if (-not $startupCreated) { $startupMutex.Dispose(); exit 0 }
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
$healthy = $false
try { $r = Invoke-RestMethod -Uri "http://127.0.0.1:$LocalPort/healthz" -Headers @{ Authorization = "Bearer $Token" } -TimeoutSec 5; $healthy = ($r.ready -eq $true) } catch {}
# 端口已被占用（典型：上一实例冷启动加载权重中，healthz 尚未 ready）时绝不再起第二个
# uvicorn，否则两个进程同时绑定同一端口，请求随机落到新旧进程，行为时好时坏。
# 冷启动到绑定端口需要十几秒，所以先给端口一小段出现窗口再决定是否另起实例。
if (-not $healthy) {
  $portListening = $null
  for ($i = 0; $i -lt 6 -and -not $portListening; $i++) {
    Start-Sleep -Seconds 3
    $portListening = Get-NetTCPConnection -State Listen -LocalPort $LocalPort -ErrorAction SilentlyContinue
    if ($portListening) {
      for ($j = 0; $j -lt 40 -and -not $healthy; $j++) {
        Start-Sleep -Seconds 3
        try { $r = Invoke-RestMethod -Uri "http://127.0.0.1:$LocalPort/healthz" -Headers @{ Authorization = "Bearer $Token" } -TimeoutSec 5; $healthy = ($r.ready -eq $true) } catch {}
      }
      if ($healthy) { Write-Host "本地服务已在启动中，等待就绪 OK" }
      break
    }
  }
}
if (-not $healthy) {
  # 官方 RVC 2.3.260718 运行时（setup-official-rvc.ps1 装在 D:\数据\rvc-runtime）；服务代码用 site 仓库里的 rvc-service。
  if (-not (Test-Path $OfficialVenvPython)) { throw "未找到官方运行时: $OfficialVenvPython，请先运行 site\rvc-service\setup-official-rvc.ps1" }
  $env:RVC_GATEWAY_TOKEN = $Token
  $env:RVC_MODELS_DIR = $ModelsDir
  $env:RVC_OFFICIAL_ROOT = "D:\数据\rvc-runtime\official-rvc"
  $env:RVC_RUNTIME_CACHE = "D:\rvc-cache"
  $env:RVC_WORK_ROOT = Join-Path $Root "work"
  $env:RVC_OUTPUT_ROOT = Join-Path $Root "output"
  $env:RVC_SEPARATOR_MODELS_DIR = "D:\数据\rvc-runtime\pymss-models"
  $env:RVC_SEPARATOR_MODEL = "model_bs_roformer_ep_368_sdr_12.9628.ckpt"
  $env:RVC_SEPARATOR_DEVICE = "cuda"
  $env:RVC_MAX_CONCURRENCY = "1"
  $env:CUBLAS_WORKSPACE_CONFIG = ":4096:8"
  $ServiceAppDir = Join-Path $SiteDir "rvc-service"
  Start-Process -FilePath $OfficialVenvPython -ArgumentList "-m","uvicorn","app.main:app","--app-dir",$ServiceAppDir,"--host","127.0.0.1","--port",$LocalPort,"--no-access-log" -WindowStyle Hidden
  # 官方运行时冷启动要把 HuBERT/RMVPE 权重载入显存，实测远超 8 秒；轮询到 120 秒再判失败。
  for ($i = 0; $i -lt 40 -and -not $healthy; $i++) {
    Start-Sleep -Seconds 3
    try { $r = Invoke-RestMethod -Uri "http://127.0.0.1:$LocalPort/healthz" -Headers @{ Authorization = "Bearer $Token" } -TimeoutSec 5; $healthy = ($r.ready -eq $true) } catch {}
  }
}
if (-not $healthy) { throw "本地 RVC 服务启动失败，请查看日志。" }
Write-Host "本地服务 OK"

Step "3/5 启动窄代理与公网隧道（trycloudflare）"
# 窄代理（tunnel_proxy.py）监听 8090，只放行服务端到服务的 RVC 路由；隧道只指向它，GPU 服务保持仅回环访问。
$proxyListening = Get-NetTCPConnection -State Listen -LocalPort $ProxyPort -ErrorAction SilentlyContinue
if (-not $proxyListening) {
  if (-not (Test-Path $ProxyScript)) { throw "未找到窄代理脚本: $ProxyScript" }
  $env:RVC_GATEWAY_TOKEN = $Token
  if (-not (Test-Path $OfficialVenvPython)) { throw "未找到代理运行时: $OfficialVenvPython" }
  Start-Process -FilePath $OfficialVenvPython -ArgumentList "-u",$ProxyScript -WindowStyle Hidden
  Start-Sleep -Seconds 2
}
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
if ($TunnelUrl) {
  try { $probe = Invoke-WebRequest -Uri "$TunnelUrl/healthz" -Headers @{ Authorization = "Bearer $Token" } -TimeoutSec 8 -UseBasicParsing -SkipHttpErrorCheck; $tunnelAlive = ($probe.StatusCode -eq 200) } catch { $tunnelAlive = $false }
}
if (-not $tunnelAlive) {
  Get-Process cloudflared -ErrorAction SilentlyContinue |
    Where-Object { -not $_.Path -or $_.Path -eq $CfBin } |
    Stop-Process -Force
  Remove-Item $TunnelLog, "$TunnelLog.err" -ErrorAction SilentlyContinue
  # Use the operator's enabled Windows proxy for quick-tunnel registration.
  $proxySettings = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
  if ($proxySettings.ProxyEnable -eq 1 -and $proxySettings.ProxyServer -match '^127\.0\.0\.1:\d+$') {
    $env:HTTPS_PROXY = "http://$($proxySettings.ProxyServer)"
    $env:HTTP_PROXY = $env:HTTPS_PROXY
  }
  $env:NO_PROXY = '127.0.0.1,localhost' 
  $quickArgs = @()
  if ($env:HTTPS_PROXY) {
    if (-not (Get-NetTCPConnection -State Listen -LocalPort 8091 -ErrorAction SilentlyContinue)) {
      Start-Process -FilePath $OfficialVenvPython -ArgumentList (Join-Path $SiteDir 'rvc-service\quick_tunnel_registration.py') -WindowStyle Hidden
      Start-Sleep -Seconds 2
    }
    $quickArgs = @('--quick-service', 'http://127.0.0.1:8091')
  }
  # Allow QUIC to fall back to HTTP/2 when the network blocks UDP.
  Start-Process -FilePath $CfBin -ArgumentList (@("tunnel","--url","http://127.0.0.1:$ProxyPort","--no-autoupdate","--protocol","auto") + $quickArgs) -RedirectStandardOutput $TunnelLog -RedirectStandardError "$TunnelLog.err" -WindowStyle Hidden
  $TunnelUrl = ""
  for ($i = 0; $i -lt 40 -and -not $TunnelUrl; $i++) {
    Start-Sleep -Seconds 1
    $TunnelUrl = Find-TunnelUrl $TunnelLog
  }
  if (-not $TunnelUrl) { throw "隧道启动失败，请查看 $TunnelLog" }
}
$verifiedTunnel = $false
for ($probeAttempt = 0; $probeAttempt -lt 8 -and -not $verifiedTunnel; $probeAttempt++) {
  try { $health = Invoke-RestMethod "$TunnelUrl/healthz" -Headers @{ Authorization = "Bearer $Token" } -TimeoutSec 8; $verifiedTunnel = ($health.ready -eq $true) } catch {}
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
  node "D:\DevCaches\npm-cache\_npx\32026684e21afda6\node_modules\wrangler\bin\wrangler.js" secret bulk $SecretFile --config (Join-Path $SiteDir "worker\wrangler.toml")
  if ($LASTEXITCODE -ne 0) { throw "Worker 隧道密钥同步失败" }
} finally {
  Remove-Item -LiteralPath $SecretFile -Force -ErrorAction SilentlyContinue
}

Step "5/5 线上自检"
Start-Sleep -Seconds 5
$status = curl.exe -s "https://postprep-ae6.pages.dev/rvc-api/status" -H "Origin: https://senseixiaomisensei-sudo.github.io" --max-time 30
Write-Host "Pages relay /rvc-api/status: $status"
if ($status -match '"ready":true') {
  Write-Host ""
  Write-Host "全部就绪！打开 https://senseixiaomisensei-sudo.github.io/rvc.html 即可在线变声。" -ForegroundColor Green
} else {
  Write-Host "状态异常，请检查本地服务与隧道日志。" -ForegroundColor Red
}

if (-not $NoWatchdog -and (Test-Path -LiteralPath $WatchdogScript)) {
  $WatchdogPidFile = Join-Path $Root "watchdog.pid"
  $watchdogRunning = $false
  if (Test-Path -LiteralPath $WatchdogPidFile) {
    $watchdogPid = 0
    [void][int]::TryParse((Get-Content -LiteralPath $WatchdogPidFile -Raw).Trim(), [ref]$watchdogPid)
    if ($watchdogPid -gt 0) {
      $watchdogOwner = Get-CimInstance Win32_Process -Filter "ProcessId=$watchdogPid" -ErrorAction SilentlyContinue
      $watchdogRunning = $watchdogOwner -and $watchdogOwner.CommandLine -like "*$WatchdogScript*"
    }
  }
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

