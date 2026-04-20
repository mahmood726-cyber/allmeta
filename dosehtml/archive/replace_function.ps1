# PowerShell script to replace the Bayesian function
$file = "C:\dosehtml\dose-response-pro-v4.html"
$newFunction = Get-Content "C:\dosehtml\new_bayesian_function.txt" -Raw

$content = Get-Content $file -Raw

# Find the function
$pattern = "(?s)    // Bayesian Dose-Response Meta-Analysis using MCMC\r?\n    function fitBayesianModel\(studies, settings\) \{.*?^    \}\r?\n"

if ($content -match $pattern) {
    Write-Host "Found the function! Replacing..."
    $newContent = $content -replace $pattern, $newFunction

    # Write back
    $newContent | Out-File $file -Encoding UTF8
    Write-Host "Successfully replaced the function!"
} else {
    Write-Host "ERROR: Could not find the function with regex pattern"
    Write-Host "Trying simpler approach..."

    # Simpler: find start and end markers
    $startMarker = "    // Bayesian Dose-Response Meta-Analysis using MCMC"
    $endMarker = "    }" + "`r`n" + "    // Helper: Initialize beta"

    $startIndex = $content.IndexOf($startMarker)
    if ($startIndex -ge 0) {
        # Find the end after the start
        $searchFrom = $content.Substring($startIndex)
        $endIndex = $searchFrom.IndexOf($endMarker)

        if ($endIndex -ge 0) {
            $endIndex = $startIndex + $endIndex

            Write-Host "Found function from $startIndex to $endIndex"
            $newContent = $content.Substring(0, $startIndex) + $newFunction + $content.Substring($endIndex + $endMarker.Length)
            $newContent | Out-File $file -Encoding UTF8
            Write-Host "Successfully replaced using marker approach!"
        } else {
            Write-Host "Could not find end marker"
        }
    } else {
        Write-Host "Could not find start marker"
    }
}
