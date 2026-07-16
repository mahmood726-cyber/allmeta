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
import time

import config as C
from net import PoliteSession, append_jsonl, load_done_keys


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
    path = os.path.join(C.CACHE, f"{pmcid}.xml")
    with open(path, "wb") as f:
        f.write(content)
    out.update(status="XML", tier=tier, bytes=len(content), path=path)
    return out


def run(limit: int, shard_id: int = 0, shard_count: int = 1) -> dict:
    C.ensure_dirs()
    done = load_done_keys(C.HARVEST_LEDGER, "pmcid")
    sess = PoliteSession()
    n_ok = n_miss = n_seen = 0
    t0 = time.monotonic()
    with open(C.SEED, "r", encoding="utf-8") as f:
        for line in f:
            if n_ok + n_miss >= limit:
                break
            line = line.strip()
            if not line:
                continue
            import json
            row = json.loads(line)
            pmcid = row.get("pmcid")
            if pmcid in done:
                continue
            if not C.in_shard(pmcid, shard_id, shard_count):
                continue
            n_seen += 1
            rec = fetch_fulltext(sess, row)
            append_jsonl(C.HARVEST_LEDGER, rec)
            if rec["status"] == "XML":
                n_ok += 1
            else:
                n_miss += 1
            if (n_ok + n_miss) % 25 == 0:
                print(f"[harvest] {n_ok} xml / {n_miss} miss", flush=True)
    dt = time.monotonic() - t0
    summary = {"harvested_xml": n_ok, "missed": n_miss,
               "rate_per_min": round((n_ok + n_miss) / dt * 60, 1) if dt else 0}
    print(f"[harvest] batch done: {summary}")
    return summary


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=100)
    ap.add_argument("--shard-id", type=int, default=0)
    ap.add_argument("--shard-count", type=int, default=1)
    a = ap.parse_args()
    run(a.limit, a.shard_id, a.shard_count)
