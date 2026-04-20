param(
  [string]$ProjectRoot = "C:/HTML apps/Truthcert1_work",
  [string]$OracleInputJson = "C:/HTML apps/Truthcert1_work/benchmark_pack/oracle_input_advanced_v1.json",
  [string]$HtmlPath = "C:/HTML apps/Truthcert1_work/TruthCert-PairwisePro-v1.0.html",
  [string]$OutputRoot = "C:/HTML apps/Truthcert1_work/oracle_parity_runs/advanced",
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

function Resolve-RscriptExe {
  $candidates = @(
    "C:/Program Files/R/R-4.5.2/bin/Rscript.exe",
    "C:/Program Files/R/R-4.5.2/bin/x64/Rscript.exe",
    "C:/Program Files/R/R-4.4.0/bin/Rscript.exe",
    "C:/Program Files/R/R-4.4.0/bin/x64/Rscript.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  throw "Rscript.exe not found. Update Resolve-RscriptExe candidates."
}

$pythonExe = Resolve-PythonExe
$rscriptExe = Resolve-RscriptExe
$oracleScript = Join-Path $ProjectRoot "R_oracle_advanced_benchmark.R"
$compareScript = Join-Path $ProjectRoot "tools/compare_advanced_vs_oracle.py"

if (-not (Test-Path -LiteralPath $oracleScript)) {
  throw "Missing advanced oracle script: $oracleScript"
}
if (-not (Test-Path -LiteralPath $compareScript)) {
  throw "Missing advanced comparator script: $compareScript"
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

$oracleOut = Join-Path $runDir "oracle_advanced_output.json"
$oracleLog = Join-Path $runDir "oracle_advanced_run.log"
$parityJson = Join-Path $runDir "advanced_app_vs_oracle_parity.json"
$parityMd = Join-Path $runDir "advanced_app_vs_oracle_parity.md"

Write-Output "[1/2] Running advanced R oracle benchmark..."
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $rscriptExe $oracleScript $OracleInputJson $oracleOut *>&1 | Tee-Object -FilePath $oracleLog | Out-Null
$rExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($rExitCode -ne $null -and $rExitCode -ne 0) {
  throw "Advanced oracle benchmark failed with exit code $rExitCode"
}

Write-Output "[2/2] Comparing advanced app outputs against oracle tolerances..."
$args = @(
  "-u", $compareScript,
  "--html", $HtmlPath,
  "--oracle-input", $OracleInputJson,
  "--oracle-output", $oracleOut,
  "--out-json", $parityJson,
  "--out-md", $parityMd
)
if ($Headless) { $args += "--headless" }

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $pythonExe @args
$pyExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($pyExitCode -ne $null -and $pyExitCode -ne 0) {
  throw "Advanced parity comparison failed with exit code $pyExitCode"
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
