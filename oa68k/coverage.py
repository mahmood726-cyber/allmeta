"""The coverage ledger — what the store ACTUALLY holds, per field, batch-actual.

Every number here is counted from the extracted store on disk. Nothing is
extrapolated, modelled or inferred from a rate. If a stage has not run, its
counts read 0 and say so; they are never scaled up to a corpus total. The
`--project` flag exists to answer planning questions, and everything it prints is
explicitly stamped PLANNING-ONLY so it can never be quoted as a result.

The three layers (Mahmood's three-layer rule), reported as a real intersection:
  layer 1 registry   — the trial has a structured registry record
  layer 2 abstract   — a linked paper with an abstract resolved via EPMC
  layer 3 OA fulltext— a linked paper that is open-access AND in PMC

`all_three` is computed by joining, not by multiplying rates.

Run:  python coverage.py            # the ledger
      python coverage.py --fields   # per-field fill rates
      python coverage.py --json
"""
from __future__ import annotations

import argparse
import glob
import json
import os

import config as C

# Fields whose fill rate is worth reporting: the ones a synthesist actually needs.
TRIAL_FIELDS = [
    "brief_title", "phase", "overall_status", "enrollment", "number_of_arms",
    "allocation", "intervention_model", "masking", "primary_purpose",
    "start_date", "primary_completion_date", "results_first_posted_date",
    "lead_sponsor", "lead_sponsor_class", "conditions", "countries",
    "why_stopped", "source_org",
]


def _glob(table: str) -> list:
    return sorted(glob.glob(os.path.join(C.STORE, table, "*.parquet")))


def _lst(files: list) -> str:
    return "[" + ",".join("'" + f.replace(os.sep, "/") + "'" for f in files) + "]"


def _has(table: str) -> bool:
    return bool(_glob(table))


def report(fields: bool = False) -> dict:
    import duckdb
    con = duckdb.connect()
    con.execute("SET memory_limit='4GB'")
    out: dict = {"aact_snapshot": C.AACT_SNAPSHOT, "store": C.STORE,
                 "basis": "batch-actual counts from the extracted store"}

    if not _has("trials"):
        out["error"] = "no trials extracted yet — run registry_full.py"
        return out

    T = f"read_parquet({_lst(_glob('trials'))})"
    row = con.execute(f"""
        SELECT COUNT(*), COUNT(DISTINCT nct_id),
               SUM(CASE WHEN results_posted THEN 1 ELSE 0 END),
               SUM(CASE WHEN has_ae_table THEN 1 ELSE 0 END),
               SUM(CASE WHEN has_african_site THEN 1 ELSE 0 END),
               SUM(CASE WHEN cohort='p0_malaria_tb_hiv' THEN 1 ELSE 0 END),
               SUM(CASE WHEN n_result_rows>0 THEN 1 ELSE 0 END)
        FROM {T}""").fetchone()
    out["registry"] = {
        "rct_records": row[0], "distinct_ncts": row[1],
        "with_posted_results": row[2],
        "with_structured_ae_table": row[3],
        "with_african_site": row[4],
        "priority_malaria_tb_hiv": row[5],
        "with_outcome_measurements": row[6],
        "results_posted_pct": round(100.0 * row[2] / row[0], 1) if row[0] else 0,
    }
    if row[0] != row[1]:
        out["registry"]["WARNING"] = (
            f"{row[0]-row[1]} duplicate trial rows — the unit is the trial; "
            f"investigate before using any count")

    # ---- row volumes actually extracted (the harms + results layers)
    vols = {}
    for t in ["trial_results", "trial_ae", "trial_sites", "trial_arms",
              "trial_interventions", "trial_outcomes", "trial_refs"]:
        vols[t] = con.execute(
            f"SELECT COUNT(*) FROM read_parquet({_lst(_glob(t))})").fetchone()[0] \
            if _has(t) else 0
    out["extracted_rows"] = vols

    # ---- arm-identity health: the killer, measured rather than assumed
    if _has("trial_results"):
        R = f"read_parquet({_lst(_glob('trial_results'))})"
        r = con.execute(f"""
            SELECT COUNT(*), SUM(CASE WHEN group_resolved THEN 1 ELSE 0 END)
            FROM {R}""").fetchone()
        out["arm_identity"] = {
            "result_rows": r[0], "arm_resolved": r[1],
            "arm_unresolved": r[0] - r[1],
            "resolved_pct": round(100.0 * r[1] / r[0], 3) if r[0] else 0,
            "note": ("arms keyed on result_group_id; ctgov_group_code is a "
                     "per-outcome label and is NOT used as an arm key"),
        }

    # ---- the three layers, as a real join
    if _has("papers"):
        P = f"read_parquet({_lst(_glob('papers'))})"
        REF = f"read_parquet({_lst(_glob('trial_refs'))})"
        p = con.execute(f"""
            SELECT COUNT(*), SUM(CASE WHEN has_abstract THEN 1 ELSE 0 END),
                   SUM(CASE WHEN is_open_access AND in_pmc THEN 1 ELSE 0 END)
            FROM {P}""").fetchone()
        out["papers_resolved"] = {
            "paper_nodes": p[0], "with_abstract": p[1], "oa_and_in_pmc": p[2]}

        # Trial-level layers. reference_type matters: only DERIVED/RESULT links
        # are evidence the paper reports THIS trial; BACKGROUND is a citation.
        lay = con.execute(f"""
            WITH linked AS (
              SELECT r.nct_id, p.has_abstract,
                     (p.is_open_access AND p.in_pmc) AS oa_ft
              FROM {REF} r JOIN {P} p ON p.pmid = trim(r.pmid)
              WHERE upper(r.reference_type) IN ('DERIVED','RESULT')
            ),
            per_trial AS (
              SELECT nct_id,
                     MAX(CASE WHEN has_abstract THEN 1 ELSE 0 END) AS l2,
                     MAX(CASE WHEN oa_ft THEN 1 ELSE 0 END) AS l3
              FROM linked GROUP BY nct_id
            )
            SELECT
              (SELECT COUNT(*) FROM {T}) AS l1_registry,
              COUNT(*) AS with_any_result_link,
              SUM(l2) AS l2_abstract,
              SUM(l3) AS l3_oa_fulltext,
              SUM(CASE WHEN l2=1 AND l3=1 THEN 1 ELSE 0 END) AS l2_and_l3
            FROM per_trial
        """).fetchone()
        t3 = con.execute(f"""
            WITH linked AS (
              SELECT r.nct_id, p.has_abstract,
                     (p.is_open_access AND p.in_pmc) AS oa_ft
              FROM {REF} r JOIN {P} p ON p.pmid = trim(r.pmid)
              WHERE upper(r.reference_type) IN ('DERIVED','RESULT')
            ),
            per_trial AS (
              SELECT nct_id, MAX(CASE WHEN has_abstract THEN 1 ELSE 0 END) l2,
                     MAX(CASE WHEN oa_ft THEN 1 ELSE 0 END) l3
              FROM linked GROUP BY nct_id
            )
            SELECT COUNT(*) FROM per_trial pt
            JOIN {T} t ON t.nct_id = pt.nct_id
            WHERE t.results_posted AND pt.l2=1 AND pt.l3=1
        """).fetchone()[0]
        out["three_layers"] = {
            "layer1_registry_record": lay[0],
            "trials_with_result_paper_link": lay[1],
            "layer2_abstract": lay[2],
            "layer3_oa_fulltext": lay[3],
            "layer2_and_layer3": lay[4],
            "all_three_registry_results_abstract_oaft": t3,
            "note": ("crosswalk is incremental — layers 2/3 are floors that rise "
                     "as crosswalk.py resolves more PMIDs; only DERIVED/RESULT "
                     "reference types count as 'reports this trial'"),
        }
        cw_done = sum(1 for _ in open(
            os.path.join(C.DATA, f"crosswalk.{C.NODE}.jsonl"), encoding="utf-8")) \
            if os.path.exists(os.path.join(C.DATA, f"crosswalk.{C.NODE}.jsonl")) else 0
        out["three_layers"]["crosswalk_pmids_attempted"] = cw_done
    else:
        out["three_layers"] = {"status": "crosswalk not run — layers 2/3 unmeasured"}

    if fields:
        out["field_fill_rates_pct"] = _fill_rates(con, T)
    return out


def _fill_rates(con, T: str) -> dict:
    n = con.execute(f"SELECT COUNT(*) FROM {T}").fetchone()[0]
    if not n:
        return {}
    cols = {r[0] for r in con.execute(f"DESCRIBE SELECT * FROM {T}").fetchall()}
    exprs = []
    present = [f for f in TRIAL_FIELDS if f in cols]
    for f in present:
        exprs.append(f"SUM(CASE WHEN \"{f}\" IS NULL OR CAST(\"{f}\" AS VARCHAR)='' "
                     f"THEN 0 ELSE 1 END)")
    row = con.execute(f"SELECT {', '.join(exprs)} FROM {T}").fetchone()
    return {f: round(100.0 * v / n, 1) for f, v in zip(present, row)}


def _fmt(d: dict) -> str:
    return json.dumps(d, indent=2, default=str)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--fields", action="store_true", help="per-field fill rates")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    rep = report(fields=a.fields)
    print(_fmt(rep))
