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
  $recoveryProcess = $null
  $recoveryStartedAt = $null
  while ($true) {
    if ($recoveryProcess -and $recoveryProcess.HasExited) {
      if ($recoveryProcess.ExitCode -eq 0) {
        Write-WatchdogLog "automatic recovery command finished"
      } else {
        Write-WatchdogLog "automatic recovery exited with code $($recoveryProcess.ExitCode)"
      }
      $recoveryProcess = $null
      $recoveryStartedAt = $null
    } elseif ($recoveryProcess -and $recoveryStartedAt -and ((Get-Date) - $recoveryStartedAt).TotalSeconds -ge 180) {
      # A recovery must never leave this monitor blocked indefinitely.  Stop
      # the stale launcher after its bounded startup window; the next failed
      # probe can then launch a clean service/tunnel synchronization.
      Stop-Process -Id $recoveryProcess.Id -Force -ErrorAction SilentlyContinue
      Write-WatchdogLog "automatic recovery exceeded 180 seconds and was stopped"
      $recoveryProcess = $null
      $recoveryStartedAt = $null
    }

    $healthy = $false
    $localHealthy = $false
    try {
      $token = (Get-Content -LiteralPath $TokenFile -Raw).Trim()
      $local = Invoke-RestMethod -Uri "http://127.0.0.1:8088/healthz" -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 5
      if ($local.ready -eq $true) {
        $localHealthy = $true
        $public = Invoke-RestMethod -Uri $PublicStatus -Headers @{ Origin = $Origin } -TimeoutSec 15
        $healthy = ($public.ready -eq $true)
      }
    } catch {
      $healthy = $false
    }

    if ($healthy) {
      if ($failures -gt 0) { Write-WatchdogLog "service recovered without restart" }
      $failures = 0
    } elseif (-not $localHealthy) {
      # At logon there is no value in waiting through two public probes when
      # the loopback GPU service is definitively absent. Start the complete
      # service/tunnel/Worker sync immediately; transient public probe failures
      # still retain the normal two-strike protection below.
      $failures = $FailureThreshold
      Write-WatchdogLog "local service is offline; immediate startup recovery"
    } else {
      $failures += 1
      Write-WatchdogLog "health check failed ($failures/$FailureThreshold)"
    }

    if ($failures -ge $FailureThreshold) {
      if (Test-Path -LiteralPath $StartScript) {
        if ($recoveryProcess -and -not $recoveryProcess.HasExited) {
          Write-WatchdogLog "automatic recovery is still running; waiting for its bounded startup window"
        } else {
          try {
            # Run recovery out-of-process so a stalled wrangler/cloudflared
            # child cannot freeze health monitoring during a tunnel outage.
            $recoveryProcess = Start-Process -FilePath "pwsh.exe" -ArgumentList @(
              "-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass",
              "-File", $StartScript, "-NoWatchdog"
            ) -WindowStyle Hidden -PassThru
            $recoveryStartedAt = Get-Date
            Write-WatchdogLog "automatic recovery launched (pid $($recoveryProcess.Id))"
          } catch {
            Write-WatchdogLog "automatic recovery launch failed: $($_.Exception.Message)"
            $recoveryProcess = $null
            $recoveryStartedAt = $null
          }
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
