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


def collect_pmids() -> list:
    """Distinct well-formed PMIDs linked to any RCT in the store, ordered by
    cohort priority (malaria/TB/HIV first), then PMID.

    Ordering is load-bearing, not cosmetic. Sorting by PMID alone walks the
    corpus oldest-first — a probe of the first 240 resolved only 2 open-access
    full texts, because 1970s-80s papers predate OA entirely. That is both the
    wrong order for Mahmood's priority and a misleading first read on coverage.
    A PMID linked to any priority trial is fetched in the priority pass.
    """
    import duckdb
    refs = sorted(glob.glob(os.path.join(C.STORE, "trial_refs", "*.parquet")))
    trials = sorted(glob.glob(os.path.join(C.STORE, "trials", "*.parquet")))
    if not refs:
        raise FileNotFoundError(
            "no trial_refs in the store — run registry_full.py first")

    def lst(fs):
        return "[" + ",".join("'" + f.replace(os.sep, "/") + "'" for f in fs) + "]"

    con = duckdb.connect()
    rows = con.execute(f"""
        WITH r AS (
          SELECT trim(pmid) AS pmid, nct_id FROM read_parquet({lst(refs)})
          WHERE pmid IS NOT NULL AND trim(pmid) <> ''
        ),
        t AS (SELECT nct_id, cohort FROM read_parquet({lst(trials)}))
        SELECT r.pmid,
               MIN(CASE WHEN t.cohort = 'p0_malaria_tb_hiv' THEN 0 ELSE 1 END) AS rank
        FROM r LEFT JOIN t ON t.nct_id = r.nct_id
        GROUP BY r.pmid
        ORDER BY rank, CAST(r.pmid AS BIGINT)
    """).fetchall() if trials else con.execute(f"""
        SELECT DISTINCT trim(pmid), 1 FROM read_parquet({lst(refs)})
        WHERE pmid IS NOT NULL AND trim(pmid) <> ''""").fetchall()

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


def run(limit: int | None = None, all_: bool = False) -> dict:
    os.makedirs(PAPERS_DIR, exist_ok=True)
    today = date.today().isoformat()
    want = collect_pmids()                       # already priority-ordered
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
    a = ap.parse_args()
    print(json.dumps(run(a.limit, a.all), indent=2))
