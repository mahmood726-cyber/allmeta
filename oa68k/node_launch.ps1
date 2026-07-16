param(
    [Parameter(Mandatory=$true)][string]$Node,
    [Parameter(Mandatory=$true)][int]$ShardId,
    [int]$ShardCount = 3,
    [int]$Workers = 4,
    [int]$Limit = 40000,
    [int]$NodesSharingKey = 3,
    [string]$Root = "C:\oa68k"
)

# Generic oa68k shard launcher. Used on every node so there is ONE launch path.
#
# Two hard-won rules baked in:
#  1. Stop any prior harvest first — a restart race leaves two processes appending
#     to one ledger and re-fetching each other's in-flight items (observed: 60
#     duplicate rows).
#  2. Launch via WMI Win32_Process.Create, NOT Start-Process: a Start-Process child
#     is killed when the SSH session closes (observed: shard dead at 18 rows, empty
#     logs, while the same code ran fine in the foreground).
#
# NCBI_API_KEY is read from the USER environment and passed via the .cmd's own
# `set` from the registry — never written into this file, never on a command line
# (command lines are world-readable to other processes on the box).

Set-Location $Root

Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
    Where-Object { $_.CommandLine -like "*harvest.py*" } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force
        Write-Output ("stopped prior harvest pid " + $_.ProcessId)
    }
Start-Sleep -Seconds 2

$cmd = @"
@echo off
cd /d $Root
set OA68K_NODE=$Node
set OA68K_DATA=$Root\data
set OA68K_NODES_SHARING_KEY=$NodesSharingKey
python harvest.py --limit $Limit --shard-id $ShardId --shard-count $ShardCount --workers $Workers >> data\harvest_shard$ShardId.log 2>&1
"@
$runner = Join-Path $Root ("run_shard{0}.cmd" -f $ShardId)
Set-Content -Path $runner -Value $cmd -Encoding ASCII

$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine      = "cmd.exe /c `"$runner`""
    CurrentDirectory = $Root
}
Write-Output ("WMI Create rc=" + $r.ReturnValue + " pid=" + $r.ProcessId)
Start-Sleep -Seconds 25

$p = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
     Where-Object { $_.CommandLine -like "*harvest.py*" }
if ($p) { Write-Output ("harvest ALIVE pid " + $p.ProcessId) }
else    { Write-Output "harvest DEAD -- check log" }
Write-Output ("node=" + $env:COMPUTERNAME + " shard=" + $ShardId + "/" + $ShardCount +
              " key_present=" + [bool][Environment]::GetEnvironmentVariable("NCBI_API_KEY","User"))
Get-Content (Join-Path $Root ("data\harvest_shard{0}.log" -f $ShardId)) -Tail 3 -ErrorAction SilentlyContinue
