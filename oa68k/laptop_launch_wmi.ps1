# Launch the shard-1 harvest DETACHED from this SSH session.
#
# Why WMI and not Start-Process: a Start-Process child is killed when the SSH
# session closes (measured — the shard died at 18 rows with empty logs while a
# foreground run of the same code worked at 152/min). Win32_Process.Create is
# spawned by the WMI service, so it outlives the session, and needs no password
# (unlike a scheduled task with /ru).
#
# The api key is inherited from the user environment; never passed on a command
# line (command lines are visible to every process on the box).

# stop any prior harvest so two copies cannot append to one ledger
Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
    Where-Object { $_.CommandLine -like "*harvest.py*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force
                     Write-Output ("stopped prior pid " + $_.ProcessId) }
Start-Sleep -Seconds 2

$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine      = 'cmd.exe /c C:\oa68k\run_shard1.cmd'
    CurrentDirectory = 'C:\oa68k'
}
Write-Output ("WMI Create returncode=" + $r.ReturnValue + " pid=" + $r.ProcessId)
Start-Sleep -Seconds 25
$p = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
     Where-Object { $_.CommandLine -like "*harvest.py*" }
if ($p) { Write-Output ("harvest ALIVE pid " + $p.ProcessId) } else { Write-Output "harvest DEAD" }
Get-Content C:\oa68k\data\harvest_shard1.log -Tail 2 -ErrorAction SilentlyContinue
