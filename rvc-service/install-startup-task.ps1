param([switch]$NoStart)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$admin = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Installing a boot task requires an administrator terminal.'
}
$executable = (Get-Command pwsh.exe -ErrorAction Stop).Source
$watchdog = Join-Path $PSScriptRoot 'watchdog.ps1'
if (-not (Test-Path -LiteralPath $watchdog -PathType Leaf)) { throw 'Watchdog script is missing.' }
$action = New-ScheduledTaskAction -Execute $executable -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchdog`""
# S4U runs under the existing account in session 0, without asking for or
# saving its password. Its local profile and Cloudflare authorization must
# have been verified before installation (the deployment records that check).
$principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType S4U -RunLevel Limited
$boot = New-ScheduledTaskTrigger -AtStartup
$boot.Delay = 'PT15S'
$logon = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$task = New-ScheduledTask -Action $action -Principal $principal -Trigger @($boot, $logon) -Settings $settings `
  -Description 'PostPrep GPU and public tunnel: direct network, boot recovery, no desktop VPN dependency.'
Register-ScheduledTask -TaskName 'PostPrepRvcWatchdog' -InputObject $task -Force | Out-Null
# Replace the old interactive logon launcher rather than run two controllers.
if (Get-ScheduledTask -TaskName 'PostPrep-RVC-AutoStart' -ErrorAction SilentlyContinue) {
  Disable-ScheduledTask -TaskName 'PostPrep-RVC-AutoStart' | Out-Null
}
if (-not $NoStart) { Start-ScheduledTask -TaskName 'PostPrepRvcWatchdog' }
Get-ScheduledTask -TaskName 'PostPrepRvcWatchdog' | Select-Object TaskName, State
