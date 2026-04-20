param(
  [string]$ProjectRoot = "C:/HTML apps/Truthcert1_work",
  [string]$OracleInputJson = "C:/HTML apps/Truthcert1_work/benchmark_pack/oracle_input_preregistered_v1.json",
  [string]$HtmlPath = "C:/HTML apps/Truthcert1_work/TruthCert-PairwisePro-v1.0.html",
  [string]$OutputRoot = "C:/HTML apps/Truthcert1_work/oracle_parity_runs",
  [switch]$Headless
)

$ErrorActionPreference = "Stop"

function Resolve-PythonExe {
  $candidates = @(
    "C:/Users/user/AppData/Local/Programs/Python/Python313/python.exe",
    "C:/Users/user/AppData/Local/Programs/Python/Python312/python.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  throw "Python executable not found. Update Resolve-PythonExe candidates."
}

$pythonExe = Resolve-PythonExe
$oracleRunner = Join-Path $ProjectRoot "run_oracle_benchmark.ps1"
$compareScript = Join-Path $ProjectRoot "tools/compare_app_vs_oracle.py"
$toleranceJson = Join-Path $ProjectRoot "validation_benchmarks.json"

if (-not (Test-Path -LiteralPath $oracleRunner)) {
  throw "Missing oracle runner: $oracleRunner"
}
if (-not (Test-Path -LiteralPath $compareScript)) {
  throw "Missing comparator script: $compareScript"
}
if (-not (Test-Path -LiteralPath $OracleInputJson)) {
  throw "Missing oracle input JSON: $OracleInputJson"
}
if (-not (Test-Path -LiteralPath $HtmlPath)) {
  throw "Missing app HTML: $HtmlPath"
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$runDir = Join-Path $OutputRoot "run_$stamp"
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$oracleOut = Join-Path $runDir "oracle_output.json"
$oracleLog = Join-Path $runDir "oracle_run.log"
$parityJson = Join-Path $runDir "app_vs_oracle_parity.json"
$parityMd = Join-Path $runDir "app_vs_oracle_parity.md"

Write-Output "[1/2] Running R oracle benchmark..."
& $oracleRunner -InputJson $OracleInputJson -OutputJson $oracleOut *>&1 | Tee-Object -FilePath $oracleLog | Out-Null
if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
  throw "Oracle benchmark failed with exit code $LASTEXITCODE"
}

Write-Output "[2/2] Comparing app outputs against oracle tolerances..."
$args = @(
  "-u", $compareScript,
  "--html", $HtmlPath,
  "--oracle-input", $OracleInputJson,
  "--oracle-output", $oracleOut,
  "--out-json", $parityJson,
  "--out-md", $parityMd,
  "--tolerance-json", $toleranceJson
)
if ($Headless) { $args += "--headless" }

& $pythonExe @args
if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
  throw "Parity comparison failed with exit code $LASTEXITCODE"
}

$summary = Get-Content -LiteralPath $parityJson -Raw | ConvertFrom-Json
$tot = [int]$summary.summary.total_checks
$pass = [int]$summary.summary.passed_checks
$fail = [int]$summary.summary.failed_checks
$skip = [int]$summary.summary.skipped_checks
$overall = [bool]$summary.summary.overall_pass

Write-Output "Run directory: $runDir"
Write-Output "Oracle output: $oracleOut"
Write-Output "Parity JSON: $parityJson"
Write-Output "Parity MD: $parityMd"
Write-Output "Summary: total=$tot passed=$pass failed=$fail skipped=$skip overall_pass=$overall"

if (-not $overall) {
  exit 1
}
