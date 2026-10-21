param(
  [Parameter(Mandatory)][string]$Executable,
  [Parameter(Mandatory)][string]$OriginUrl,
  [Parameter(Mandatory)][string]$Protocol,
  [Parameter(Mandatory)][string]$RegistrationUrl,
  [Parameter(Mandatory)][string]$LogPath
)
. (Join-Path $PSScriptRoot 'startup_health.ps1')
Set-RvcDirectNetwork
$PSNativeCommandUseErrorActionPreference = $false
$cloudArgs = @('tunnel','--url',$OriginUrl,'--no-autoupdate','--protocol',$Protocol,
               '--quick-service',$RegistrationUrl)
# Start-Process with a new hidden console makes this Go binary fail DLL
# initialization (0xC0000142) in S4U/session 0. Native invocation inherits
# this already hidden runner's console and keeps both log streams alive.
& $Executable @cloudArgs 1> $LogPath 2> "$LogPath.err"
exit $LASTEXITCODE
