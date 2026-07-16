# Diagnostic for the laptop shard — reports why harvest.py stopped.
Write-Output "=== harvest_shard1.log (tail) ==="
Get-Content C:\oa68k\data\harvest_shard1.log -Tail 12 -ErrorAction SilentlyContinue
Write-Output "=== harvest_shard1.err (tail) ==="
Get-Content C:\oa68k\data\harvest_shard1.err -Tail 12 -ErrorAction SilentlyContinue
Write-Output "=== harvest.py running? ==="
$p = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
     Where-Object { $_.CommandLine -like "*harvest*" }
if ($p) { Write-Output ("ALIVE pid " + $p.ProcessId) } else { Write-Output "DEAD" }
Write-Output "=== ledger rows ==="
if (Test-Path C:\oa68k\data\harvest.laptop.jsonl) {
    (Get-Content C:\oa68k\data\harvest.laptop.jsonl | Measure-Object -Line).Lines
}
Write-Output "=== env visible to a NEW process ==="
Write-Output ("NCBI_API_KEY present: " + [bool][Environment]::GetEnvironmentVariable("NCBI_API_KEY","User"))
Write-Output "=== manual 3-meta run (surfaces the real error) ==="
Set-Location C:\oa68k
$env:OA68K_NODE = "laptop"
$env:OA68K_DATA = "C:\oa68k\data"
$env:NCBI_API_KEY = [Environment]::GetEnvironmentVariable("NCBI_API_KEY","User")
python harvest.py --limit 3 --shard-id 1 --shard-count 2 2>&1 | Select-Object -Last 8
