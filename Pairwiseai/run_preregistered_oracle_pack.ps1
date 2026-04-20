param(
  [string]$ProjectRoot = "C:/HTML apps/Truthcert1_work",
  [string]$OutputRoot = "C:/HTML apps/Truthcert1_work/independent_runs",
  [string]$InputJson = "C:/HTML apps/Truthcert1_work/benchmark_pack/oracle_input_preregistered_v1.json"
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$runDir = Join-Path $OutputRoot "independent_oracle_$timestamp"
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$oracleScript = Join-Path $ProjectRoot "run_oracle_benchmark.ps1"
$manifest = Join-Path $ProjectRoot "benchmark_pack/benchmark_pack_manifest_v1.json"
$protocol = Join-Path $ProjectRoot "governance/PREREGISTERED_ORACLE_PROTOCOL_V1_2026-02-26.md"

if (-not (Test-Path -LiteralPath $oracleScript)) { throw "Missing $oracleScript" }
if (-not (Test-Path -LiteralPath $InputJson)) { throw "Missing $InputJson" }
if (-not (Test-Path -LiteralPath $manifest)) { throw "Missing $manifest" }
if (-not (Test-Path -LiteralPath $protocol)) { throw "Missing $protocol" }

Copy-Item -LiteralPath $InputJson -Destination (Join-Path $runDir "oracle_input_preregistered_v1.json") -Force
Copy-Item -LiteralPath $manifest -Destination (Join-Path $runDir "benchmark_pack_manifest_v1.json") -Force
Copy-Item -LiteralPath $protocol -Destination (Join-Path $runDir "PREREGISTERED_ORACLE_PROTOCOL_V1_2026-02-26.md") -Force

$oracleOut = Join-Path $runDir "oracle_output.json"
$oracleLog = Join-Path $runDir "oracle_run.log"

& $oracleScript -InputJson $InputJson -OutputJson $oracleOut *>&1 | Tee-Object -FilePath $oracleLog
if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
  throw "Oracle run failed with exit code $LASTEXITCODE"
}

$hashRows = @()
foreach ($file in @(
  (Join-Path $runDir "oracle_input_preregistered_v1.json"),
  (Join-Path $runDir "benchmark_pack_manifest_v1.json"),
  (Join-Path $runDir "PREREGISTERED_ORACLE_PROTOCOL_V1_2026-02-26.md"),
  $oracleOut,
  $oracleLog,
  (Join-Path $ProjectRoot "TruthCert-PairwisePro-v1.0.html"),
  (Join-Path $ProjectRoot "expert_upgrade_additions.js")
)) {
  if (Test-Path -LiteralPath $file) {
    $h = Get-FileHash -Algorithm SHA256 -LiteralPath $file
    $hashRows += [pscustomobject]@{ file = $file; sha256 = $h.Hash }
  }
}

$hashCsv = Join-Path $runDir "checksum_manifest.csv"
$hashRows | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $hashCsv

$summary = @()
$summary += "# Independent Oracle Rerun Summary"
$summary += ""
$summary += "Run timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$summary += "Run folder: $runDir"
$summary += ""
$summary += "## Protocol"
$summary += "- preregistered protocol copied into run folder"
$summary += "- benchmark manifest copied into run folder"
$summary += ""
$summary += "## Outputs"
$summary += "- oracle output: $oracleOut"
$summary += "- oracle log: $oracleLog"
$summary += "- checksum manifest: $hashCsv"

$summaryPath = Join-Path $runDir "independent_oracle_summary.md"
$summary -join "`n" | Set-Content -Encoding UTF8 $summaryPath

Write-Output "Independent oracle rerun completed: $runDir"
