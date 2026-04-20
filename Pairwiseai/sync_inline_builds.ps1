param(
  [string]$WorkDir = "C:/HTML apps/Truthcert1_work"
)

$ErrorActionPreference = "Stop"

function Read-TextWithDetectedEncoding {
  param([string]$Path)
  $bytes = [System.IO.File]::ReadAllBytes($Path)

  $utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
  try {
    $text = $utf8Strict.GetString($bytes)
    return [PSCustomObject]@{
      Text = $text
      Encoding = New-Object System.Text.UTF8Encoding($false)
      Name = "utf8"
    }
  } catch {
    $enc = [System.Text.Encoding]::GetEncoding(1252)
    return [PSCustomObject]@{
      Text = $enc.GetString($bytes)
      Encoding = $enc
      Name = "windows-1252"
    }
  }
}

function Write-TextKeepingEncoding {
  param(
    [string]$Path,
    [string]$Text,
    [System.Text.Encoding]$Encoding
  )
  [System.IO.File]::WriteAllText($Path, $Text, $Encoding)
}

function Replace-InlineScript {
  param(
    [string]$HtmlPath,
    [string]$StartMarker = "",
    [string]$NewScriptContent,
    [string]$Indent = "",
    [string]$SearchAfterMarker = ""
  )

  $doc = Read-TextWithDetectedEncoding -Path $HtmlPath
  $html = $doc.Text

  $searchBase = 0
  if (-not [string]::IsNullOrEmpty($SearchAfterMarker)) {
    $searchBase = $html.IndexOf($SearchAfterMarker)
    if ($searchBase -lt 0) {
      throw "Search anchor not found in $HtmlPath"
    }
  }

  if ([string]::IsNullOrEmpty($StartMarker)) {
    $start = $html.IndexOf("<script", $searchBase)
    if ($start -lt 0) {
      throw "No <script> tag found after anchor in $HtmlPath"
    }
    $scriptOpenStart = $start
  } else {
    $start = $html.IndexOf($StartMarker, $searchBase)
    if ($start -lt 0) {
      throw "Start marker not found in $HtmlPath"
    }
    $scriptOpenStart = $html.LastIndexOf("<script", $start)
    if ($scriptOpenStart -lt 0) {
      throw "Could not locate <script> start in $HtmlPath"
    }
  }

  $scriptOpenEnd = $html.IndexOf(">", $scriptOpenStart)
  if ($scriptOpenEnd -lt 0) {
    throw "Malformed <script> tag in $HtmlPath"
  }

  $scriptClose = $html.IndexOf("</script>", $scriptOpenEnd + 1)
  if ($scriptClose -lt 0) {
    throw "Could not locate </script> end in $HtmlPath"
  }

  $newBlock = "${Indent}<script>`r`n${NewScriptContent}`r`n${Indent}</script>"
  $updated = $html.Substring(0, $scriptOpenStart) + $newBlock + $html.Substring($scriptClose + 9)

  Write-TextKeepingEncoding -Path $HtmlPath -Text $updated -Encoding $doc.Encoding
  Write-Output "Updated inline script in $HtmlPath (encoding: $($doc.Name))"
}

$appJsPath = Join-Path $WorkDir "app.js"
$appMinPath = Join-Path $WorkDir "app.min.js"
$mainPath = Join-Path $WorkDir "TruthCert-PairwisePro-v1.0.html"
$bundlePath = Join-Path $WorkDir "TruthCert-PairwisePro-v1.0-bundle.html"
$distPath = Join-Path $WorkDir "TruthCert-PairwisePro-v1.0-dist.html"
$minPath = Join-Path $WorkDir "TruthCert-PairwisePro-v1.0-min.html"

$appJs = (Read-TextWithDetectedEncoding -Path $appJsPath).Text
$appMin = (Read-TextWithDetectedEncoding -Path $appMinPath).Text

$quickNavAnchor = '<div class="quick-nav" id="quickNav">'

Replace-InlineScript -HtmlPath $mainPath -SearchAfterMarker $quickNavAnchor -StartMarker '"use strict";' -NewScriptContent $appJs -Indent "  "
Replace-InlineScript -HtmlPath $bundlePath -SearchAfterMarker $quickNavAnchor -StartMarker '"use strict";' -NewScriptContent $appJs -Indent "  "
Replace-InlineScript -HtmlPath $distPath -SearchAfterMarker $quickNavAnchor -StartMarker '"use strict";' -NewScriptContent $appMin -Indent "  "
Replace-InlineScript -HtmlPath $minPath -SearchAfterMarker $quickNavAnchor -StartMarker "" -NewScriptContent $appMin -Indent ""

Write-Output "Inline build sync complete."
