$htmlPath = "C:\dosehtml\dose-response-pro-v4-light.html"
$profilePath = "C:\dosehtml\profile_likelihood_functions.txt"

$html = Get-Content $htmlPath -Raw
$profileFunctions = Get-Content $profilePath -Raw

$marker = "    // Calculate residual standard error"
$insertPoint = $html.IndexOf($marker)
if ($insertPoint -ge 0) {
    # Find the end of calculateRSE function
    $endMarker = "    // =============================================`r`n    // ROBUST VARIANCE ESTIMATION (RVE)"
    $endPoint = $html.IndexOf($endMarker, $insertPoint)

    if ($endPoint -gt 0) {
        $before = $html.Substring(0, $endPoint)
        $after = $html.Substring($endPoint)

        $newHtml = $before + "`r`n`r`n" + $profileFunctions + "`r`n`r`n" + $after
        $newHtml | Set-Content $htmlPath -NoNewline
        Write-Host "Profile likelihood functions inserted successfully"
    } else {
        Write-Host "Could not find insertion point marker"
    }
} else {
    Write-Host "Could not find calculateRSE function"
}
