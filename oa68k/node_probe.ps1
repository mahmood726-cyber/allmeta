# Measure a node's real capacity before trusting it with a shard.
Write-Output ("hostname : " + $env:COMPUTERNAME)
Write-Output ("RAM GB   : " + [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB,1))
Write-Output ("CPU cores: " + (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum)
Write-Output ("CPU      : " + (Get-CimInstance Win32_Processor).Name)
Write-Output ("C: freeGB: " + [math]::Round((Get-PSDrive C).Free/1GB,1))
try { $v = (& python --version 2>&1); Write-Output ("python   : " + $v) } catch { Write-Output "python   : ABSENT" }
try { $r = (& python -c "import requests;print(requests.__version__)" 2>&1); Write-Output ("requests : " + $r) } catch { Write-Output "requests : ABSENT" }
try { $d = (& python -c "import duckdb;print(duckdb.__version__)" 2>&1); Write-Output ("duckdb   : " + $d) } catch { Write-Output "duckdb   : ABSENT" }
Write-Output ("NCBI_API_KEY set: " + [bool][Environment]::GetEnvironmentVariable("NCBI_API_KEY","User"))
Write-Output "--- network: can it reach NCBI efetch? ---"
try {
  $sw=[Diagnostics.Stopwatch]::StartNew()
  $resp = Invoke-WebRequest -Uri "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=PMC10793029&retmode=xml" -UseBasicParsing -TimeoutSec 30
  $sw.Stop()
  Write-Output ("efetch   : HTTP " + $resp.StatusCode + "  " + $resp.RawContentLength + " bytes  " + $sw.ElapsedMilliseconds + " ms")
} catch { Write-Output ("efetch   : FAILED " + $_.Exception.Message) }
Write-Output "--- busy? (top CPU procs) ---"
Get-Process | Sort-Object CPU -Descending | Select-Object -First 4 Name,CPU | Format-Table -AutoSize
