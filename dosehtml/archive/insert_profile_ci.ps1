$htmlPath = "C:\dosehtml\dose-response-pro-v4-light.html"
$codePath = "C:\dosehtml\apply_profile_ci.txt"

$html = Get-Content $htmlPath -Raw
$codeToInsert = Get-Content $codePath -Raw

$marker = "            }`r`n`r`n            AppState.results = results;"
$insertMarker = "AppState.results = results;"

$insertPoint = $html.IndexOf($marker)
if ($insertPoint -ge 0) {
    $before = $html.Substring(0, $insertPoint)
    $after = $html.Substring($insertPoint)

    $newHtml = $before + "`r`n`r`n" + $codeToInsert + "`r`n" + $after
    $newHtml | Set-Content $htmlPath -NoNewline
    Write-Host "Profile likelihood CI application code inserted successfully"
} else {
    Write-Host "Could not find insertion point marker"
}
