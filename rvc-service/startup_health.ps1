# Loopback checks work at user logon without administrator/CIM permissions.
function Set-RvcDirectNetwork {
  # Only this service tree changes. Do not alter the user's Windows/VPN setup.
  foreach ($name in @('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'FTP_PROXY',
      'GLOBAL_AGENT_HTTP_PROXY', 'GLOBAL_AGENT_HTTPS_PROXY', 'npm_config_proxy', 'npm_config_https_proxy')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
  $env:NO_PROXY = '*'
  $env:NODE_USE_ENV_PROXY = '0'
  $env:RVC_DIRECT_NETWORK = '1'
}

function Test-RvcTcpPort([int]$Port) {
  $client = [Net.Sockets.TcpClient]::new()
  try {
    $pending = $client.ConnectAsync('127.0.0.1', $Port)
    return $pending.Wait(500) -and $client.Connected
  } catch { return $false }
  finally { $client.Dispose() }
}

function Test-RvcLocalReady([int]$Port, [string]$Token) {
  try {
    $options = @{ Uri = "http://127.0.0.1:$Port/healthz"; Headers = @{ Authorization = "Bearer $Token" }; TimeoutSec = 3; ErrorAction = 'Stop' }
    if ((Get-Command Invoke-RestMethod).Parameters.ContainsKey('NoProxy')) { $options.NoProxy = $true }
    $health = Invoke-RestMethod @options
    return $health.ready -eq $true
  } catch { return $false }
}

function Wait-RvcLocalReady([int]$Port, [string]$Token, [int]$TimeoutSeconds = 150) {
  $clock = [Diagnostics.Stopwatch]::StartNew()
  do {
    if (Test-RvcLocalReady $Port $Token) { return $true }
    if ($clock.Elapsed.TotalSeconds -ge $TimeoutSeconds) { break }
    Start-Sleep -Milliseconds 1000
  } while ($clock.Elapsed.TotalSeconds -lt $TimeoutSeconds)
  return $false
}

function Enter-RvcStartupMutex([string]$Name) {
  $handle = [Threading.Mutex]::new($false, $Name)
  try {
    $owned = $false
    try { $owned = $handle.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $owned = $true }
    if ($owned) { return $handle }
  } catch { $handle.Dispose(); throw }
  $handle.Dispose()
  return $null
}

function Resolve-RvcWrangler([string]$SiteDir) {
  if ($env:RVC_WRANGLER_JS) {
    if (-not (Test-Path -LiteralPath $env:RVC_WRANGLER_JS -PathType Leaf)) {
      throw 'RVC_WRANGLER_JS 指向不存在的文件。请重新指定已安装的 wrangler.js。'
    }
    return $env:RVC_WRANGLER_JS
  }
  $local = Join-Path $SiteDir 'node_modules\wrangler\bin\wrangler.js'
  if (Test-Path -LiteralPath $local -PathType Leaf) { return $local }
  $caches = @($env:npm_config_cache, 'D:\DevCaches\npm-cache')
  if ($env:LOCALAPPDATA) { $caches += Join-Path $env:LOCALAPPDATA 'npm-cache' }
  foreach ($cache in ($caches | Where-Object { $_ } | Select-Object -Unique)) {
    $found = Get-ChildItem -Path (Join-Path $cache '_npx\*\node_modules\wrangler\bin\wrangler.js') -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  throw '未找到 Wrangler。请先安装并登录 Cloudflare，或将 RVC_WRANGLER_JS 指向已安装的 wrangler.js；本地 GPU 服务将继续运行。'
}
