param(
  [Parameter(Mandatory = $true)]
  [string]$InstallRoot,
  [string]$VenvRoot = ''
)

$ErrorActionPreference = 'Stop'
$OfficialCommit = '8f2fdbf483955f924b4c87ab34919170d0b704ed'
$OfficialRepository = 'https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI.git'
$HuggingFaceRevision = 'e6d0c1a17da07c33557852f9dfa2bd44cc75737d'
$HubertSha256 = 'cc8c20f4b90a520757260197a3ff2505705a7adbd20ad9eeaa4e1a9b38442ef5'
$RmvpeSha256 = '6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193'

$resolvedRoot = [System.IO.Path]::GetFullPath($InstallRoot)
if ([System.IO.Path]::GetPathRoot($resolvedRoot) -eq $resolvedRoot) {
  throw 'InstallRoot must not be a drive root.'
}
if (-not (Test-Path -LiteralPath $resolvedRoot)) {
  New-Item -ItemType Directory -Path $resolvedRoot | Out-Null
}

$gitDirectory = Join-Path $resolvedRoot '.git'
if (-not (Test-Path -LiteralPath $gitDirectory)) {
  if ((Get-ChildItem -LiteralPath $resolvedRoot -Force | Measure-Object).Count -ne 0) {
    throw "InstallRoot exists and is not an empty Git checkout: $resolvedRoot"
  }
  git clone --filter=blob:none --no-checkout $OfficialRepository $resolvedRoot
}
git -C $resolvedRoot fetch --depth 1 origin $OfficialCommit
git -C $resolvedRoot checkout --detach $OfficialCommit
$actualCommit = (git -C $resolvedRoot rev-parse HEAD).Trim()
if ($actualCommit -ne $OfficialCommit) {
  throw "Official source commit mismatch: $actualCommit"
}
Set-Content -LiteralPath (Join-Path $resolvedRoot '.postprep-rvc-commit') -Value $OfficialCommit -Encoding ascii

$hubertRoot = Join-Path $resolvedRoot 'assets\hubert_base'
New-Item -ItemType Directory -Path $hubertRoot -Force | Out-Null
$downloads = @(
  @('hubert_base/config.json', (Join-Path $hubertRoot 'config.json'), 1492, ''),
  @('hubert_base/preprocessor_config.json', (Join-Path $hubertRoot 'preprocessor_config.json'), 225, ''),
  @('hubert_base/pytorch_model.bin', (Join-Path $hubertRoot 'pytorch_model.bin'), 189206711, $HubertSha256),
  @('rmvpe.pt', (Join-Path $resolvedRoot 'rmvpe.pt'), 181184272, $RmvpeSha256)
)
foreach ($item in $downloads) {
  $remotePath, $destination, $expectedSize, $expectedHash = $item
  $needsDownload = -not (Test-Path -LiteralPath $destination) -or (Get-Item -LiteralPath $destination).Length -ne $expectedSize
  if ($needsDownload) {
    $url = "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/${HuggingFaceRevision}/${remotePath}?download=true"
    Invoke-WebRequest -Uri $url -OutFile $destination -UseBasicParsing
  }
  $actualSize = (Get-Item -LiteralPath $destination).Length
  if ($actualSize -ne $expectedSize) {
    throw "Official asset size mismatch: $destination ($actualSize != $expectedSize)"
  }
  if ($expectedHash) {
    $actualHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
      throw "Official asset SHA-256 mismatch: $destination"
    }
  }
}
Write-Host "Pinned official RVC runtime ready: $resolvedRoot @ $OfficialCommit"

$runtimeParent = Split-Path -Parent $resolvedRoot
if (-not $VenvRoot) {
  $VenvRoot = Join-Path $runtimeParent '.venv'
}
$resolvedVenv = [System.IO.Path]::GetFullPath($VenvRoot)
$env:UV_NO_CONFIG = '1'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $runtimeParent 'python'
uv python install 3.12
uv venv --python 3.12 $resolvedVenv
$venvPython = Join-Path $resolvedVenv 'Scripts\python.exe'
uv pip install --python $venvPython torch==2.7.1+cu128 torchaudio==2.7.1+cu128 --index-url https://download.pytorch.org/whl/cu128
uv pip install --python $venvPython -r (Join-Path $PSScriptRoot 'requirements.txt')
Write-Host "Official RVC Python environment ready: $resolvedVenv"
