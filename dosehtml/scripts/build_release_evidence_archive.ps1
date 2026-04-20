param(
  [string]$DateTag = "2026-02-28"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $projectRoot "archive\release-evidence\$DateTag"

if (Test-Path $dest) {
  Remove-Item -Recurse -Force $dest
}
New-Item -ItemType Directory -Path $dest -Force | Out-Null

$files = @(
  "README.md",
  "CHANGELOG.md",
  "dose-response-pro.html",
  "scripts/build_release_readiness_summary.py",
  "docs/RELEASE_NOTES_$DateTag.md",
  "docs/RSM_MANUSCRIPT_DRAFT_$DateTag.md",
  "docs/REPRODUCIBILITY_APPENDIX_$DateTag.md",
  "docs/RSM_SUBMISSION_CHECKLIST_$DateTag.md",
  "docs/CROSS_PACKAGE_MULTIPERSONA_REVIEW_$DateTag.md",
  "docs/STRICT_BEAT_R_BENCHMARK_$DateTag.md",
  "tests/r_validation_results.json",
  "tests/r_validation_results.txt",
  "tests/r_simulation_benchmark_results.json",
  "tests/strict_beat_r_benchmark_results.json",
  "tests/cross_package_benchmark_results.json",
  "tests/release_validation_$DateTag/test_dose_response_app.log",
  "tests/release_validation_$DateTag/test_dose_response_main.log",
  "tests/release_validation_$DateTag/selenium_full_test.log",
  "tests/release_validation_$DateTag/release_readiness_summary.json"
)

$copied = @()
$missing = @()

foreach ($rel in $files) {
  $src = Join-Path $projectRoot $rel
  if (-not (Test-Path $src)) {
    $missing += $rel
    continue
  }

  $target = Join-Path $dest $rel
  $parent = Split-Path -Parent $target
  if ($parent) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  Copy-Item -Path $src -Destination $target -Force
  $copied += $rel
}

$shaPath = Join-Path $dest "SHA256SUMS.txt"
$shaLines = @(
  "# SHA256 manifest"
  "# Generated: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"
  ""
)

Get-ChildItem -Path $dest -Recurse -File |
  Where-Object { $_.FullName -ne $shaPath } |
  Sort-Object FullName |
  ForEach-Object {
    $relative = $_.FullName.Substring($dest.Length + 1).Replace('\', '/')
    $hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $shaLines += "$hash  $relative"
  }

Set-Content -Path $shaPath -Value ($shaLines -join [Environment]::NewLine) -Encoding UTF8

$metadata = [ordered]@{
  generated_at_utc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  date_tag = $DateTag
  archive_path = $dest
  files_copied = $copied.Count
  files_missing = $missing.Count
  copied = $copied
  missing = $missing
  manifest = "SHA256SUMS.txt"
}

$metadataPath = Join-Path $dest "release_evidence_metadata.json"
Set-Content -Path $metadataPath -Value ($metadata | ConvertTo-Json -Depth 6) -Encoding UTF8

Write-Output "ARCHIVE_PATH=$dest"
Write-Output "COPIED_FILES=$($copied.Count)"
Write-Output "MISSING_FILES=$($missing.Count)"
