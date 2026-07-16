"""Backfill table CELLS + raw XML from the cached JATS. ZERO network calls.

Why this exists: the store held 37,850 tables describing 647,445 rows and **not
one cell value**. It kept shape (n_rows/n_cols/headers) and threw the data away —
a table skeleton, not a table. The cross-lane measurement is that re-parsing real
table markup instead of text is worth +25-38pp of extraction (malaria 50.0->79.2%,
TB 20.7->51.2%, HIV 30.0->55.0%, NCD 23.3->61.7%), which is more than every
disease difference combined. We were discarding the input to that.

Nothing needs re-fetching: `fulltext.py` cached every document under
data/cache/<pmcid>.xml, so this re-derives from disk. That is the payoff of
caching by PMCID — a parser bug costs CPU, not NCBI's bandwidth or our rate
budget.

Idempotent: writes to a fresh part-file set and swaps the directory only after
the row count is verified >= the old one. A backfill that silently produced FEWER
tables than it replaced would be a regression disguised as a fix, so it fails
closed instead.

Run:  python reparse_tables.py --corpus linked_rct
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import shutil
import time
from datetime import date

import config as C
import fulltext
import jats


def _ledger_rows(corpus: str):
    p = fulltext.ft_ledger(corpus)
    if not os.path.exists(p):
        return []
    out = []
    with open(p, encoding="utf-8") as f:
        for ln in f:
            if not ln.strip():
                continue
            try:
                r = json.loads(ln)
            except Exception:
                continue
            if r.get("status") == "XML" and r.get("path"):
                out.append(r)
    return out


def run(corpus: str = "linked_rct", batch: int = 2000) -> dict:
    import pyarrow as pa
    import pyarrow.parquet as pq

    tdir = fulltext.tables_dir(corpus)
    old_n = 0
    if os.path.isdir(tdir):
        import duckdb
        fs = glob.glob(os.path.join(tdir, "*.parquet"))
        if fs:
            lst = "[" + ",".join("'" + f.replace(os.sep, "/") + "'"
                                 for f in fs) + "]"
            old_n = duckdb.connect().execute(
                f"SELECT COUNT(*) FROM read_parquet({lst})").fetchone()[0]

    recs = _ledger_rows(corpus)
    print(f"[reparse:{corpus}] {len(recs):,} cached documents; "
          f"{old_n:,} tables currently stored (cells: none)", flush=True)

    newdir = tdir + ".new"
    if os.path.isdir(newdir):
        shutil.rmtree(newdir)
    os.makedirs(newdir, exist_ok=True)
    today = date.today().isoformat()

    buf, n_tab, n_doc, n_cells, part, t0 = [], 0, 0, 0, 0, time.monotonic()
    for rec in recs:
        path = rec.get("path")
        if not path or not os.path.isfile(path):
            continue
        try:
            with open(path, "rb") as f:
                xml = f.read()
            tabs = jats.parse_tables(xml)
        except Exception:
            continue
        n_doc += 1
        for ti, t in enumerate(tabs):
            trows = t.get("rows") or []
            n_cells += sum(len(r) for r in trows)
            buf.append({
                "pmcid": rec.get("pmcid"), "pmid": rec.get("pmid"),
                "ncts": rec.get("ncts"), "table_index": ti,
                "label": (t.get("label") or "")[:80],
                "caption": (t.get("caption") or "")[:500],
                "n_rows": len(trows),
                "n_cols": len(t.get("headers") or []),
                "headers": " | ".join(t.get("headers") or []),
                "rows_json": json.dumps(trows, ensure_ascii=False),
                "table_xml": t.get("xml") or "",
                "tier": rec.get("tier"), "corpus": corpus,
                "source_tier": "oa_fulltext",
                "locator": rec.get("locator"), "extracted_at": today,
            })
            n_tab += 1
        if len(buf) >= batch:
            pq.write_table(pa.Table.from_pylist(buf),
                           os.path.join(newdir, f"part_{part:05d}.parquet"),
                           compression="zstd")
            part += 1
            buf = []
            print(f"[reparse:{corpus}] {n_doc:,} docs, {n_tab:,} tables, "
                  f"{n_cells:,} cells ({n_doc/max(time.monotonic()-t0,1e-9)*60:.0f} "
                  f"docs/min)", flush=True)
    if buf:
        pq.write_table(pa.Table.from_pylist(buf),
                       os.path.join(newdir, f"part_{part:05d}.parquet"),
                       compression="zstd")

    if n_tab < old_n:
        raise ValueError(
            f"reparse produced {n_tab:,} tables but the store held {old_n:,} — "
            f"refusing to swap. A backfill that loses tables is a regression "
            f"wearing a fix's clothes. Old store untouched at {tdir}")

    bak = tdir + ".bak"
    if os.path.isdir(bak):
        shutil.rmtree(bak)
    if os.path.isdir(tdir):
        os.rename(tdir, bak)
    os.rename(newdir, tdir)
    shutil.rmtree(bak, ignore_errors=True)

    out = {"corpus": corpus, "documents": n_doc, "tables_before": old_n,
           "tables_after": n_tab, "cells_recovered": n_cells,
           "network_calls": 0, "path": tdir}
    print(f"[reparse] {json.dumps(out, indent=2)}")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="linked_rct",
                    choices=list(fulltext.CORPORA))
    a = ap.parse_args()
    run(a.corpus)
