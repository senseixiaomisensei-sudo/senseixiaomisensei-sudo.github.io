param(
  [Parameter(Mandatory = $true)]
  [string]$RuntimeRoot,
  [Parameter(Mandatory = $true)]
  [string]$ModelsDir,
  [Parameter(Mandatory = $true)]
  [string]$TokenFile,
  [int]$Port = 8088
)

$ErrorActionPreference = 'Stop'
$resolvedRuntime = [System.IO.Path]::GetFullPath($RuntimeRoot)
$resolvedModels = [System.IO.Path]::GetFullPath($ModelsDir)
$resolvedToken = [System.IO.Path]::GetFullPath($TokenFile)
$officialRoot = Join-Path $resolvedRuntime 'official-rvc'
$venvPython = Join-Path $resolvedRuntime '.venv\Scripts\python.exe'
$serviceRoot = $PSScriptRoot

foreach ($required in @($officialRoot, $resolvedModels, $resolvedToken, $venvPython)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required RVC path is missing: $required"
  }
}
$token = (Get-Content -LiteralPath $resolvedToken -Raw).Trim()
if ($token.Length -lt 32) {
  throw 'RVC gateway token must contain at least 32 characters.'
}

$env:RVC_GATEWAY_TOKEN = $token
$env:RVC_MODELS_DIR = $resolvedModels
$env:RVC_OFFICIAL_ROOT = $officialRoot
$env:RVC_RUNTIME_CACHE = 'D:\rvc-cache'
$env:RVC_WORK_ROOT = Join-Path $resolvedRuntime 'work'
$env:RVC_OUTPUT_ROOT = Join-Path $resolvedRuntime 'output'
$env:RVC_SEPARATOR_MODELS_DIR = Join-Path $resolvedRuntime 'pymss-models'
$env:RVC_SEPARATOR_MODEL = 'model_bs_roformer_ep_368_sdr_12.9628.ckpt'
$env:RVC_SEPARATOR_DEVICE = 'cuda'
$env:RVC_MAX_CONCURRENCY = '1'
$env:PYTHONPATH = $serviceRoot

Write-Host "Starting official RVC 2.3.260718 on 127.0.0.1:$Port"
& $venvPython -m uvicorn app.main:app --app-dir $serviceRoot --host 127.0.0.1 --port $Port --no-access-log
