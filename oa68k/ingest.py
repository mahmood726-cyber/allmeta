"""Stage 1 — INGEST: build the seed ledger of all OA meta-analyses.

Pages the EPMC search (cursorMark) for OA_META_QUERY and writes one JSONL row per
meta to seed.jsonl: pmid, pmcid, doi, year, title, licence, isOA. Checkpoints the
cursorMark + running count to ingest_state.json after every page, fsync'd, so a
kill resumes from the last page — never re-downloads the whole set, never holds it
all in RAM.

Run:  python ingest.py [--max N]     (--max caps rows for a quick smoke; omit for all)
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import config as C
from net import PoliteSession, atomic_write_json, append_jsonl

PAGE = 1000  # EPMC max pageSize


def _row(r: dict) -> dict:
    return {
        "pmid": r.get("pmid") or r.get("id"),
        "pmcid": r.get("pmcid"),
        "doi": r.get("doi"),
        "source": r.get("source"),        # MED / PMC / PPR
        "year": r.get("pubYear"),
        "isOA": r.get("isOpenAccess") == "Y",
        "inEPMC": r.get("inEPMC") == "Y",
        "hasPDF": r.get("hasPDF") == "Y",
        "license": r.get("license"),
        "title": (r.get("title") or "")[:300],
    }


def run(max_rows: int | None = None) -> dict:
    C.ensure_dirs()
    sess = PoliteSession()

    # resume: if seed.jsonl exists, continue from saved cursorMark
    cursor = "*"
    written = 0
    if os.path.exists(C.INGEST_STATE) and os.path.exists(C.SEED):
        st = json.load(open(C.INGEST_STATE, encoding="utf-8"))
        cursor = st.get("next_cursor", "*")
        written = st.get("written", 0)
        if st.get("complete"):
            print(f"[ingest] already complete: {written} rows in {C.SEED}")
            return st
        print(f"[ingest] resuming at cursor={cursor[:16]}... ({written} rows so far)")

    hit_count = None
    while True:
        r = sess.get(C.EPMC_SEARCH, params={
            "query": C.OA_META_QUERY, "format": "json",
            "pageSize": PAGE, "cursorMark": cursor,
            "resultType": "core",
        })
        j = r.json()
        if hit_count is None:
            hit_count = j.get("hitCount")
            print(f"[ingest] hitCount={hit_count}")
        results = j.get("resultList", {}).get("result", [])
        if not results:
            # An empty page IS the end of the corpus, so checkpoint it as
            # complete. Breaking out without writing leaves complete=false on
            # disk permanently — observed live: seed.jsonl held all 67,771 rows
            # while ingest_state.json still read complete=False, so the
            # "already complete" short-circuit above could never fire and every
            # re-invocation (incl. the Phase-5 monthly delta) re-probed a page
            # to learn nothing.
            atomic_write_json(C.INGEST_STATE, {
                "hit_count": hit_count, "written": written,
                "next_cursor": cursor, "complete": True,
                "query": C.OA_META_QUERY,
            })
            break
        for res in results:
            append_jsonl(C.SEED, _row(res))
            written += 1
            if max_rows and written >= max_rows:
                break
        next_cursor = j.get("nextCursorMark")
        complete = (not next_cursor or next_cursor == cursor
                    or (max_rows and written >= max_rows))
        atomic_write_json(C.INGEST_STATE, {
            "hit_count": hit_count, "written": written,
            "next_cursor": next_cursor or cursor, "complete": bool(complete),
            "query": C.OA_META_QUERY,
        })
        print(f"[ingest] {written} rows  (page of {len(results)})", flush=True)
        if complete:
            break
        cursor = next_cursor

    print(f"[ingest] DONE: {written} rows -> {C.SEED}")
    return json.load(open(C.INGEST_STATE, encoding="utf-8"))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=None)
    a = ap.parse_args()
    run(a.max)
