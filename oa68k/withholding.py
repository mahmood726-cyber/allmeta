"""Stage T8 — the withholding / non-publication signal, by PHASE.

A registered trial that completed, posted no results, and produced no publication
is the pattern we exist to find: the evidence base is missing a study that we can
prove existed, because its own registration says so. That is the one bias you
cannot see from the published literature — by construction.

THE THREE-LAYER RULE IS THE WHOLE METHOD HERE. "Withheld" is a claim that ALL
layers failed, so it is only defensible if all three were actually tried:
    layer 1 registry  — did it post structured results?
    layer 2 abstract  — is there a DERIVED/RESULT paper with an abstract?
    layer 3 OA text   — is there an open-access full text?
A trial is a withholding CANDIDATE only when all three return nothing. Calling a
trial withheld off the registry layer alone would be the single-layer artefact
the contract names four times (14% recall, 17% cells, 94% not-adjudicable, zero
malaria/TB pairs) — each true of our pipeline and false of the world.

PHASE MATTERS, and the phase distribution says our sweep is not filtered:
    NA 157,483 (54.2%) | PHASE3 34,985 | PHASE2 34,640 | PHASE4 26,370
    PHASE1 21,841 | PHASE1/2 6,429 | PHASE2/3 6,169 | EARLY_PHASE1 2,766
Phase 2 is at parity with phase 3 (34,640 vs 34,985) and posts results at the
same rate (30.0% vs 30.2%) — so there is no silent phase-3 filter, and phase 2 is
NOT thin. That matters because phase 2 is where drugs die quietly: it is prime
territory for non-publication, and the results-posting rate alone does not show
it — only the publication layer does.

PHASE 4 PROVENANCE, not exclusion. Phase 4 carries high AE volume and is often
safety-focused, but it is also where SEEDING TRIALS live — marketing dressed as
research (Vioxx's ADVANTAGE is the documented case). We flag
`phase4_seeding_risk` and let downstream decide. Dropping them would discard real
harms data; trusting them blindly would launder marketing into evidence.

PHASE 1 is deliberately NOT special-cased for withholding: FDAAA exempts phase 1
from registration, so its absence from CT.gov is a legal fact, not a signal. A
"missing" phase 1 trial means the law did not ask for it — reading that as
withholding would manufacture a finding out of a statute. Phase 1 harms are an
FDA-review asset, not a registry one.

NOT IN SCOPE: FAERS/VAERS. Spontaneous reports have NO DENOMINATOR — they support
disproportionality signals only and are never poolable with RCT AEs. They do not
enter this map.

Run:  python withholding.py
"""
from __future__ import annotations

import argparse
import glob
import json
import os
from datetime import date

import config as C

WITHHOLD_DIR = os.path.join(C.STORE, "withholding")

# Statuses where results SHOULD exist. An ongoing trial owes nothing yet, and
# counting it as withheld would be an accusation against a trial still running.
CLOSED_STATUSES = ("COMPLETED", "TERMINATED", "SUSPENDED", "WITHDRAWN")

# FDAAA gives 12 months post-primary-completion to report. We use 24 to be
# conservative: the claim is "this is overdue", and a borderline call should fall
# on the side of not accusing.
GRACE_MONTHS = 24


def _lst(table: str) -> str:
    fs = sorted(glob.glob(os.path.join(C.STORE, table, "*.parquet")))
    if not fs:
        raise FileNotFoundError(f"no {table} — run the registry/crosswalk stages")
    return "read_parquet([" + ",".join(
        "'" + f.replace(os.sep, "/") + "'" for f in fs) + "])"


def build() -> dict:
    import duckdb
    con = duckdb.connect()
    con.execute("SET memory_limit='6GB'")
    os.makedirs(WITHHOLD_DIR, exist_ok=True)
    today = date.today().isoformat()

    T, REF = _lst("trials"), _lst("trial_refs")
    P = _lst("papers")
    import cohorts
    K = cohorts.cohort_table()

    sql = f"""
    WITH pub AS (
      -- layers 2 and 3, per trial. DERIVED/RESULT only: a trial that merely
      -- CITED a paper has not been published BY it, and counting BACKGROUND
      -- links as publication would erase the very signal we are looking for.
      SELECT r.nct_id,
             COUNT(DISTINCT p.pmid) AS n_papers,
             MAX(CASE WHEN p.has_abstract THEN 1 ELSE 0 END) AS l2_abstract,
             MAX(CASE WHEN p.is_open_access AND p.in_pmc THEN 1 ELSE 0 END) AS l3_oa
      FROM {REF} r JOIN {P} p ON p.pmid = trim(r.pmid)
      WHERE upper(r.reference_type) IN ('DERIVED','RESULT')
      GROUP BY r.nct_id
    )
    SELECT
      t.nct_id AS study_id, t.phase, t.overall_status, t.enrollment,
      t.primary_completion_date, t.completion_date, t.start_date,
      t.lead_sponsor, t.lead_sponsor_class, t.conditions,
      t.has_african_site,
      k.malaria, k.tb, k.hiv, k.ncd_any, k.ncd_cardiometabolic,
      -- the three layers, explicitly, so a reader can see what was tried
      t.results_posted AS layer1_registry_results,
      COALESCE(pub.l2_abstract,0) = 1 AS layer2_abstract,
      COALESCE(pub.l3_oa,0) = 1 AS layer3_oa_fulltext,
      COALESCE(pub.n_papers,0) AS n_reporting_papers,
      -- overdue: closed long enough ago that reporting was due
      (t.overall_status IN {CLOSED_STATUSES!r}) AS is_closed,
      (t.primary_completion_date IS NOT NULL
       AND CAST(t.primary_completion_date AS DATE)
           < (CURRENT_DATE - INTERVAL '{GRACE_MONTHS} months')) AS is_overdue,
      -- THE SIGNAL: closed, overdue, and ALL THREE LAYERS EMPTY
      (t.overall_status IN {CLOSED_STATUSES!r}
       AND t.primary_completion_date IS NOT NULL
       AND CAST(t.primary_completion_date AS DATE)
           < (CURRENT_DATE - INTERVAL '{GRACE_MONTHS} months')
       AND NOT t.results_posted
       AND COALESCE(pub.l2_abstract,0) = 0
       AND COALESCE(pub.l3_oa,0) = 0) AS withholding_candidate,
      -- phase 4 provenance: ingest, flag, never blindly trust (seeding trials)
      (t.phase = 'PHASE4') AS phase4_seeding_risk,
      'registry+abstract+oa_fulltext' AS layers_tried,
      'candidate — closed, overdue, and all three layers empty. NOT a verdict: '
      || 'a paper outside the OA/PMC subset would not be seen here' AS confidence,
      'registry' AS source_tier, t.locator,
      '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS extracted_at
    FROM {T} t
    LEFT JOIN pub ON pub.nct_id = t.nct_id
    LEFT JOIN {K} k ON k.nct_id = t.nct_id
    """
    dst = os.path.join(WITHHOLD_DIR, "withholding.parquet")
    tmp = dst + ".tmp"
    con.execute(f"COPY ({sql}) TO '{tmp.replace(os.sep,'/')}' "
                f"(FORMAT PARQUET, COMPRESSION ZSTD)")
    n, d = con.execute(f"SELECT COUNT(*), COUNT(DISTINCT study_id) FROM "
                       f"read_parquet('{tmp.replace(os.sep,'/')}')").fetchone()
    if n != d:
        os.remove(tmp)
        raise ValueError("withholding fanned out — the unit is the trial")
    os.replace(tmp, dst)
    return {"trials": n, "path": dst}


def report() -> dict:
    import duckdb
    con = duckdb.connect()
    p = os.path.join(WITHHOLD_DIR, "withholding.parquet")
    if not os.path.isfile(p):
        raise FileNotFoundError("run: python withholding.py")
    W = f"read_parquet('{p.replace(os.sep,'/')}')"

    out = {"denominator_rule": "closed + overdue by >= 24 months (FDAAA allows 12; "
                               "we use 24 so a borderline call does not accuse)",
           "three_layer_rule": "withheld = registry AND abstract AND OA full text "
                               "ALL empty",
           "by_phase": {}, "by_cohort": {}}

    for r in con.execute(f"""
        SELECT COALESCE(phase,'(null)') AS ph,
               COUNT(*) AS n,
               SUM(CASE WHEN is_closed AND is_overdue THEN 1 ELSE 0 END) AS due,
               SUM(CASE WHEN is_closed AND is_overdue AND NOT layer1_registry_results
                        THEN 1 ELSE 0 END) AS no_results,
               SUM(CASE WHEN withholding_candidate THEN 1 ELSE 0 END) AS withheld
        FROM {W} GROUP BY 1 ORDER BY 2 DESC""").fetchall():
        ph, n, due, no_res, wh = r
        out["by_phase"][ph] = {
            "trials": n, "closed_and_overdue": due,
            "no_registry_results": no_res,
            "WITHHOLDING_CANDIDATES (all 3 layers empty)": wh,
            "pct_of_due": round(100.0 * wh / due, 1) if due else 0.0,
            "single_layer_would_have_said": no_res,
            "three_layer_says": wh,
        }
    for key in ["malaria", "tb", "hiv", "ncd_any", "ncd_cardiometabolic"]:
        r = con.execute(f"""
            SELECT COUNT(*),
                   SUM(CASE WHEN is_closed AND is_overdue THEN 1 ELSE 0 END),
                   SUM(CASE WHEN withholding_candidate THEN 1 ELSE 0 END)
            FROM {W} WHERE "{key}" """).fetchone()
        out["by_cohort"][key] = {
            "trials": r[0] or 0, "closed_and_overdue": r[1] or 0,
            "WITHHOLDING_CANDIDATES": r[2] or 0,
            "pct_of_due": round(100.0 * (r[2] or 0) / (r[1] or 1), 1)
                          if r[1] else 0.0}
    r = con.execute(f"SELECT COUNT(*) FROM {W} WHERE phase4_seeding_risk").fetchone()
    out["phase4_flagged_for_seeding_risk"] = r[0]
    print(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    if not a.report:
        print(json.dumps(build(), indent=2))
    report()
