"""Stage 4 — PRE-EXTRACT: registry-direct structured records for linked trials.

For every distinct NCT the detect stage found inside the OA metas, copy the
structured registry fields from the offline AACT parquet mirror (no internet, no
model): identity + design + whether it has posted results + how many structured
outcome measurements + how many adverse-event cells. Numbers are COPIED, not read
(method=registry-direct, confidence=copy-fidelity). This is the raw material for
Tier-2 synthesis and the Tier-1 mirror index.

Resumable: skips NCTs already in the pre-extract ledger. Memory-aware: NCTs are
queried in chunks against parquet via duckdb.

Run:  python preextract.py [--chunk 500]
"""
from __future__ import annotations

import argparse
import glob
import json
import os

import config as C
from net import append_jsonl, load_done_keys


def _pq(root: str, table: str) -> str:
    files = glob.glob(os.path.join(root, table, "*.parquet"))
    return "read_parquet([" + ",".join("'" + f.replace(os.sep, "/") + "'" for f in files) + "])"


def collect_ncts() -> set:
    """Union of NCTs across ALL node detect ledgers — pc1 (holder of the AACT
    mirror) pre-extracts registry data for both its own and the laptop's shard.

    Prefers detect2 (table-scoped + reference_type-filtered link layer). Falls back
    to v1 detect ledgers only if no v2 exists — v1's links are BACKGROUND-contaminated
    (74% false), so mixing them would poison the trial set.
    """
    ncts = set()
    # newest detector wins: v3 (column-semantic, JATS) > v2 > v1. Never mix — v1/v2
    # links are BACKGROUND-contaminated (74% false).
    paths = next((C.node_ledgers(s) for s in ("detect3", "detect2", "detect")
                  if C.node_ledgers(s)), [])
    for path in paths:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    for n in json.loads(line).get("ncts", []):
                        ncts.add(n)
                except Exception:
                    continue
    return ncts


def run(chunk: int = 500) -> dict:
    import duckdb
    root = C.require_aact()
    con = duckdb.connect()
    studies = _pq(root, "studies")
    om = _pq(root, "outcome_measurements")
    re_ = _pq(root, "reported_events")

    done = load_done_keys(C.PREEXTRACT_LEDGER, "nct_id")
    want = sorted(collect_ncts() - done)
    n_written = n_results = n_ae = 0
    for i in range(0, len(want), chunk):
        batch = want[i:i + chunk]
        inlist = ",".join("'" + x + "'" for x in batch)
        rows = con.execute(f"""
            WITH s AS (SELECT nct_id, brief_title, phase, overall_status,
                              enrollment, number_of_arms, study_type,
                              results_first_posted_date
                       FROM {studies} WHERE nct_id IN ({inlist})),
                 oc AS (SELECT nct_id, COUNT(*) n_meas,
                               SUM(CASE WHEN param_type ILIKE '%count%'
                                        OR param_type ILIKE '%number%' THEN 1 ELSE 0 END) n_count
                        FROM {om} WHERE nct_id IN ({inlist}) GROUP BY nct_id),
                 ae AS (SELECT nct_id, COUNT(*) n_ae_cells
                        FROM {re_} WHERE nct_id IN ({inlist})
                          AND subjects_at_risk IS NOT NULL GROUP BY nct_id)
            SELECT s.nct_id, s.brief_title, s.phase, s.overall_status, s.enrollment,
                   s.number_of_arms, s.study_type, s.results_first_posted_date,
                   COALESCE(oc.n_meas,0), COALESCE(oc.n_count,0), COALESCE(ae.n_ae_cells,0)
            FROM s LEFT JOIN oc USING(nct_id) LEFT JOIN ae USING(nct_id)
        """).fetchall()
        found = set()
        for r in rows:
            found.add(r[0])
            has_results = r[7] is not None
            rec = {
                "nct_id": r[0], "method": "registry-direct", "confidence": 1.0,
                "brief_title": (r[1] or "")[:200], "phase": r[2],
                "overall_status": r[3], "enrollment": r[4], "number_of_arms": r[5],
                "study_type": r[6], "results_posted": has_results,
                "n_outcome_measurements": r[8], "n_count_measurements": r[9],
                "n_ae_cells": r[10],
                "poolable_registry_2x2": bool(has_results and r[9] > 0),
            }
            append_jsonl(C.PREEXTRACT_LEDGER, rec)
            n_written += 1
            n_results += int(has_results)
            n_ae += int(r[10] > 0)
        # NCTs cited by metas but absent from this AACT snapshot -> record as such
        for nct in batch:
            if nct not in found:
                append_jsonl(C.PREEXTRACT_LEDGER, {
                    "nct_id": nct, "method": "registry-direct",
                    "in_aact_snapshot": False})
                n_written += 1
    summary = {"ncts_seen": len(want), "records_written": n_written,
               "with_posted_results": n_results, "with_ae_table": n_ae}
    print(f"[preextract] {summary}")
    return summary


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--chunk", type=int, default=500)
    a = ap.parse_args()
    run(a.chunk)
