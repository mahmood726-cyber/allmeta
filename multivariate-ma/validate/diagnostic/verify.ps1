$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
  & node run.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Diagnostic agreement with the R oracle is not 297/297 (see agreement.json)' }
  $mutations = @()
  foreach ($defectName in @('wrong-verdict', 'dropped-fit')) {
    $output = & node compare.cjs "$defectName.json"
    $code = $LASTEXITCODE
    $output | Set-Content -LiteralPath "$defectName.log"
    if ($code -ne 1) { throw "$defectName must fail with exit 1 (got $code)" }
    $mutations += @{ name = $defectName; exitCode = $code; output = @($output) }
    Write-Output "$defectName rejected: exit $code"
  }
  $mutations | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath mutation-results.json
  & node units.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Units invariance failed (see units-invariance.json)' }
  & node mutations.cjs
  if ($LASTEXITCODE -ne 0) { throw 'An engine mutation survived (see mutations.json)' }
} finally { Pop-Location }
exit 0
