"""Stage T2 — the NCT <-> PMID <-> DOI <-> PMCID crosswalk, and the OA/abstract
availability flags that drive the coverage ledger.

The trial is the unit. A trial recurs across many papers (primary report,
secondary analyses, the meta-analyses that pool it), so the crosswalk is
deliberately many-to-many at the paper end and collapses to ONE node at the trial
end. Nothing here counts a trial twice because it was published twice.

Registry side (offline, free): `study_references` gives NCT -> PMID with a
`reference_type` — DERIVED (NLM auto-linked from the article's own registry
field), RESULT (author-declared results paper), BACKGROUND (context citation).
That distinction matters and is preserved: a BACKGROUND citation is NOT evidence
that the paper reports the trial, and treating it as such would attach the wrong
effect data to a trial.

Paper side (network): Europe PMC resolves each PMID to DOI/PMCID and tells us
whether the full text is open-access and in PMC — which is exactly the "layer 3"
availability signal. One `resultType=core` pass yields the IDs, the OA flags and
the abstract together, so we make one network pass, not three.

Resume: set-difference on PMIDs already in the ledger (same discipline as
harvest). Kill it any time; re-running skips what landed.

Run:  python crosswalk.py --limit 5000     # bounded slice
      python crosswalk.py --all
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import time
from datetime import date

import config as C
from net import PoliteSession, append_jsonl, load_done_keys

CROSSWALK_LEDGER = os.path.join(C.DATA, f"crosswalk.{C.NODE}.jsonl")
PAPERS_DIR = os.path.join(C.STORE, "papers")

PMID_RE = re.compile(r"^\d{1,9}$")
CHUNK = 80          # EXT_ID ORs per EPMC query; keeps the URL well under limits


def collect_pmids(link_types_only: bool = True) -> list:
    """Distinct well-formed PMIDs linked to any RCT in the store, ordered by
    (reports-this-trial, priority cohort, pmid).

    Ordering is load-bearing, not cosmetic — two measured reasons:

    1. **reference_type.** Only DERIVED (NLM-derived: this paper reports this
       trial) and RESULT (author-declared results paper) are evidence that the
       paper reports the trial. BACKGROUND means the trial merely CITES the
       paper. Measured on this store: 448,231 distinct linked PMIDs, of which
       only 178,236 are DERIVED/RESULT — **269,995 (60.2%) are BACKGROUND-only**
       and can never contribute to the three-layer rule. Fetching them first
       would spend ~60% of the network budget on papers we then discard. (The
       68k lane's linkmap.py measured the same contamination corpus-wide: 68% of
       AACT's crosswalk rows are BACKGROUND, worst fan-out 301 NCTs for one
       famous citation.)
    2. **Cohort.** Malaria/TB/HIV first, per the standing priority.

    Sorting by PMID alone walks oldest-first (a 240-PMID probe resolved just 2
    open-access full texts, because 1970s-80s papers predate OA) — deterministic
    but the wrong order, and a misleading early read on coverage.

    `link_types_only=False` widens to BACKGROUND for a completeness pass; those
    paper nodes are real, just not trial evidence.
    """
    import duckdb
    refs = sorted(glob.glob(os.path.join(C.STORE, "trial_refs", "*.parquet")))
    trials = sorted(glob.glob(os.path.join(C.STORE, "trials", "*.parquet")))
    if not refs:
        raise FileNotFoundError(
            "no trial_refs in the store — run registry_full.py first")

    def lst(fs):
        return "[" + ",".join("'" + f.replace(os.sep, "/") + "'" for f in fs) + "]"

    where = ("AND upper(reference_type) IN ('DERIVED','RESULT')"
             if link_types_only else "")
    con = duckdb.connect()
    cohort_join = (f"LEFT JOIN (SELECT nct_id, cohort FROM "
                   f"read_parquet({lst(trials)})) t ON t.nct_id = r.nct_id"
                   if trials else "")
    cohort_expr = ("MIN(CASE WHEN t.cohort = 'p0_malaria_tb_hiv' THEN 0 ELSE 1 END)"
                   if trials else "1")
    rows = con.execute(f"""
        WITH r AS (
          SELECT trim(pmid) AS pmid, nct_id, reference_type
          FROM read_parquet({lst(refs)})
          WHERE pmid IS NOT NULL AND trim(pmid) <> '' {where}
        )
        SELECT r.pmid,
               MIN(CASE WHEN upper(r.reference_type) IN ('DERIVED','RESULT')
                        THEN 0 ELSE 1 END) AS reports_trial,
               {cohort_expr} AS cohort_rank
        FROM r {cohort_join}
        GROUP BY r.pmid
        ORDER BY reports_trial, cohort_rank, CAST(r.pmid AS BIGINT)
    """).fetchall()

    # Fail closed on junk rather than sending it to EPMC: a non-numeric "pmid"
    # is a data-quality signal, not something to silently coerce.
    good = [r[0] for r in rows if PMID_RE.match(r[0] or "")]
    bad = len(rows) - len(good)
    if bad:
        print(f"[crosswalk] {bad} malformed pmid values skipped (non-numeric)")
    return good


def _epmc_query(pmids: list[str]) -> str:
    return "(" + " OR ".join(f"EXT_ID:{p}" for p in pmids) + ") AND SRC:MED"


def fetch_chunk(sess: PoliteSession, pmids: list[str]) -> dict:
    """Resolve up to CHUNK PMIDs to IDs + OA flags + abstract in one call."""
    r = sess.get(C.EPMC_SEARCH, params={
        "query": _epmc_query(pmids), "format": "json",
        "resultType": "core", "pageSize": len(pmids)})
    if r.status_code != 200:
        raise RuntimeError(f"EPMC {r.status_code} for chunk of {len(pmids)}")
    return r.json().get("resultList", {}).get("result", [])


def _row(rec: dict, today: str) -> dict:
    """Flatten one EPMC record into the paper node. Booleans come back as the
    strings 'Y'/'N' — compare explicitly; truthiness of 'N' is True."""
    def yn(k):
        return str(rec.get(k, "")).upper() == "Y"
    abstract = rec.get("abstractText") or None
    return {
        "pmid": str(rec.get("pmid") or ""),
        "pmcid": rec.get("pmcid") or None,
        "doi": (rec.get("doi") or "").lower() or None,
        "title": (rec.get("title") or "")[:500] or None,
        "journal": ((rec.get("journalInfo") or {}).get("journal") or {}).get("title"),
        "pub_year": rec.get("pubYear"),
        "pub_types": " | ".join((rec.get("pubTypeList") or {}).get("pubType") or []),
        "is_open_access": yn("isOpenAccess"),
        "in_epmc": yn("inEPMC"),
        "in_pmc": yn("inPMC"),
        "has_pdf": yn("hasPDF"),
        "has_abstract": bool(abstract),
        "abstract": abstract,
        "abstract_chars": len(abstract) if abstract else 0,
        "cited_by_count": rec.get("citedByCount"),
        "license": rec.get("license") or None,
        "source_tier": "abstract",
        "locator": f"https://europepmc.org/article/MED/{rec.get('pmid')}",
        "extracted_at": today,
    }


def run(limit: int | None = None, all_: bool = False,
        include_background: bool = False) -> dict:
    os.makedirs(PAPERS_DIR, exist_ok=True)
    today = date.today().isoformat()
    want = collect_pmids(link_types_only=not include_background)  # priority-ordered
    done = load_done_keys(CROSSWALK_LEDGER, "pmid")
    todo = [p for p in want if p not in done]    # preserve that order
    if not all_ and limit:
        todo = todo[:limit]
    print(f"[crosswalk] {len(want)} linked PMIDs; {len(done)} done; "
          f"fetching {len(todo)}", flush=True)

    sess = PoliteSession()
    agg = {"requested": 0, "resolved": 0, "unresolved": 0, "oa_fulltext": 0,
           "with_abstract": 0, "errors": 0}
    buf, t0 = [], time.monotonic()
    for i in range(0, len(todo), CHUNK):
        chunk = todo[i:i + CHUNK]
        try:
            recs = fetch_chunk(sess, chunk)
        except Exception as e:
            agg["errors"] += 1
            print(f"[crosswalk] chunk {i//CHUNK} error: {str(e)[:150]}", flush=True)
            continue
        got = set()
        for rec in recs:
            row = _row(rec, today)
            if not row["pmid"]:
                continue
            got.add(row["pmid"])
            buf.append(row)
            append_jsonl(CROSSWALK_LEDGER, {"pmid": row["pmid"], "status": "ok",
                                            "pmcid": row["pmcid"], "doi": row["doi"],
                                            "is_open_access": row["is_open_access"],
                                            "in_pmc": row["in_pmc"],
                                            "has_abstract": row["has_abstract"]})
            agg["resolved"] += 1
            agg["oa_fulltext"] += int(row["is_open_access"] and row["in_pmc"])
            agg["with_abstract"] += int(row["has_abstract"])
        # A PMID EPMC does not return is recorded as unresolved — an explicit
        # gap, so resume never re-requests it and coverage never over-claims.
        for p in chunk:
            if p not in got:
                append_jsonl(CROSSWALK_LEDGER, {"pmid": p, "status": "unresolved"})
                agg["unresolved"] += 1
        agg["requested"] += len(chunk)

        if len(buf) >= 2000:
            _flush(buf)
            buf = []
        if (i // CHUNK) % 25 == 0 and i:
            rate = agg["requested"] / max(time.monotonic() - t0, 1e-9) * 60
            print(f"[crosswalk] {agg['requested']}/{len(todo)} pmids "
                  f"({rate:.0f}/min) resolved={agg['resolved']} "
                  f"oa_ft={agg['oa_fulltext']}", flush=True)
    if buf:
        _flush(buf)
    print(f"[crosswalk] {agg}")
    return agg


def _flush(rows: list[dict]) -> None:
    """Append a parquet shard of paper nodes. Shard name is content-derived so a
    re-run cannot silently overwrite a previous shard's rows."""
    import pyarrow as pa
    import pyarrow.parquet as pq
    n = len(glob.glob(os.path.join(PAPERS_DIR, "part_*.parquet")))
    dst = os.path.join(PAPERS_DIR, f"part_{n:05d}.parquet")
    tmp = dst + ".tmp"
    pq.write_table(pa.Table.from_pylist(rows), tmp, compression="zstd")
    os.replace(tmp, dst)
    print(f"[crosswalk] wrote {len(rows)} paper nodes -> {os.path.basename(dst)}",
          flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=2000)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--include-background", action="store_true",
                    help="also fetch BACKGROUND-only PMIDs (60%% of links; they "
                         "do NOT report the trial — completeness pass only)")
    a = ap.parse_args()
    print(json.dumps(run(a.limit, a.all, a.include_background), indent=2))
