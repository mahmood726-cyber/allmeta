# Run every generated plus R script with native Rscript --vanilla, one at a time.
# Resumable: finished scripts are recorded in <dir>\done.jsonl and skipped.
#   powershell -File run-scripts.ps1 -Dir <scripts-dir> -Rscript "<path to Rscript.exe>" [-Kind base|loo|all]
param([string]$Dir, [string]$Rscript, [string]$Kind = 'all')
$ErrorActionPreference = 'Continue'
$index = Get-Content -Raw -Encoding utf8 (Join-Path $Dir 'index.json') | ConvertFrom-Json
$doneFile = Join-Path $Dir 'done.jsonl'
$done = @{}
if (Test-Path $doneFile) { Get-Content -Encoding utf8 $doneFile | ForEach-Object { if ($_) { $o = $_ | ConvertFrom-Json; $done[$o.script] = $true } } }
$jobs = @()
if ($Kind -ne 'loo') { $jobs += $index | ForEach-Object { $_.base } }
if ($Kind -ne 'base') { $jobs += $index | Where-Object { $_.loo } | ForEach-Object { $_.loo } }
foreach ($s in $jobs) {
  if ($done[$s]) { continue }
  $log = Join-Path $Dir ($s + '.log')
  $start = Get-Date
  & $Rscript --vanilla (Join-Path $Dir $s) *>&1 | ForEach-Object { "$_" } | Out-File -Encoding utf8 $log
  $rc = $LASTEXITCODE
  $line = (Select-String -Path $log -Pattern '^allmeta check: ' | Select-Object -Last 1).Line
  $rec = [ordered]@{ script = $s; exit_code = $rc; check_line = $line; seconds = [math]::Round(((Get-Date) - $start).TotalSeconds, 1) }
  ($rec | ConvertTo-Json -Compress) | Add-Content -Encoding utf8 $doneFile
}
'complete' | Out-File -Encoding utf8 (Join-Path $Dir ("run-" + $Kind + ".done"))
