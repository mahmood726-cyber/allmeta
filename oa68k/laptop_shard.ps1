# oa68k — laptop shard-1 runner (deployed to C:\oa68k on node `mahmood`).
#
# Runs in its OWN directory (C:\oa68k) and touches nothing else on the box — in
# particular it must never read, lock, build or otherwise contend with Codex's
# bias-adjusted-nma-adv work. It is network/IO-bound (efetch JATS fetches), not
# CPU-bound, so it coexists with a CPU-bound build.
#
# NO LLM is used here: harvest -> JATS parse -> NCT link are all deterministic.
# Tier-2 prose extraction is deliberately NOT run (agy is spent); it stays queued.
#
# Idempotent + resumable: re-running skips whatever already landed in the ledger.
# Restart-safe: any previous harvest.py on this node is stopped first, so two
# copies can never append to the same ledger.
#
# The NCBI api key is read from the machine environment (NCBI_API_KEY, set via
# setx). It is NEVER written into this file or into any log.

$env:OA68K_NODE = "laptop"
$env:OA68K_DATA = "C:\oa68k\data"
# 2 nodes share ONE api key, and NCBI's 10 req/s budget is per-KEY not per-IP,
# so this node takes half the budget (config.reqs_per_sec handles the split).
$env:OA68K_NODES_SHARING_KEY = "2"

Set-Location C:\oa68k

# --- stop any prior harvest on this node (prevents double-append) ---
Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
    Where-Object { $_.CommandLine -like "*harvest.py*" } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force
        Write-Output ("stopped prior harvest pid " + $_.ProcessId)
    }
Start-Sleep -Seconds 2

# --shard-id 1 --shard-count 2 : disjoint from pc2's shard 0 by sha256(pmcid)%2,
# so the two nodes can never process the same meta and merge.py's overlap guard
# stays green.
Start-Process -FilePath "python" `
  -ArgumentList "harvest.py", "--limit", "40000", "--shard-id", "1", "--shard-count", "2" `
  -WorkingDirectory "C:\oa68k" `
  -WindowStyle Hidden `
  -RedirectStandardOutput "C:\oa68k\data\harvest_shard1.log" `
  -RedirectStandardError "C:\oa68k\data\harvest_shard1.err"

Start-Sleep -Seconds 5
Write-Output ("launched shard-1 harvest on " + $env:COMPUTERNAME +
              "  key_present=" + [bool]$env:NCBI_API_KEY)
Get-Content C:\oa68k\data\harvest_shard1.log -Tail 2 -ErrorAction SilentlyContinue
