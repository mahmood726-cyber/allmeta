"""Stage 0b — convert the AACT tables the parquet mirror does NOT carry.

The upstream mirror (`config.find_aact()`) is a 12-table subset. The registry
layer needs four things it does not have:

  study_references  -> NCT <-> PMID crosswalk      (the trial<->paper link)
  facilities        -> per-site city/state/country (the African-site flag)
  countries         -> declared trial countries
  result_groups     -> ctgov_group_code -> arm title/description (arm IDENTITY;
                       group mix-ups are the known killer, so the code->title
                       map is copied from the registry, never inferred)
  design_outcomes   -> registered outcomes + time_frame for trials with NO
                       posted results (the pre-results outcome layer)

Source is the full pipe-delimited dump at the SAME snapshot as the mirror
(2026-04-12), so joins across both roots are consistent by construction. We read
`all_varchar` — AACT ships free text with embedded newlines and `~` line
substitutes, and letting duckdb sniff types silently coerces IDs. Casting is the
consumer's job, explicitly.

Idempotent + resumable: a table already converted is skipped unless --force.
Atomic: writes to `.tmp` then `os.replace`, so a kill cannot leave a torn file.
Fail-closed: a converted table with 0 rows is an error, not an empty success.

Run:  python aact_ext.py [--only study_references,facilities] [--force]
"""
from __future__ import annotations

import argparse
import os
import time

import config as C


def _read_csv_expr(path: str) -> str:
    """A duckdb SELECT over one AACT flat file. Quoted, pipe-delimited, all text.

    Returns a full query (not a bare table function) because COPY takes a query.
    """
    p = path.replace(os.sep, "/")
    return (
        f"SELECT * FROM read_csv('{p}', delim='|', header=true, quote='\"', "
        f"escape='\"', all_varchar=true, null_padding=true, "
        f"ignore_errors=false, parallel=true)"
    )


def convert_one(con, flat_root: str, table: str, force: bool = False) -> dict:
    src = os.path.join(flat_root, f"{table}.txt")
    if not os.path.isfile(src):
        raise FileNotFoundError(f"AACT flat file missing: {src}")
    dst = os.path.join(C.AACT_EXT, f"{table}.parquet")

    if os.path.isfile(dst) and not force:
        n = con.execute(
            f"SELECT COUNT(*) FROM read_parquet('{dst.replace(os.sep,'/')}')"
        ).fetchone()[0]
        return {"table": table, "status": "skip-exists", "rows": n}

    tmp = dst + ".tmp"
    t0 = time.monotonic()
    con.execute(
        f"COPY ({_read_csv_expr(src)}) TO '{tmp.replace(os.sep,'/')}' "
        f"(FORMAT PARQUET, COMPRESSION ZSTD)"
    )
    n = con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{tmp.replace(os.sep,'/')}')"
    ).fetchone()[0]
    if n == 0:
        os.remove(tmp)
        raise ValueError(f"{table}: converted to 0 rows — refusing to publish "
                         f"an empty table (source {src} is non-empty on disk)")
    os.replace(tmp, dst)
    return {"table": table, "status": "converted", "rows": n,
            "secs": round(time.monotonic() - t0, 1),
            "mb": round(os.path.getsize(dst) / 1e6, 1)}


def run(only: list[str] | None = None, force: bool = False) -> list[dict]:
    import duckdb

    flat_root = C.require_aact_flat()
    os.makedirs(C.AACT_EXT, exist_ok=True)
    con = duckdb.connect()
    # Bound memory: pc1 has headroom but the 68k harvest shares this box.
    con.execute("SET memory_limit='6GB'")
    con.execute("SET preserve_insertion_order=false")

    tables = only or C.AACT_EXT_TABLES
    out = []
    for t in tables:
        try:
            r = convert_one(con, flat_root, t, force=force)
        except Exception as e:
            r = {"table": t, "status": "ERROR", "error": str(e)[:300]}
        out.append(r)
        print(f"[aact_ext] {r}", flush=True)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated table subset")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    only = [x.strip() for x in a.only.split(",") if x.strip()] or None
    res = run(only, a.force)
    bad = [r for r in res if r["status"] == "ERROR"]
    print(f"\n[aact_ext] {len(res)-len(bad)}/{len(res)} ok, {len(bad)} errors")
    raise SystemExit(1 if bad else 0)
