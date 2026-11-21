# Portable entry-lane gates. Inherit R library settings from the calling shell.
param(
    [string]$Wt = (Join-Path $PSScriptRoot '../..'),
    [string]$Rscript = 'Rscript',
    [switch]$InProcess,
    [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'

function Get-EntryCounts($Lines) {
    $summaries = @($Lines | Select-String '^ENTRY (\d+)/(\d+)$')
    if ($summaries.Count -ne 1) { return $null }
    # PowerShell variable names are case-insensitive: n/N and pn/pN alias.
    return [pscustomobject]@{
        Passed = [int]$summaries[0].Matches[0].Groups[1].Value
        Total = [int]$summaries[0].Matches[0].Groups[2].Value
    }
}

function Test-UnitResult($Lines, $ExitCode) {
    $passes = @($Lines | Select-String '^# pass (\d+)$')
    $failures = @($Lines | Select-String '^# fail (\d+)$')
    return ($null -ne $ExitCode -and $ExitCode -eq 0 -and
        $passes.Count -eq 1 -and $failures.Count -eq 1 -and
        [int]$passes[0].Matches[0].Groups[1].Value -ge 60 -and
        [int]$failures[0].Matches[0].Groups[1].Value -eq 0)
}

function Test-RResult($Lines, $ExitCode, [bool]$Planted) {
    $counts = Get-EntryCounts $Lines
    if ($null -eq $counts -or $null -eq $ExitCode -or
        $counts.Total -lt 2000 -or $counts.Passed -gt $counts.Total) { return $false }
    if ($Planted) {
        return ($counts.Passed -lt $counts.Total -and $ExitCode -ne 0)
    }
    return ($counts.Passed -eq $counts.Total -and $ExitCode -eq 0)
}

if ($SelfTest) {
    # Exercise the actual predicates, including planted defects in their inputs.
    $checks = @(
        @{Name='TAP success'; Actual=(Test-UnitResult @('# pass 358','# fail 0') 0); Expected=$true}
        @{Name='spec is not TAP'; Actual=(Test-UnitResult @('pass 358','fail 0') 0); Expected=$false}
        @{Name='too few tests'; Actual=(Test-UnitResult @('# pass 59','# fail 0') 0); Expected=$false}
        @{Name='PLANTED unit failure'; Actual=(Test-UnitResult @('# pass 358','# fail 1') 1); Expected=$false}
        @{Name='unit exit code'; Actual=(Test-UnitResult @('# pass 358','# fail 0') 1); Expected=$false}
        @{Name='missing unit summary'; Actual=(Test-UnitResult @('# pass 358') 0); Expected=$false}
        @{Name='R success'; Actual=(Test-RResult @('ENTRY 8164/8164') 0 $false); Expected=$true}
        @{Name='PLANTED unequal normal counts even with exit zero'; Actual=(Test-RResult @('ENTRY 8163/8164') 0 $false); Expected=$false}
        @{Name='R exit code'; Actual=(Test-RResult @('ENTRY 8164/8164') 1 $false); Expected=$false}
        @{Name='R minimum case count'; Actual=(Test-RResult @('ENTRY 1999/1999') 0 $false); Expected=$false}
        @{Name='planted defect detected'; Actual=(Test-RResult @('FAIL case','ENTRY 8163/8164') 1 $true); Expected=$true}
        @{Name='PLANTED undetected defect'; Actual=(Test-RResult @('ENTRY 8164/8164') 1 $true); Expected=$false}
        @{Name='planted requires nonzero exit'; Actual=(Test-RResult @('ENTRY 8163/8164') 0 $true); Expected=$false}
        @{Name='crash without summary'; Actual=(Test-RResult @('R error') 1 $true); Expected=$false}
        @{Name='missing process exit'; Actual=(Test-RResult @('ENTRY 8163/8164') $null $true); Expected=$false}
        @{Name='duplicate summaries'; Actual=(Test-RResult @('ENTRY 8163/8164','ENTRY 8164/8164') 0 $false); Expected=$false}
    )
    foreach ($check in $checks) {
        if ($check.Actual -ne $check.Expected) { throw "Gate regression: $($check.Name)" }
    }
    "ENTRY_GATES $($checks.Count)/$($checks.Count)"
    exit 0
}

$script:ok = $true
function Gate($Name, $Condition, $Detail) {
    if ($Condition) { "GATE PASS $Name $Detail" }
    else { "GATE FAIL $Name $Detail"; $script:ok = $false }
}

Push-Location -LiteralPath $Wt
try {
    '== 1. node unit tests'
    $nodeArgs = @('--test', '--test-reporter=tap')
    # Only process isolation changes; the same two suites and assertions run.
    if ($InProcess) {
        $nodeArgs += @('--test-isolation=none', 'hub/shared/tests/unit/index.mjs')
    } else {
        $nodeArgs += 'hub/shared/tests/unit/'
    }
    # R startup diagnostics can be NativeCommandError records in Windows
    # PowerShell. Capture them and use the process exit code for each gate.
    $ErrorActionPreference = 'Continue'
    # Native commands update the global automatic variable. A script-local
    # assignment would shadow it and hide the real process result.
    $global:LASTEXITCODE = $null
    $unitOutput = @(& node @nodeArgs 2>&1 | ForEach-Object { "$_" })
    $unitExit = $global:LASTEXITCODE
    $unitOutput
    Gate 'unit' (Test-UnitResult $unitOutput $unitExit) "exit=$unitExit (need >=60 passes, 0 failures and exit 0)"

    '== 2. generate R case grid'
    $global:LASTEXITCODE = $null
    $generationOutput = @(& node validation/entry/gen_cases.mjs 2>&1 | ForEach-Object { "$_" })
    $generationExit = $global:LASTEXITCODE
    $generationOutput
    Gate 'gen' ($null -ne $generationExit -and $generationExit -eq 0 -and
        (Test-Path validation/entry/cases.json) -and
        (Test-Path validation/entry/cases.planted.json)) "exit=$generationExit; both corpora required"

    '== 3. R cross-check'
    $global:LASTEXITCODE = $null
    $rOutput = @(& $Rscript validation/entry/check_entry.R validation/entry/cases.json 2>&1 | ForEach-Object { "$_" })
    $rExit = $global:LASTEXITCODE
    $rOutput | Select-Object -Last 60
    Gate 'rcheck' (Test-RResult $rOutput $rExit $false) "exit=$rExit (need >=2000 cases, all pass and exit 0)"

    '== 4. planted defect must FAIL'
    $global:LASTEXITCODE = $null
    $plantedOutput = @(& $Rscript validation/entry/check_entry.R validation/entry/cases.planted.json 2>&1 | ForEach-Object { "$_" })
    $plantedExit = $global:LASTEXITCODE
    $plantedOutput | Select-Object -Last 15
    Gate 'planted' (Test-RResult $plantedOutput $plantedExit $true) "exit=$plantedExit (need passed < total and nonzero exit)"

    '== 5. hygiene'
    $ErrorActionPreference = 'Stop'
    $files = @('shared/alm-entry.js', 'shared/alm-entry-ui.js', 'shared/alm-entry.css') +
        @(Get-ChildItem -Recurse validation/entry -File | ForEach-Object { $_.FullName }) +
        @(Get-ChildItem -Recurse hub/shared/tests/unit -File | ForEach-Object { $_.FullName })
    $clean = $true
    foreach ($file in $files) {
        if (-not (Test-Path -LiteralPath $file)) {
            Gate 'exists' $false $file
            $clean = $false
            continue
        }
        $bytes = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $file))
        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            Gate 'bom' $false $file
            $clean = $false
        }
    }
    Gate 'bom' $clean 'all entry source, test and validation files checked'
    $badPaths = Select-String -Path shared/alm-entry.js,shared/alm-entry-ui.js -Pattern 'C:\\Users|/home/|C:/Users'
    Gate 'paths' (-not $badPaths) 'no hardcoded local paths'
    $scripts = @('shared/alm-entry.js','shared/alm-entry-ui.js') +
        @($files | Where-Object { $_ -match '\.(?:mjs|js)$' })
    $scriptClose = '<' + '/script>'
    $badClosingTags = Select-String -Path $scripts -SimpleMatch $scriptClose
    Gate 'script-close' (-not $badClosingTags) 'no literal script close in scripts'
} catch {
    Gate 'runner' $false $_.Exception.Message
} finally {
    Pop-Location
}
if ($script:ok) { 'ALL_TESTS_PASS'; exit 0 }
'SOME_TESTS_FAILED'
exit 1
