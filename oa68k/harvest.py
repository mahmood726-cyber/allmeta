"""Stage 2 — HARVEST: fetch + cache full-text XML for a batch of OA metas.

Streams seed.jsonl, skips anything already in the harvest ledger (resume), and for
the next `limit` un-harvested metas fetches structured full text:
  X1  EPMC fullTextXML  (true JATS: <table-wrap> preserved)   tried first
  X2  NCBI PMC BioC XML (passage form; reliable from this host) fallback
Caches the bytes under data/cache/<pmcid>.xml and appends a ledger row. XML is
~15x smaller than PDF, so a full-corpus cache is bandwidth-cheap and offline-ready.

Memory: never loads the corpus into RAM — seed is streamed line-by-line and only
the set of done pmcids is held.

Run:  python harvest.py --limit 150
"""
from __future__ import annotations

import argparse
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import config as C
from net import PoliteSession, RateLimiter, append_jsonl, load_done_keys


def fetch_fulltext(sess: PoliteSession, row: dict) -> dict:
    """Acquire structured full text. Tier order is STRUCTURE-first, not merely
    success-first: a tier that preserves <table-wrap>/<th> column headers beats one
    that linearises tables, because column semantics are what make a cell-level
    detector possible at all (BioC flattens tables to tab-separated text, which is
    why regex over it cannot tell an events/N cell from an 80/20 train-test split).
    """
    pmcid = row.get("pmcid")
    pmid = row.get("pmid")
    src = row.get("source") or "MED"
    out = {"pmcid": pmcid, "pmid": pmid, "doi": row.get("doi"),
           "status": "UNOBTAINABLE", "tier": None, "bytes": 0,
           "tiers_tried": [], "path": None}
    if not pmcid:
        out["reason"] = "no_pmcid"
        return out

    # X1 — NCBI efetch db=pmc: TRUE JATS with <table-wrap>/<th>. Measured 12/12 on
    # this host where EPMC 404s (egress proxy filters EPMC sub-resources).
    out["tiers_tried"].append("efetch_pmc_jats")
    try:
        r = sess.get(C.EFETCH_PMC, params={"db": "pmc", "id": pmcid,
                                           "retmode": "xml"})
        if r.status_code == 200 and (b"<body" in r.content
                                     or b"<table-wrap" in r.content):
            return _cache(out, "efetch_pmc_jats", pmcid, r.content)
    except Exception:
        pass

    # X2 — EPMC fullTextXML (JATS; primary on a normal network, 404s from here)
    out["tiers_tried"].append("epmc_fulltext_xml")
    try:
        r = sess.get(C.EPMC_FULLTEXT.format(src=src, pid=pmid or pmcid))
        if r.status_code == 200 and len(r.content) > 500 and b"<" in r.content[:64]:
            return _cache(out, "epmc_fulltext_xml", pmcid, r.content)
    except Exception:
        pass

    # X3 — NCBI BioC (passage XML; tables linearised — last resort)
    out["tiers_tried"].append("pmc_bioc_xml")
    try:
        r = sess.get(C.NCBI_BIOC.format(pmcid=pmcid))
        if r.status_code == 200 and len(r.content) > 500:
            return _cache(out, "pmc_bioc_xml", pmcid, r.content)
    except Exception:
        pass

    out["reason"] = "no_free_fulltext"
    return out


def _cache(out: dict, tier: str, pmcid: str, content: bytes) -> dict:
    # The cache directory must EXIST before a tier can succeed. Without this line a
    # fresh checkout raises FileNotFoundError here, the caller's `except Exception:
    # pass` swallows it, all three tiers "fail", and fetch_fulltext returns
    # reason="no_free_fulltext" -- a claim about the WORLD produced by a missing
    # local directory. Measured 2026-08-29 in a new worktree: 8 of 8 PMCIDs reported
    # unobtainable while efetch was returning 200 with <table-wrap> for every one.
    os.makedirs(C.CACHE, exist_ok=True)
    path = os.path.join(C.CACHE, f"{pmcid}.xml")
    with open(path, "wb") as f:
        f.write(content)
    out.update(status="XML", tier=tier, bytes=len(content), path=path)
    return out


def _pending(limit: int, shard_id: int, shard_count: int, done: set) -> list:
    """Stream the seed and take the next `limit` un-harvested metas in this shard.

    Streams rather than loading the corpus: only the selected batch is held.
    """
    import json
    out = []
    with open(C.SEED, "r", encoding="utf-8") as f:
        for line in f:
            if len(out) >= limit:
                break
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            pmcid = row.get("pmcid")
            if pmcid in done or not C.in_shard(pmcid, shard_id, shard_count):
                continue
            out.append(row)
    return out


def run(limit: int, shard_id: int = 0, shard_count: int = 1,
        workers: int | None = None) -> dict:
    """Harvest a batch CONCURRENTLY under one shared rate gate.

    Measured: one efetch round-trip ~0.4 s, so a sequential loop caps at ~2.5
    req/s regardless of the rate limit — latency, not the limit, was the wall.
    With an API key the per-key budget is 10 req/s, so several workers behind one
    shared RateLimiter convert that headroom into real throughput. Without a key
    the budget is 3 req/s and extra workers only earn 429s, so we stay near 1.
    """
    C.ensure_dirs()
    # Own ledger + the cross-node DONE snapshot. The latter is what makes a
    # re-shard safe: metas move between nodes when N changes, so without it a node
    # would re-fetch another node's completed work and put the same pmcid in two
    # ledgers — tripping merge.py's overlap guard. See build_done_global.py.
    done = load_done_keys(C.HARVEST_LEDGER, "pmcid")
    n_own = len(done)
    gpath = os.path.join(C.DATA, "done_global.txt")
    if os.path.exists(gpath):
        with open(gpath, encoding="utf-8") as f:
            done |= {ln.strip() for ln in f if ln.strip()}
        print(f"[harvest] done: {n_own:,} own + {len(done) - n_own:,} from "
              f"done_global (carried across re-shard)")
    rows = _pending(limit, shard_id, shard_count, done)
    if not rows:
        print("[harvest] nothing pending for this shard")
        return {"harvested_xml": 0, "missed": 0, "rate_per_min": 0}

    if workers is None:
        workers = int(os.environ.get("OA68K_WORKERS",
                                     "4" if C.NCBI_API_KEY else "1"))
    limiter = RateLimiter(C.reqs_per_sec())
    lock = threading.Lock()
    counts = {"ok": 0, "miss": 0}
    t0 = time.monotonic()

    def work(row):
        sess = PoliteSession(limiter=limiter)     # own conn, shared rate gate
        rec = fetch_fulltext(sess, row)
        with lock:                                # one writer at a time
            append_jsonl(C.HARVEST_LEDGER, rec)
            counts["ok" if rec["status"] == "XML" else "miss"] += 1
            n = counts["ok"] + counts["miss"]
            if n % 50 == 0:
                el = time.monotonic() - t0
                print(f"[harvest] {counts['ok']} xml / {counts['miss']} miss "
                      f"({n / el * 60:.0f}/min)", flush=True)
        return rec

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(work, rows))

    dt = time.monotonic() - t0
    summary = {"harvested_xml": counts["ok"], "missed": counts["miss"],
               "workers": workers, "req_per_sec_budget": round(C.reqs_per_sec(), 2),
               "rate_per_min": round((counts["ok"] + counts["miss"]) / dt * 60, 1)
               if dt else 0}
    print(f"[harvest] batch done: {summary}")
    return summary


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=100)
    ap.add_argument("--shard-id", type=int, default=0)
    ap.add_argument("--shard-count", type=int, default=1)
    ap.add_argument("--workers", type=int, default=None)
    a = ap.parse_args()
    run(a.limit, a.shard_id, a.shard_count, a.workers)
