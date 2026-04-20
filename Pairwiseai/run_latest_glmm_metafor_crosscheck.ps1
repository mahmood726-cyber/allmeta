param(
  [string]$ScriptPath = '',
  [string]$RscriptPath = ''
)

$ErrorActionPreference = 'Stop'

function Resolve-Rscript {
  param([string]$UserPath)

  if ($UserPath -and (Test-Path -LiteralPath $UserPath)) {
    return (Resolve-Path -LiteralPath $UserPath).Path
  }

  if ($env:R_HOME) {
    $candidate = Join-Path $env:R_HOME 'bin\Rscript.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }

  $defaultRoots = @('C:\Program Files\R', 'C:\Program Files (x86)\R')
  foreach ($root in $defaultRoots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $candidates = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending
    foreach ($dir in $candidates) {
      $candidate = Join-Path $dir.FullName 'bin\Rscript.exe'
      if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
  }

  throw 'Rscript.exe not found. Provide -RscriptPath explicitly.'
}

function Resolve-ScriptPath {
  param([string]$UserScript)

  if ($UserScript) {
    if (-not (Test-Path -LiteralPath $UserScript)) {
      throw "Specified script not found: $UserScript"
    }
    return (Resolve-Path -LiteralPath $UserScript).Path
  }

  $latest = Get-ChildItem -LiteralPath (Get-Location).Path -Filter 'truthcert_glmm_metafor_crosscheck_*.R' -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $latest) {
    throw 'No exported GLMM cross-check script found in current directory.'
  }

  return $latest.FullName
}

$resolvedScript = Resolve-ScriptPath -UserScript $ScriptPath
$resolvedRscript = Resolve-Rscript -UserPath $RscriptPath

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$logFile = "truthcert_glmm_metafor_run_$timestamp.log"

Write-Host "[TruthCert] Running external GLMM cross-check"
Write-Host "[TruthCert] Rscript : $resolvedRscript"
Write-Host "[TruthCert] Script  : $resolvedScript"
Write-Host "[TruthCert] Log     : $logFile"

#
# R may write package startup messages to stderr (e.g., "Loading required package"),
# which should not fail this wrapper. Fail only on non-zero process exit.
#
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $resolvedRscript $resolvedScript *>&1 | Tee-Object -FilePath $logFile
$exitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference

if ($exitCode -ne $null -and $exitCode -ne 0) {
  throw "[TruthCert] GLMM cross-check script failed with exit code $exitCode"
}

Write-Host "[TruthCert] Completed."
