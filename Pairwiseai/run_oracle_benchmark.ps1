param(
  [string]$InputJson = "C:/HTML apps/Truthcert1_work/oracle_input.json",
  [string]$OutputJson = "C:/HTML apps/Truthcert1_work/oracle_output.json"
)

$ErrorActionPreference = "Stop"

function Test-OracleOutput {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Oracle output not found: $Path"
  }

  $payload = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  $requestedMethods = @()
  if ($payload.pairwise_methods_requested) {
    $requestedMethods = @($payload.pairwise_methods_requested)
  }

  $pairwiseFailures = @()
  $missingMethods = @()
  $glmmFailures = @()
  foreach ($ds in @($payload.datasets)) {
    $datasetName = if ($ds.name) { [string]$ds.name } else { "unknown_dataset" }
    $pairwise = $ds.pairwise
    if ($pairwise) {
      foreach ($prop in $pairwise.PSObject.Properties) {
        $methodName = [string]$prop.Name
        $methodObj = $prop.Value
        if ($methodObj -and $methodObj.error) {
          $message = if ($methodObj.message) { [string]$methodObj.message } else { [string]$methodObj.error }
          $pairwiseFailures += "${datasetName}/${methodName}: $message"
        }
      }

      foreach ($method in $requestedMethods) {
        if (-not ($pairwise.PSObject.Properties.Name -contains [string]$method)) {
          $missingMethods += "$datasetName/$method"
        }
      }
    } elseif ($requestedMethods.Count -gt 0) {
      foreach ($method in $requestedMethods) {
        $missingMethods += "$datasetName/$method"
      }
    }

    if ($ds.glmm -and $ds.glmm.error) {
      $glmmMessage = if ($ds.glmm.message) { [string]$ds.glmm.message } else { [string]$ds.glmm.error }
      $glmmFailures += "${datasetName}: $glmmMessage"
    }
  }

  return [pscustomobject]@{
    pairwise_failures = $pairwiseFailures
    missing_methods = $missingMethods
    glmm_failures = $glmmFailures
  }
}

$rscriptCandidates = @(
  "C:/Program Files/R/R-4.5.2/bin/Rscript.exe",
  "C:/Program Files/R/R-4.5.2/bin/x64/Rscript.exe",
  "C:/Program Files/R/R-4.4.0/bin/Rscript.exe",
  "C:/Program Files/R/R-4.4.0/bin/x64/Rscript.exe"
)

$rscript = $rscriptCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $rscript) {
  throw "Rscript.exe not found in Program Files. Update candidates in run_oracle_benchmark.ps1."
}

$scriptPath = "C:/HTML apps/Truthcert1_work/R_oracle_pairwise_benchmark.R"
if (-not (Test-Path $scriptPath)) {
  throw "Benchmark script not found: $scriptPath"
}

#
# Run R oracle script. R warnings may be emitted on stderr; only non-zero
# process exit should fail the benchmark runner.
#
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $rscript $scriptPath $InputJson $OutputJson
$exitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($exitCode -ne $null -and $exitCode -ne 0) {
  throw "Oracle benchmark failed with exit code $exitCode"
}

$oracleCheck = Test-OracleOutput -Path $OutputJson
$pairwiseFailureCount = @($oracleCheck.pairwise_failures).Count
$missingMethodCount = @($oracleCheck.missing_methods).Count
$glmmFailureCount = @($oracleCheck.glmm_failures).Count

if ($pairwiseFailureCount -gt 0 -or $missingMethodCount -gt 0 -or $glmmFailureCount -gt 0) {
  $messages = @()
  if ($pairwiseFailureCount -gt 0) {
    $messages += "pairwise failures=$pairwiseFailureCount"
  }
  if ($missingMethodCount -gt 0) {
    $messages += "missing methods=$missingMethodCount"
  }
  if ($glmmFailureCount -gt 0) {
    $messages += "glmm failures=$glmmFailureCount"
  }
  $summary = $messages -join ", "
  $details = @()
  $details += @($oracleCheck.pairwise_failures | Select-Object -First 5)
  $details += @($oracleCheck.missing_methods | Select-Object -First 5)
  $details += @($oracleCheck.glmm_failures | Select-Object -First 5)
  if (@($details).Count -gt 0) {
    $summary += ". Samples: " + ($details -join " | ")
  }
  throw "Oracle benchmark output validation failed: $summary"
}

Write-Output "Oracle benchmark complete: $OutputJson"
