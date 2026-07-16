"""Stage T3 — OA full text for the TRIAL papers (layer 3 of the three-layer rule).

Layer 1 is the registry record (registry_full.py). Layer 2 is the abstract
(crosswalk.py). This is layer 3: the open-access full text of the papers that
actually report the trials — where the results tables, harms and (for DTA) the
2x2 sens/spec cells live.

REUSE, not reimplementation:
  - `harvest.fetch_fulltext()` already implements the structure-first tier
    cascade (efetch JATS -> EPMC fullTextXML -> BioC) and caches by PMCID. The
    68k lane measured that efetch works from this host where EPMC sub-resources
    are proxy-404'd. We call it as-is.
  - `jats.parse_tables()` already parses <table-wrap> with real column headers.
    Column semantics are the whole reason the JATS tier is worth the bytes.

SEPARATE LEDGER, deliberately. `ledger.py` globs `harvest.*.jsonl` and counts
every row as an OA *meta-analysis*. Trial papers are a different population, so
writing them to the harvest ledger would silently inflate the 68k lane's corpus
count. We write `paperft.<node>.jsonl` instead. The XML cache IS shared (keyed by
PMCID, content-identical either way) — that is a real saving, not a collision.

Candidate set: papers the crosswalk resolved as `is_open_access AND in_pmc` with
a PMCID, linked to an RCT by a DERIVED/RESULT reference. Priority order:
malaria/TB/HIV first, then trials with posted registry results (so the registry
and the paper can be cross-checked against each other), then the rest.

Run:  python fulltext.py --limit 500
      python fulltext.py --all
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date

# ---- LANE KEY SELECTION. Must run BEFORE `import config`, which snapshots
# NCBI_API_KEY at module import time.
#
# This lane owns KEY B (env: NCBI_API_KEY_PREEXTRACT). KEY A (env:
# NCBI_API_KEY) belongs to the three 68k harvest shards, which share its 10/s.
# One key per workload: we map OUR key into the slot net.PoliteSession reads, so
# this process can never spend the harvest lane's budget. Doing this in config.py
# instead would be wrong — config is shared, and the 68k lane must keep KEY A.
#
# This is selection, NOT stacking: exactly one key is ever attached to a request,
# and each key serves one workload. Presenting both keys on one stream to fake
# 20/s would be limit-evasion; on a 429 we slow down (PoliteSession honours
# Retry-After), we do not rotate keys to dodge the throttle.
_LANE_KEY = os.environ.get("NCBI_API_KEY_PREEXTRACT", "").strip()
if _LANE_KEY:
    os.environ["NCBI_API_KEY"] = _LANE_KEY

import config as C  # noqa: E402  (import order is load-bearing, see above)
import harvest
import jats
from net import PoliteSession, RateLimiter, append_jsonl, load_done_keys

# Corpora this stage can harvest. `linked_rct` comes from the registry crosswalk;
# `dta` and `oa_rct` come from EPMC seeds and deliberately reach BEYOND the
# registry — an unregistered trial, or a DTA study (which is typically not a
# registered RCT at all), is invisible to CT.gov but is exactly the evidence a
# synthesist still needs. Each corpus keeps its own ledger + table dir so counts
# never bleed across populations.
CORPORA = ("linked_rct", "dta", "oa_rct")

# Commit tables+ledger together every N papers. Small enough that a kill costs
# seconds of re-fetch, large enough to avoid a parquet file per paper.
COMMIT_EVERY = 100

# ---- NCBI rate ------------------------------------------------------------
# With a DEDICATED key (KEY B) the whole 10 req/s is this lane's — no longer the
# 20% slice we took while sharing KEY A with the harvest shards. We still hold
# back 20% headroom: running flat at the stated ceiling earns 429s, and backing
# off is the rule (never rotate keys to dodge a throttle).
#
# CONCURRENCY IS THE POINT, and this is measured, not assumed. A single efetch
# round-trip is ~0.4-1.0s, so a SEQUENTIAL loop is latency-bound near ~1 req/s
# no matter how high the ceiling — the key raises a ceiling a sequential loop
# never reaches. Benchmarked on this host:
#   keyless sequential @1.2/s ->  0.56 req/s (  34/min)   <- the original
#   keyed   sequential @2.0/s ->  0.97 req/s (  58/min)   1.7x: key alone
#   keyed   4 workers  @2.0/s ->  1.80 req/s ( 108/min)   3.2x: key + workers
# Workers therefore scale with the rate; they share ONE RateLimiter so the node
# still respects the per-key budget rather than N timers each assuming it is alone.
def _my_rps() -> float:
    override = os.environ.get("OA68K_NCBI_RPS")
    if override:
        return float(override)
    if not C.NCBI_API_KEY:
        return 0.6                       # keyless: leave room for other lanes
    if _LANE_KEY:
        return 8.0                       # dedicated KEY B: 10/s minus headroom
    return 2.0                           # sharing KEY A: the reserved slice only


# Worker count is set from PRODUCTION measurement, not the fetch-only benchmark.
# The benchmark said 12w@8/s (98/min) beat 4w@2/s (44/min) — but it only fetched.
# In production this stage ALSO parses JATS (ElementTree, CPU-bound, GIL-held),
# so measured end-to-end on the real corpus:
#     4 workers @2.0/s -> 80/min   (cache=0)
#    12 workers @8.0/s -> 58/min   <- WORSE: threads contend on the GIL parsing
#                                     XML, and extra sockets cannot fix a CPU wall
# So the rate ceiling is not the binding constraint here and more workers past a
# point actively hurt. 6 is the compromise: enough to cover network latency, few
# enough to avoid parse contention. Re-measure before raising it — a benchmark
# that skips the CPU half of the work will lie to you again.
WORKERS = int(os.environ.get("OA68K_FT_WORKERS", "6" if _LANE_KEY else "4"))


def ft_ledger(corpus: str) -> str:
    stem = "paperft" if corpus == "linked_rct" else f"paperft_{corpus}"
    return os.path.join(C.DATA, f"{stem}.{C.NODE}.jsonl")


def tables_dir(corpus: str) -> str:
    name = "paper_tables" if corpus == "linked_rct" else f"paper_tables_{corpus}"
    return os.path.join(C.STORE, name)


def _lst(fs) -> str:
    return "[" + ",".join("'" + f.replace(os.sep, "/") + "'" for f in fs) + "]"


def candidates() -> list[dict]:
    """OA-in-PMC papers that REPORT an RCT, priority-ordered."""
    import duckdb
    papers = sorted(glob.glob(os.path.join(C.STORE, "papers", "*.parquet")))
    refs = sorted(glob.glob(os.path.join(C.STORE, "trial_refs", "*.parquet")))
    trials = sorted(glob.glob(os.path.join(C.STORE, "trials", "*.parquet")))
    if not papers:
        raise FileNotFoundError("no papers in the store — run crosswalk.py first")
    con = duckdb.connect()
    rows = con.execute(f"""
        WITH p AS (
          SELECT pmid, pmcid, doi, title FROM read_parquet({_lst(papers)})
          WHERE is_open_access AND in_pmc
            AND pmcid IS NOT NULL AND trim(pmcid) <> ''
        ),
        link AS (
          SELECT trim(pmid) AS pmid, nct_id FROM read_parquet({_lst(refs)})
          WHERE upper(reference_type) IN ('DERIVED','RESULT')
        ),
        t AS (SELECT nct_id, cohort, results_posted
              FROM read_parquet({_lst(trials)}))
        SELECT p.pmcid, p.pmid, p.doi,
               MIN(CASE WHEN t.cohort='p0_malaria_tb_hiv' THEN 0 ELSE 1 END) AS c_rank,
               MAX(CASE WHEN t.results_posted THEN 1 ELSE 0 END) AS any_results,
               string_agg(DISTINCT link.nct_id, ' | ') AS ncts
        FROM p JOIN link ON link.pmid = p.pmid
               LEFT JOIN t ON t.nct_id = link.nct_id
        GROUP BY p.pmcid, p.pmid, p.doi
        ORDER BY c_rank, any_results DESC, CAST(p.pmid AS BIGINT)
    """).fetchall()
    return [{"pmcid": r[0], "pmid": r[1], "doi": r[2], "source": "MED",
             "cohort_rank": r[3], "any_results": bool(r[4]), "ncts": r[5]}
            for r in rows]


def fetch_or_cached(sess: PoliteSession, c: dict) -> dict:
    """Reuse the on-disk XML if we already have it; only then hit the network.

    The cache is shared with the 68k lane's harvest (keyed by PMCID, and the
    bytes are the same document either way), so a meta already harvested there
    costs us nothing. harvest.fetch_fulltext always re-fetches, which is right
    for a first pass but wasteful for a re-run after a crash — and every avoided
    request is NCBI budget handed back to the other lane.
    """
    path = os.path.join(C.CACHE, f"{c['pmcid']}.xml")
    if os.path.isfile(path) and os.path.getsize(path) > 500:
        return {"pmcid": c["pmcid"], "pmid": c.get("pmid"), "doi": c.get("doi"),
                "status": "XML", "tier": "cache", "tiers_tried": ["cache"],
                "bytes": os.path.getsize(path), "path": path}
    return harvest.fetch_fulltext(sess, c)


def _pid_alive(pid: int) -> bool:
    """Is that PID still running? Windows has no os.kill(pid, 0) semantics we can
    rely on here, so ask the OS task list."""
    try:
        out = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
            capture_output=True, text=True, timeout=20).stdout
        return str(pid) in out
    except Exception:
        return True          # can't tell => assume alive => refuse the lock


def _acquire_lock(corpus: str):
    """One harvester per corpus per node, enforced by an O_EXCL lock file.

    Not defensive padding — this bug happened: two `fulltext.py --all` processes
    ran concurrently (a nohup that I wrongly believed dead, plus a managed job),
    computed the same todo list, and re-fetched the same 427 papers while both
    appending to one ledger. `ps` on Git Bash shows no command arguments, so
    grepping for the script name reported 0 matches and hid it. A lock makes the
    second instance fail loudly instead of silently doubling the NCBI load.

    STALE-LOCK RECOVERY, and this one is load-bearing for the standing run: a
    KILLED harvester leaves its lock behind. A watchdog that restarts this lane
    from checkpoint would then hit the lock, fail, and the lane would stay dead
    for good — a permanent outage caused by the safety mechanism. Verified live:
    killing a harvester mid-flight left `.fulltext_linked_rct.pc1.lock` orphaned.
    So we record the PID and take the lock if its owner is gone. A lock held by a
    LIVE process is still refused — that is the case it exists for.
    """
    lock = os.path.join(C.DATA, f".fulltext_{corpus}.{C.NODE}.lock")
    for attempt in (1, 2):
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            try:
                with open(lock) as f:
                    who = f.read().strip()
            except OSError:
                who = ""
            m = re.search(r"pid=(\d+)", who or "")
            if m and not _pid_alive(int(m.group(1))) and attempt == 1:
                print(f"[fulltext] stale lock from dead pid {m.group(1)} — "
                      f"reclaiming ({lock})", flush=True)
                try:
                    os.remove(lock)
                except OSError:
                    pass
                continue
            raise RuntimeError(
                f"another fulltext harvester holds {lock} ({who}). Two harvesters "
                f"on one corpus re-fetch the same papers and double the NCBI "
                f"rate. If that process is genuinely dead, delete the lock file.")
        with os.fdopen(fd, "w") as f:
            f.write(f"pid={os.getpid()} started={date.today().isoformat()}")
        return lock
    raise RuntimeError(f"could not acquire {lock}")


def seed_candidates(corpus: str) -> list[dict]:
    """Candidates for an EPMC-seeded corpus (dta / oa_rct)."""
    import epmc_seed
    rows = epmc_seed.load_seed(corpus, priority_first=True)
    return [{"pmcid": r["pmcid"], "pmid": r.get("pmid"), "doi": r.get("doi"),
             "source": r.get("source") or "MED",
             "cohort_rank": 0 if r.get("priority") else 1,
             "any_results": False, "ncts": None} for r in rows]


def run(limit: int | None, all_: bool = False,
        corpus: str = "linked_rct") -> dict:
    if corpus not in CORPORA:
        raise ValueError(f"unknown corpus {corpus!r}; expected one of {CORPORA}")
    C.ensure_dirs()
    tdir, ledger = tables_dir(corpus), ft_ledger(corpus)
    os.makedirs(tdir, exist_ok=True)
    lock = _acquire_lock(corpus)
    try:
        return _run_locked(limit, all_, corpus, tdir, ledger)
    finally:
        try:
            os.remove(lock)
        except OSError:
            pass


def _run_locked(limit, all_, corpus, tdir, ledger) -> dict:
    today = date.today().isoformat()
    cands = candidates() if corpus == "linked_rct" else seed_candidates(corpus)
    done = load_done_keys(ledger, "pmcid")
    todo = [c for c in cands if c["pmcid"] not in done]
    if not all_ and limit:
        todo = todo[:limit]
    print(f"[fulltext:{corpus}] {len(cands)} OA papers; {len(done)} done; "
          f"fetching {len(todo)}", flush=True)

    # One shared limiter for every worker: N workers with N private timers would
    # each think they own the whole budget and collectively blow the per-key
    # limit. Each worker gets its own Session (connection pooling) but defers to
    # the shared gate.
    limiter = RateLimiter(_my_rps())
    agg = {"fetched": 0, "missed": 0, "from_cache": 0, "with_tables": 0,
           "tables": 0}
    tbuf, lbuf, t0 = [], [], time.monotonic()

    def commit():
        """Persist tables FIRST, then the ledger rows that claim them.

        Order is the whole point. Appending the ledger per paper while buffering
        its tables means a kill in between marks the paper done with its tables
        never written — and because resume is a set-difference on the ledger, that
        paper is skipped forever. Silent, permanent loss. Observed live: 521
        papers marked done, 8 table rows on disk, ~1,500 parsed tables lost in a
        killed process's buffer.

        Tables-then-ledger inverts the risk into a harmless one: a kill in the
        window re-fetches those papers next run and re-writes their table rows,
        so the failure mode is duplicate rows (detectable and removable by
        (pmcid, table_index)) instead of missing ones. Prefer visible duplication
        over invisible loss.
        """
        if tbuf:
            _flush(tbuf, tdir)
            tbuf.clear()
        for r in lbuf:
            append_jsonl(ledger, r)
        lbuf.clear()

    def work(c: dict):
        """Fetch + parse ONE paper. Runs on a worker thread; touches no shared
        state and never writes — the main thread owns all persistence, so the
        tables-then-ledger commit order survives concurrency."""
        sess = PoliteSession(min_interval=0, limiter=limiter)
        rec = fetch_or_cached(sess, c)
        rec.update(ncts=c["ncts"], cohort_rank=c["cohort_rank"], corpus=corpus,
                   source_tier="oa_fulltext", extracted_at=today,
                   locator=f"https://europepmc.org/article/PMC/{c['pmcid']}")
        rows = []
        if rec["status"] == "XML" and rec.get("path"):
            try:
                with open(rec["path"], "rb") as f:
                    xml = f.read()
                for ti, t in enumerate(jats.parse_tables(xml)):
                    rows.append({
                        "pmcid": c["pmcid"], "pmid": c["pmid"], "ncts": c["ncts"],
                        "table_index": ti,
                        "caption": (t.get("caption") or "")[:500],
                        "n_rows": len(t.get("rows") or []),
                        "n_cols": len(t.get("headers") or []),
                        "headers": " | ".join(t.get("headers") or []),
                        "tier": rec.get("tier"), "corpus": corpus,
                        "source_tier": "oa_fulltext",
                        "locator": rec["locator"], "extracted_at": today,
                    })
            except Exception as e:
                rec["table_parse_error"] = str(e)[:200]
        rec["n_tables"] = len(rows)
        return rec, rows

    done_n = 0
    # Chunked so memory stays bounded and each chunk commits atomically; a kill
    # costs at most one chunk of re-fetch, never a lost table (see commit()).
    for start in range(0, len(todo), COMMIT_EVERY):
        chunk = todo[start:start + COMMIT_EVERY]
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            for rec, rows in ex.map(work, chunk):
                lbuf.append(rec)
                tbuf.extend(rows)
                if rec["status"] == "XML":
                    agg["fetched"] += 1
                    agg["from_cache"] += int(rec.get("tier") == "cache")
                    agg["with_tables"] += int(len(rows) > 0)
                    agg["tables"] += len(rows)
                else:
                    agg["missed"] += 1
        commit()
        done_n += len(chunk)
        rate = done_n / max(time.monotonic() - t0, 1e-9) * 60
        print(f"[fulltext:{corpus}] {done_n}/{len(todo)} ({rate:.0f}/min, "
              f"{WORKERS}w @{_my_rps():.1f}/s) xml={agg['fetched']} "
              f"cache={agg['from_cache']} tables={agg['tables']}", flush=True)
    commit()
    print(f"[fulltext:{corpus}] {agg}")
    return agg


def _flush(rows: list[dict], tdir: str) -> None:
    import pyarrow as pa
    import pyarrow.parquet as pq
    n = len(glob.glob(os.path.join(tdir, "part_*.parquet")))
    dst = os.path.join(tdir, f"part_{n:05d}.parquet")
    tmp = dst + ".tmp"
    pq.write_table(pa.Table.from_pylist(rows), tmp, compression="zstd")
    os.replace(tmp, dst)
    print(f"[fulltext] wrote {len(rows)} table rows -> {os.path.basename(dst)}",
          flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--corpus", choices=CORPORA, default="linked_rct")
    a = ap.parse_args()
    print(json.dumps(run(a.limit, a.all, a.corpus), indent=2))
