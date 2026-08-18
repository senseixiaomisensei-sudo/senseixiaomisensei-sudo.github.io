[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$DataRoot = "E:\PostPrep\VoiceRuntime",
    [switch]$BuildImage,
    [switch]$DownloadModel,
    [switch]$AcknowledgeModelLicense,
    [switch]$StartService,
    [ValidateRange(1024, 16384)]
    [int]$MinimumFreeGpuMiB = 5000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ServiceRoot = Split-Path -Parent $PSCommandPath
$ImageName = "postprep-voice:local"
$ContainerName = "postprep-voice"
$ModelRoot = Join-Path $DataRoot "models\CosyVoice-300M"
$StateRoot = Join-Path $DataRoot "state"
$TokenPath = Join-Path $StateRoot "voice-gateway-token.txt"
$EnvPath = Join-Path $StateRoot "voice-service.env"

function Assert-SafeDataRoot {
    param([string]$Path)

    $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd("\\")
    $volumeRoot = [System.IO.Path]::GetPathRoot($fullPath).TrimEnd("\\")
    if ([string]::IsNullOrWhiteSpace($fullPath) -or $fullPath -eq $volumeRoot -or $fullPath.Length -lt 4) {
        throw "DataRoot must be a dedicated folder, not a drive root."
    }
    return $fullPath
}

function Require-Command {
    param([string]$Name, [string]$Message)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw $Message
    }
}

function Resolve-DockerCommand {
    $command = Get-Command "docker" -ErrorAction SilentlyContinue
    if ($command) {
        $dockerPath = $command.Source
    } else {
        # A newly installed per-user Docker Desktop does not enter an already-open
        # PowerShell session's PATH until the next sign-in. Keep this helper usable
        # immediately after first-run setup without changing the user's global PATH.
        $perUserDocker = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin\docker.exe"
        if (Test-Path -LiteralPath $perUserDocker) {
            $dockerPath = $perUserDocker
        } else {
            throw "Docker Desktop is required before configuring the local voice host."
        }
    }

    # The Docker CLI resolves docker-credential-desktop through PATH. Add only
    # the installation's bin directory to this process when it is missing;
    # never mutate the user's global PATH.
    $dockerBin = Split-Path -Parent $dockerPath
    if (-not (($env:PATH -split ";") -contains $dockerBin)) {
        $env:PATH = "$dockerBin;$env:PATH"
    }
    return $dockerPath
}

function Set-OwnerOnlyFile {
    param([string]$Path)

    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) {
        [void]$acl.RemoveAccessRule($rule)
    }
    $ownerRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $identity,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        [System.Security.AccessControl.AccessControlType]::Allow
    )
    [void]$acl.AddAccessRule($ownerRule)
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Get-OrCreateGatewayToken {
    param([string]$Path)

    if (Test-Path -LiteralPath $Path) {
        $existing = (Get-Content -LiteralPath $Path -Raw).Trim()
        if ($existing.Length -lt 32) {
            throw "The existing local voice gateway token is too short. Delete only the dedicated token file and run this script again."
        }
        return $existing
    }

    $bytes = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $token = [Convert]::ToHexString($bytes).ToLowerInvariant()
    [System.IO.File]::WriteAllText($Path, "$token`n", [System.Text.UTF8Encoding]::new($false))
    Set-OwnerOnlyFile -Path $Path
    return $token
}

function Get-FreeGpuMiB {
    $raw = & nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $raw) {
        throw "NVIDIA GPU status could not be read. Start the NVIDIA driver and try again."
    }
    $value = 0
    if (-not [int]::TryParse(($raw | Select-Object -First 1).Trim(), [ref]$value)) {
        throw "NVIDIA GPU free memory could not be read."
    }
    return $value
}

function Invoke-Docker {
    param([string[]]$Arguments)

    & $script:DockerCommand @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed: docker $($Arguments -join ' ')"
    }
}

$DataRoot = Assert-SafeDataRoot -Path $DataRoot
Require-Command -Name "nvidia-smi" -Message "An NVIDIA GPU driver is required before configuring the local voice host."
$DockerCommand = Resolve-DockerCommand

& $DockerCommand version --format "{{.Server.Version}}" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop is installed but its engine is not running. Start Docker Desktop and try again."
}

New-Item -ItemType Directory -Force -Path $DataRoot, $ModelRoot, $StateRoot | Out-Null
$gatewayToken = Get-OrCreateGatewayToken -Path $TokenPath
$envContent = @(
    "VOICE_GATEWAY_TOKEN=$gatewayToken",
    "COSYVOICE_MODEL_DIR=/models/CosyVoice-300M",
    "VOICE_OUTPUT_RETENTION_SECONDS=900",
    "VOICE_MAX_CONCURRENCY=1"
) -join "`n"
[System.IO.File]::WriteAllText($EnvPath, "$envContent`n", [System.Text.UTF8Encoding]::new($false))
Set-OwnerOnlyFile -Path $EnvPath

if ($BuildImage -or $DownloadModel -or $StartService) {
    Invoke-Docker -Arguments @("build", "--tag", $ImageName, $ServiceRoot)
}

if ($DownloadModel) {
    if (-not $AcknowledgeModelLicense) {
        throw "Model download requires an explicit license review. Review the model card, then rerun with -DownloadModel -AcknowledgeModelLicense."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $ModelRoot "cosyvoice.yaml"))) {
        # CosyVoice's upstream instructions recommend ModelScope for China.
        # `modelscope` is pinned by the checked-out CosyVoice requirements.
        $downloadCode = @'
from modelscope import snapshot_download
snapshot_download('iic/CosyVoice-300M', local_dir='/models/CosyVoice-300M')
'@
        Invoke-Docker -Arguments @(
            "run", "--rm",
            "--mount", "type=bind,source=$ModelRoot,target=/models/CosyVoice-300M",
            $ImageName,
            "python3", "-c", $downloadCode
        )
    }
}

if (-not $StartService) {
    Write-Output "Local configuration is ready. The GPU service has not been started."
    exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $ModelRoot "cosyvoice.yaml"))) {
    throw "CosyVoice model files are missing. After reviewing their license, rerun with -DownloadModel -AcknowledgeModelLicense -StartService."
}

$freeGpuMiB = Get-FreeGpuMiB
if ($freeGpuMiB -lt $MinimumFreeGpuMiB) {
    throw "Only $freeGpuMiB MiB of GPU memory is free; at least $MinimumFreeGpuMiB MiB is required. Close GPU-heavy applications, then retry."
}

$existing = (& $DockerCommand ps -a --filter "name=^/$ContainerName$" --format "{{.ID}}" 2>$null | Select-Object -First 1).Trim()
if ($existing) {
    if ($PSCmdlet.ShouldProcess($ContainerName, "replace the existing dedicated PostPrep voice container")) {
        Invoke-Docker -Arguments @("rm", "--force", $ContainerName)
    } else {
        throw "The existing PostPrep voice container was not replaced."
    }
}

Invoke-Docker -Arguments @(
    "run", "--detach",
    "--name", $ContainerName,
    "--restart", "unless-stopped",
    "--gpus", "all",
    "--env-file", $EnvPath,
    "--publish", "127.0.0.1:18080:8080",
    "--mount", "type=bind,source=$ModelRoot,target=/models/CosyVoice-300M,readonly",
    $ImageName
)

$deadline = (Get-Date).AddMinutes(3)
do {
    Start-Sleep -Seconds 5
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:18080/healthz" -Headers @{ Authorization = "Bearer $gatewayToken" } -TimeoutSec 5
        if ($health.ready -eq $true) {
            Write-Output "PostPrep voice host is ready on 127.0.0.1:18080. Configure a protected tunnel before connecting it to Cloudflare Pages."
            exit 0
        }
    } catch {
        # Model loading can take longer than an HTTP request; retry until the bounded deadline.
    }
} while ((Get-Date) -lt $deadline)

& $DockerCommand logs --tail 80 $ContainerName
throw "The PostPrep voice container did not become healthy within three minutes."
