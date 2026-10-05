# Optional isolated TTS runtime. Model installation stays an explicit website action.
param([string]$RuntimeRoot='D:\rvc-cache\postprep-tts-runtime', [string]$RvcPython='D:\数据\rvc-runtime\.venv\Scripts\python.exe')
$ErrorActionPreference='Stop'
if(-not(Test-Path -LiteralPath $RvcPython)){throw 'RVC Python runtime is missing'}
$taskRuntime=[IO.Path]::GetFullPath($RuntimeRoot)
$taskPython=Join-Path $taskRuntime 'Scripts\python.exe'
if(-not(Test-Path -LiteralPath $taskPython)){
  & $RvcPython -m venv $taskRuntime
  if($LASTEXITCODE -ne 0){throw 'Failed to create TTS environment'}
}
$sharedPackages=Join-Path (Split-Path (Split-Path $RvcPython)) 'Lib\site-packages'
[IO.File]::WriteAllText((Join-Path $taskRuntime 'Lib\site-packages\postprep_shared_runtime.pth'),($sharedPackages+"`n"),[Text.UTF8Encoding]::new($false))
# Inherit CUDA Torch and common audio packages; overlay only TTS-specific dependencies.
& uv --no-config pip install --python $taskPython --no-deps -r (Join-Path $PSScriptRoot 'tts-requirements.txt')
if($LASTEXITCODE -ne 0){throw 'Failed to install TTS dependencies'}
$taskSource=Join-Path $taskRuntime 'CosyVoice'
if(-not(Test-Path -LiteralPath $taskSource)){
  & git clone --filter=blob:none --no-checkout https://github.com/QwenAudio/CosyVoice.git $taskSource
  if($LASTEXITCODE -ne 0){throw 'Failed to fetch official CosyVoice'}
}
& git -C $taskSource checkout --detach 074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc
if($LASTEXITCODE -ne 0){throw 'Failed to pin official CosyVoice'}
& git -C $taskSource submodule update --init --depth 1 third_party/Matcha-TTS
if($LASTEXITCODE -ne 0){throw 'Failed to fetch pinned Matcha source'}
Write-Output "TTS runtime prepared: $taskPython. Download and verify a model through the TTS controls."
