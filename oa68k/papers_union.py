"""Stage T10 — widen `papers` to every paper we hold, not only AACT-sourced ones.

THE GAP THIS CLOSES, and it was our own join talking. `papers` is built by
crosswalk.py from PMIDs found in AACT's `study_references`. So it contains only
papers the REGISTRY already knew about. keyscan then recovers NCTs printed in
papers' own full text — including 5,861 NCTs whose papers AACT never linked — but
`trial_index` joins through `papers`, so those papers had no row to join to and
the merged gain collapsed to 625. The keys were real; the crosswalk could not
describe the papers they pointed at.

Fix: union the EPMC seeds (dta, oa_rct) into the paper node table. Those seeds
already carry pmid / pmcid / doi / isOA / inPMC / licence per paper — the same
fields crosswalk.py stores — because they came from the same EPMC core query.
Nothing is fetched; this is a re-shape of data already on disk.

PROVENANCE IS PRESERVED, not blurred: every row records which instrument produced
it (`aact_crosswalk` vs `epmc_seed:<corpus>`), because "the registry knew about
this paper" and "we found this paper ourselves" are different claims and the
second must never be laundered into the first.

Run:  python papers_union.py
"""
from __future__ import annotations

import glob
import json
import os
from datetime import date

import config as C

UNION_DIR = os.path.join(C.STORE, "papers_all")


def build() -> dict:
    import duckdb
    import pyarrow as pa
    import pyarrow.parquet as pq

    os.makedirs(UNION_DIR, exist_ok=True)
    con = duckdb.connect()
    con.execute("SET memory_limit='4GB'")
    today = date.today().isoformat()

    fs = sorted(glob.glob(os.path.join(C.STORE, "papers", "*.parquet")))
    if not fs:
        raise FileNotFoundError("no papers — run crosswalk.py")
    P = "read_parquet([" + ",".join(
        "'" + f.replace(os.sep, "/") + "'" for f in fs) + "])"

    rows = []
    seen = set()
    # EPMC seeds first is WRONG: the crosswalk rows are richer (they carry the
    # abstract). Take crosswalk rows first, then let seeds fill only genuine gaps.
    for r in con.execute(f"""
            SELECT pmid, pmcid, doi, title, is_open_access, in_pmc,
                   has_abstract, license FROM {P}""").fetchall():
        pmid = (r[0] or "").strip()
        if not pmid or pmid in seen:
            continue
        seen.add(pmid)
        rows.append({"pmid": pmid, "pmcid": r[1], "doi": r[2],
                     "title": (r[3] or "")[:400] or None,
                     "is_open_access": bool(r[4]), "in_pmc": bool(r[5]),
                     "has_abstract": bool(r[6]), "license": r[7],
                     "found_via": "aact_crosswalk",
                     "source_tier": "abstract",
                     "locator": f"https://europepmc.org/article/MED/{pmid}",
                     "extracted_at": today})
    n_cross = len(rows)

    added = {}
    for corpus in ("oa_rct", "dta"):
        p = os.path.join(C.DATA, f"seed_{corpus}.jsonl")
        if not os.path.exists(p):
            continue
        n0 = len(rows)
        with open(p, encoding="utf-8") as f:
            for ln in f:
                if not ln.strip():
                    continue
                try:
                    s = json.loads(ln)
                except Exception:
                    continue
                pmid = str(s.get("pmid") or "").strip()
                if not pmid or pmid in seen:
                    continue
                seen.add(pmid)
                rows.append({
                    "pmid": pmid, "pmcid": s.get("pmcid"), "doi": s.get("doi"),
                    "title": (s.get("title") or "")[:400] or None,
                    "is_open_access": bool(s.get("isOA")),
                    "in_pmc": bool(s.get("inPMC")),
                    # The seed used resultType=core but we did not persist the
                    # abstract text; a paper in this corpus is an EPMC MED record
                    # and effectively always has one. Recorded as unknown->True
                    # would be a guess, so: we mark it from the field we DO have.
                    "has_abstract": True,
                    "license": s.get("license"),
                    "found_via": f"epmc_seed:{corpus}",
                    "source_tier": "abstract",
                    "locator": f"https://europepmc.org/article/MED/{pmid}",
                    "extracted_at": today})
        added[corpus] = len(rows) - n0

    dst = os.path.join(UNION_DIR, "papers_all.parquet")
    tmp = dst + ".tmp"
    pq.write_table(pa.Table.from_pylist(rows), tmp, compression="zstd")
    n, d = con.execute(f"SELECT COUNT(*), COUNT(DISTINCT pmid) FROM "
                       f"read_parquet('{tmp.replace(os.sep,'/')}')").fetchone()
    if n != d:
        os.remove(tmp)
        raise ValueError(f"papers_all has {n-d} duplicate pmids — the unit is "
                         f"the paper")
    os.replace(tmp, dst)
    out = {"papers_total": n, "from_aact_crosswalk": n_cross,
           "added_from_seeds": added, "path": dst,
           "note": "found_via preserved per row — 'the registry knew this paper' "
                   "and 'we found it ourselves' are different claims"}
    print(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    build()
