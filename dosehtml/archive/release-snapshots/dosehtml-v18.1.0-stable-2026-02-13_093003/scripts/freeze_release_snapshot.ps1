param(
  [string]$Version = "18.1.0",
  [string]$ReleaseTag = "stable",
  [switch]$IncludeNodeModules
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$snapshotName = "dosehtml-v$Version-$ReleaseTag-$timestamp"
$snapshotRoot = Join-Path $projectRoot "archive\release-snapshots"
$snapshotDir = Join-Path $snapshotRoot $snapshotName
$zipPath = Join-Path $snapshotRoot "$snapshotName.zip"

New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null

$itemsToCapture = @(
  "dose-response-pro.html",
  "dose-response-worker.js",
  "dose-response-cli.py",
  "selenium_full_test.py",
  "test_dose_response_main.py",
  "test_dose_response_app.py",
  "test_v19_comprehensive.py",
  "_run_full_validation_suite.py",
  "sample_dose_response_data.csv",
  "README.md",
  "package.json",
  "package-lock.json",
  "requirements-ci.txt",
  ".github/workflows/ci.yml",
  "scripts/freeze_release_snapshot.ps1"
)

if ($IncludeNodeModules) {
  $itemsToCapture += "node_modules"
}

$copied = @()
$missing = @()

foreach ($item in $itemsToCapture) {
  $sourcePath = Join-Path $projectRoot $item
  if (-not (Test-Path $sourcePath)) {
    $missing += $item
    continue
  }

  $destPath = Join-Path $snapshotDir $item
  $destParent = Split-Path -Parent $destPath
  if ($destParent) {
    New-Item -ItemType Directory -Path $destParent -Force | Out-Null
  }

  if ((Get-Item $sourcePath).PSIsContainer) {
    Copy-Item -Path $sourcePath -Destination $destPath -Recurse -Force
  } else {
    Copy-Item -Path $sourcePath -Destination $destPath -Force
  }
  $copied += $item
}

$hashLines = @(
  "# SHA256 manifest",
  "# Generated: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))",
  ""
)

Get-ChildItem -Path $snapshotDir -Recurse -File |
  Sort-Object FullName |
  ForEach-Object {
    $relative = $_.FullName.Substring($snapshotDir.Length).TrimStart('\').Replace('\', '/')
    $hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $hashLines += "$hash  $relative"
  }

$manifestPath = Join-Path $snapshotDir "SHA256SUMS.txt"
Set-Content -Path $manifestPath -Value ($hashLines -join [Environment]::NewLine) -Encoding UTF8

$metadata = [ordered]@{
  snapshot_name = $snapshotName
  version = $Version
  release_tag = $ReleaseTag
  created_at_utc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  source_root = $projectRoot
  files_copied = $copied.Count
  files_missing = $missing.Count
  captured_items = $copied
  missing_items = $missing
  sha256_manifest = "SHA256SUMS.txt"
}

$metadataPath = Join-Path $snapshotDir "release_metadata.json"
Set-Content -Path $metadataPath -Value ($metadata | ConvertTo-Json -Depth 8) -Encoding UTF8

if (Test-Path $zipPath) {
  Remove-Item -Path $zipPath -Force
}

Compress-Archive -Path (Join-Path $snapshotDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Output "SNAPSHOT_DIR=$snapshotDir"
Write-Output "SNAPSHOT_ZIP=$zipPath"
Write-Output "COPIED_ITEMS=$($copied.Count)"
Write-Output "MISSING_ITEMS=$($missing.Count)"
