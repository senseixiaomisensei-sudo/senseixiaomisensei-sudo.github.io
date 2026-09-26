# Deploy current tree to Cloudflare Pages (project: postprep) from a CLEAN git checkout.
#
# Why not deploy the working directory directly:
#   1. The working dir contains .gitignore'd local build artifacts (*.onnx, up to 360 MB).
#   2. One TRACKED file exceeds the Cloudflare Pages hard limit of 25 MiB per file:
#      assets/rvc-engine/ort126/ort-wasm-simd-threaded.jsep.wasm (26,239,907 bytes).
#      Production already serves an HTML fallback for that path, so skipping it is not a regression.
#
# This script checks out HEAD into a temporary git worktree, removes any oversized tracked
# files, deploys from there, then cleans up. The main working directory is never touched.
#
# Usage: powershell -ExecutionPolicy Bypass -File tools\deploy-pages.ps1 [-ProjectName postprep] [-Branch main]

param(
  [string]$ProjectName = "postprep",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$StagingRoot = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot "..\部署临时"))
New-Item -ItemType Directory -Force -Path $StagingRoot | Out-Null
$StagingParent = [System.IO.Path]::GetFullPath((Join-Path $StagingRoot ("postprep-pages-" + [guid]::NewGuid().ToString("N").Substring(0, 8))))
if (-not $StagingParent.StartsWith($StagingRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Deployment staging path escaped its intended directory"
}
$MaxFileBytes = 25 * 1024 * 1024

& git -C $RepoRoot worktree prune
& git -C $RepoRoot worktree add $StagingParent $Branch --detach
if ($LASTEXITCODE -ne 0) { throw "git worktree add failed" }

try {
  Get-ChildItem $StagingParent -Recurse -File | Where-Object { $_.Length -gt $MaxFileBytes } | ForEach-Object {
    $relative = $_.FullName.Substring($StagingParent.Length + 1)
    $mib = [math]::Round($_.Length / 1MB, 1)
    Write-Host "skip (>25MiB): $relative [$mib MiB]"
    Remove-Item -LiteralPath $_.FullName -Force
  }
  Push-Location $StagingParent
  try {
    $cleanDnsCjs = Join-Path $RepoRoot "rvc-service\clean-cf-dns.cjs"
    $oldNodeOptions = $env:NODE_OPTIONS
    if (Test-Path $cleanDnsCjs) {
      $cleanDnsNormalized = ($cleanDnsCjs -replace '\\', '/')
      $env:NODE_OPTIONS = "-r `"$cleanDnsNormalized`""
    }
    try {
      npx --yes wrangler@4 pages deploy . --project-name $ProjectName --branch $Branch
      if ($LASTEXITCODE -ne 0) { throw "wrangler pages deploy failed" }
    } finally {
      $env:NODE_OPTIONS = $oldNodeOptions
    }
  } finally {
    Pop-Location
  }
} finally {
  & git -C $RepoRoot worktree remove $StagingParent --force
  & git -C $RepoRoot worktree prune
}
