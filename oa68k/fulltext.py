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
import time
from datetime import date

import config as C
import harvest
import jats
from net import PoliteSession, append_jsonl, load_done_keys

FT_LEDGER = os.path.join(C.DATA, f"paperft.{C.NODE}.jsonl")
TABLES_DIR = os.path.join(C.STORE, "paper_tables")


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


def run(limit: int | None, all_: bool = False) -> dict:
    C.ensure_dirs()
    os.makedirs(TABLES_DIR, exist_ok=True)
    today = date.today().isoformat()
    cands = candidates()
    done = load_done_keys(FT_LEDGER, "pmcid")
    todo = [c for c in cands if c["pmcid"] not in done]
    if not all_ and limit:
        todo = todo[:limit]
    print(f"[fulltext] {len(cands)} OA trial papers; {len(done)} done; "
          f"fetching {len(todo)}", flush=True)

    sess = PoliteSession()
    agg = {"fetched": 0, "missed": 0, "with_tables": 0, "tables": 0}
    buf, t0 = [], time.monotonic()
    for i, c in enumerate(todo):
        rec = harvest.fetch_fulltext(sess, c)
        rec.update(ncts=c["ncts"], cohort_rank=c["cohort_rank"],
                   source_tier="oa_fulltext", extracted_at=today,
                   locator=f"https://europepmc.org/article/PMC/{c['pmcid']}")
        n_tab = 0
        if rec["status"] == "XML" and rec.get("path"):
            try:
                with open(rec["path"], "rb") as f:
                    xml = f.read()
                tabs = jats.parse_tables(xml)
                n_tab = len(tabs)
                for ti, t in enumerate(tabs):
                    buf.append({
                        "pmcid": c["pmcid"], "pmid": c["pmid"], "ncts": c["ncts"],
                        "table_index": ti,
                        "caption": (t.get("caption") or "")[:500],
                        "n_rows": len(t.get("rows") or []),
                        "n_cols": len(t.get("headers") or []),
                        "headers": " | ".join(t.get("headers") or []),
                        "tier": rec.get("tier"),
                        "source_tier": "oa_fulltext",
                        "locator": rec["locator"], "extracted_at": today,
                    })
            except Exception as e:
                rec["table_parse_error"] = str(e)[:200]
        rec["n_tables"] = n_tab
        append_jsonl(FT_LEDGER, rec)
        if rec["status"] == "XML":
            agg["fetched"] += 1
            agg["with_tables"] += int(n_tab > 0)
            agg["tables"] += n_tab
        else:
            agg["missed"] += 1
        if len(buf) >= 2000:
            _flush(buf)
            buf = []
        if (i + 1) % 50 == 0:
            rate = (i + 1) / max(time.monotonic() - t0, 1e-9) * 60
            print(f"[fulltext] {i+1}/{len(todo)} ({rate:.0f}/min) "
                  f"xml={agg['fetched']} tables={agg['tables']}", flush=True)
    if buf:
        _flush(buf)
    print(f"[fulltext] {agg}")
    return agg


def _flush(rows: list[dict]) -> None:
    import pyarrow as pa
    import pyarrow.parquet as pq
    n = len(glob.glob(os.path.join(TABLES_DIR, "part_*.parquet")))
    dst = os.path.join(TABLES_DIR, f"part_{n:05d}.parquet")
    tmp = dst + ".tmp"
    pq.write_table(pa.Table.from_pylist(rows), tmp, compression="zstd")
    os.replace(tmp, dst)
    print(f"[fulltext] wrote {len(rows)} table rows -> {os.path.basename(dst)}",
          flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    print(json.dumps(run(a.limit, a.all), indent=2))
