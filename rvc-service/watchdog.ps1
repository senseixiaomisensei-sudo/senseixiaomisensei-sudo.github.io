param(
  [int]$IntervalSeconds = 20,
  [int]$FailureThreshold = 2
)

$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$MachineRoot = Join-Path (Split-Path -Parent $RepoRoot) "rvc-local"
$StartScript = Join-Path $MachineRoot "start-all.ps1"
$TokenFile = Join-Path $MachineRoot ".gateway-token"
$LogFile = Join-Path $MachineRoot "watchdog.log"
$PidFile = Join-Path $MachineRoot "watchdog.pid"
$PublicStatus = "https://postprep-ae6.pages.dev/rvc-api/status"
$Origin = "https://senseixiaomisensei-sudo.github.io"

function Write-WatchdogLog([string]$message) {
  Add-Content -LiteralPath $LogFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message" -Encoding UTF8
}

$createdNew = $false
$mutex = New-Object Threading.Mutex($true, "Local\PostPrepRvcWatchdog", [ref]$createdNew)
if (-not $createdNew) { exit 0 }

try {
  Set-Content -LiteralPath $PidFile -Value $PID -NoNewline -Encoding ASCII
  Write-WatchdogLog "watchdog started"
  $failures = 0
  while ($true) {
    $healthy = $false
    try {
      $token = (Get-Content -LiteralPath $TokenFile -Raw).Trim()
      $local = Invoke-RestMethod -Uri "http://127.0.0.1:8088/healthz" -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 5
      if ($local.ready -eq $true) {
        $public = Invoke-RestMethod -Uri $PublicStatus -Headers @{ Origin = $Origin } -TimeoutSec 15
        $healthy = ($public.ready -eq $true)
      }
    } catch {
      $healthy = $false
    }

    if ($healthy) {
      if ($failures -gt 0) { Write-WatchdogLog "service recovered without restart" }
      $failures = 0
    } else {
      $failures += 1
      Write-WatchdogLog "health check failed ($failures/$FailureThreshold)"
    }

    if ($failures -ge $FailureThreshold) {
      if (Test-Path -LiteralPath $StartScript) {
        Write-WatchdogLog "starting automatic recovery"
        try {
          & pwsh -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $StartScript -NoWatchdog *>> $LogFile
          Write-WatchdogLog "automatic recovery command finished"
        } catch {
          Write-WatchdogLog "automatic recovery failed: $($_.Exception.Message)"
        }
      } else {
        Write-WatchdogLog "start script missing: $StartScript"
      }
      $failures = 0
      Start-Sleep -Seconds 60
    } else {
      Start-Sleep -Seconds ([Math]::Max(10, $IntervalSeconds))
    }
  }
} finally {
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  if ($mutex) {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
  }
}
