@echo off
REM oa68k laptop shard-1 runner. Launched via WMI Win32_Process.Create so it is
REM NOT a child of the SSH session -- Start-Process children are killed when the
REM SSH connection closes (observed: process dead, logs empty, 18 rows).
REM
REM NCBI_API_KEY is inherited from the machine/user environment (set via setx).
REM It is never written here.
cd /d C:\oa68k
set OA68K_NODE=laptop
set OA68K_DATA=C:\oa68k\data
set OA68K_NODES_SHARING_KEY=2
python harvest.py --limit 40000 --shard-id 1 --shard-count 2 >> data\harvest_shard1.log 2>&1
