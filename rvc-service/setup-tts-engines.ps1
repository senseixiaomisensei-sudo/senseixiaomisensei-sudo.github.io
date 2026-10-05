# Optional isolated TTS runtime. Model installation stays an explicit website action.
param([string]$RuntimeRoot='D:\rvc-cache\postprep-tts-runtime', [string]$IndexRuntimeRoot='D:\rvc-cache\postprep-indextts-runtime', [string]$RvcPython='D:\数据\rvc-runtime\.venv\Scripts\python.exe')
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
$taskIndexRuntime=[IO.Path]::GetFullPath($IndexRuntimeRoot)
$taskIndexPython=Join-Path $taskIndexRuntime 'Scripts\python.exe'
if(-not(Test-Path -LiteralPath $taskIndexPython)){
  & $RvcPython -m venv $taskIndexRuntime
  if($LASTEXITCODE -ne 0){throw 'Failed to create IndexTTS environment'}
}
$indexShared=(Join-Path $taskRuntime 'Lib\site-packages')+"`n"+$sharedPackages+"`n"
[IO.File]::WriteAllText((Join-Path $taskIndexRuntime 'Lib\site-packages\postprep_shared_runtime.pth'),$indexShared,[Text.UTF8Encoding]::new($false))
& uv --no-config pip install --python $taskIndexPython --no-deps -r (Join-Path $PSScriptRoot 'index-tts-requirements.txt')
if($LASTEXITCODE -ne 0){throw 'Failed to install IndexTTS dependencies'}
$taskSource=Join-Path $taskRuntime 'IndexTTS'
if(-not(Test-Path -LiteralPath $taskSource)){
  & git clone --filter=blob:none --no-checkout https://github.com/index-tts/index-tts.git $taskSource
  if($LASTEXITCODE -ne 0){throw 'Failed to fetch official IndexTTS'}
}
& git -C $taskSource checkout --detach d9e41aac89fd00b3d71497fddb287b7f24613712
if($LASTEXITCODE -ne 0){throw 'Failed to pin official IndexTTS'}
Write-Output "TTS runtimes prepared: $taskPython and $taskIndexPython. Model downloads remain explicit."
