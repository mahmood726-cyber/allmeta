"""Disease cohorts — malaria / TB / HIV / NCD, reported SEPARATELY.

Why a module and not a WHERE clause: coverage for these populations must never
hide inside a global average. "82% coverage" across 290,724 trials tells a
Makerere researcher nothing about whether THEIR question is answerable. So every
checkpoint reports malaria, TB and NCD as their own rows.

Why classification here and not in the universe partition: `universe.parquet` is
the durable batch assignment (registry_full.py). Re-tagging cohorts there would
reshuffle batch boundaries and force a re-extraction of all 290,724 trials for a
labelling change. Cohort is a LABEL, so it is computed at report/export time from
`conditions` and joined on nct_id. Free, and re-runnable when the taxonomy changes.

NCD IS FIRST-CLASS, not tolerated drift. Uganda and sub-Saharan Africa are
mid-epidemiological-transition: hypertension, diabetes, CKD, heart failure,
stroke, rheumatic and hypertensive heart disease, and cancer are major and rising
burdens that Makerere researchers work on now. NCDs are a target population, not
a Western-only concern.

THE HARD PROBLEM MOVES, IT DOESN'T DISAPPEAR:
  malaria / TB  -> the data does not exist (absence)
  NCD           -> the data exists but was generated somewhere else
                   (transportability / indirectness)
The HFrEF/hypertension/diabetes evidence base is overwhelmingly North American,
European and East Asian, in populations differing from Ugandan patients in
background risk, comorbidity (HIV, rheumatic heart disease), monitoring access,
co-medication and standard of care. So for NCD the useful work is capturing what
makes transport ASSESSABLE — see transport.py for the covariates. Without those,
"the number transports" is an assumption, not a finding.

Run:  python cohorts.py            # build the tag table
      python cohorts.py --report   # coverage by cohort
"""
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import date

import config as C

COHORT_DIR = os.path.join(C.STORE, "cohorts")

# Word-bounded. `\btb\b` not `tb` (matches "tbi"); `\bhiv\b` not `hiv`.
# Each pattern is deliberately narrow — a false positive here inflates the
# coverage of exactly the population we are trying to report honestly about.
PATTERNS = {
    # --- infectious priorities -------------------------------------------
    "malaria": r"\bmalaria\b|\bplasmodium\b|\bfalciparum\b|\bvivax\b",
    "tb": r"\btuberculos\w*\b|\bmycobacterium tuberculosis\b|\btb\b|\bmdr[- ]?tb\b|"
          r"\bxdr[- ]?tb\b|\blatent tb\b",
    # NOT `\bart\b` for antiretroviral therapy: "art" collides with ordinary
    # prose and with ART = assisted reproductive technology. The spelled-out form
    # only — a false positive inflates the very cohort we report on.
    "hiv": r"\bhiv\b|\baids\b|acquired immunodeficiency|\bantiretroviral\b",

    # --- NCD, by subgroup so the burden is legible rather than one blob ---
    "ncd_cardiometabolic":
        r"\bhypertens\w*\b|\bblood pressure\b|\bdiabet\w*\b|\bhyperglyc\w*\b|"
        r"\bheart failure\b|\bhfref\b|\bhfpef\b|\bcardiomyopath\w*\b|"
        r"\bcoronary\b|\bmyocardial infarction\b|\bangina\b|"
        r"\bacute coronary syndrome\b|\batrial fibrillat\w*\b|\barrhythmi\w*\b|"
        r"\bstroke\b|\bcerebrovascular\b|\btransient ischemic\b|"
        r"\brheumatic heart\b|\bvalvular\b|\bdyslipid\w*\b|\bhyperlipid\w*\b|"
        r"\bcholesterol\b|\bobesity\b|\bmetabolic syndrome\b|"
        r"\bperipheral arter\w* disease\b|\bcardiovascular\b",
    "ncd_kidney":
        r"\bchronic kidney\b|\bckd\b|\brenal insufficiency\b|\bnephropath\w*\b|"
        r"\bdialysis\b|\bend[- ]stage renal\b|\besrd\b|\bglomerul\w*\b",
    "ncd_cancer":
        r"\bcancer\b|\bcarcinoma\b|\bneoplas\w*\b|\btumou?r\b|\blymphoma\b|"
        r"\bleukemia\b|\bleukaemia\b|\bmyeloma\b|\bsarcoma\b|\bmelanoma\b|"
        r"\bmalignan\w*\b|\bmetasta\w*\b",
    "ncd_respiratory":
        r"\bcopd\b|\bchronic obstructive\b|\basthma\b|\bemphysema\b|"
        r"\bchronic bronchitis\b|\bpulmonary fibrosis\b",
}

# Non-communicable umbrella (WHO's four + CKD, which SSA burden makes essential).
NCD_KEYS = ("ncd_cardiometabolic", "ncd_kidney", "ncd_cancer", "ncd_respiratory")

_RE = {k: re.compile(v, re.I) for k, v in PATTERNS.items()}


def classify(condition_text: str | None) -> dict:
    """Flags for one trial's condition string. Multi-label on purpose: a trial in
    HIV-associated cardiomyopathy is BOTH hiv and ncd_cardiometabolic, and that
    overlap is exactly the Ugandan comorbidity picture — forcing a single label
    would erase it."""
    t = condition_text or ""
    out = {k: bool(rx.search(t)) for k, rx in _RE.items()}
    out["ncd_any"] = any(out[k] for k in NCD_KEYS)
    out["priority_any"] = out["malaria"] or out["tb"] or out["hiv"] or out["ncd_any"]
    return out


def build() -> dict:
    """Tag every trial in the store. One row per nct_id."""
    import duckdb
    import glob
    import pyarrow as pa
    import pyarrow.parquet as pq

    fs = sorted(glob.glob(os.path.join(C.STORE, "trials", "*.parquet")))
    if not fs:
        raise FileNotFoundError("no trials — run registry_full.py")
    lst = "[" + ",".join("'" + f.replace(os.sep, "/") + "'" for f in fs) + "]"
    con = duckdb.connect()
    rows = con.execute(
        f"SELECT nct_id, COALESCE(conditions,'') || ' ' || COALESCE(brief_title,'') "
        f"FROM read_parquet({lst})").fetchall()
    today = date.today().isoformat()
    out = []
    for nct, text in rows:
        f = classify(text)
        f.update(nct_id=nct, extracted_at=today,
                 method="regex over AACT conditions + brief_title",
                 source_tier="registry")
        out.append(f)
    os.makedirs(COHORT_DIR, exist_ok=True)
    dst = os.path.join(COHORT_DIR, "trial_cohorts.parquet")
    tmp = dst + ".tmp"
    pq.write_table(pa.Table.from_pylist(out), tmp, compression="zstd")
    os.replace(tmp, dst)
    agg = {k: sum(1 for r in out if r[k])
           for k in list(PATTERNS) + ["ncd_any", "priority_any"]}
    agg["trials"] = len(out)
    print(f"[cohorts] {json.dumps(agg, indent=2)}")
    return agg


def cohort_table() -> str:
    p = os.path.join(COHORT_DIR, "trial_cohorts.parquet")
    if not os.path.isfile(p):
        raise FileNotFoundError("run: python cohorts.py")
    return f"read_parquet('{p.replace(os.sep, '/')}')"


def report() -> dict:
    """THE checkpoint report: malaria / TB / NCD separately, three-layer.

    A datum is unavailable only when registry AND abstract AND OA full text all
    fail — so every cohort row shows all three layers, never a single-layer
    ceiling. Single-layer numbers have misled us repeatedly (14% recall, 17%
    cells, 94% not-adjudicable were all single-layer artefacts).
    """
    import duckdb
    import glob

    con = duckdb.connect()
    con.execute("SET memory_limit='4GB'")
    idx = os.path.join(C.STORE, "trial_index", "trial_index.parquet")
    if not os.path.isfile(idx):
        raise FileNotFoundError("run: python trial_index.py")
    I = f"read_parquet('{idx.replace(os.sep,'/')}')"
    K = cohort_table()

    out = {"basis": "batch-actual from the store", "aact_snapshot": C.AACT_SNAPSHOT,
           "three_layer_rule": ("a datum is unavailable only when registry AND "
                                "abstract AND OA full text ALL fail"),
           "cohorts": {}}
    for key in ["malaria", "tb", "hiv", "ncd_any", "ncd_cardiometabolic",
                "ncd_kidney", "ncd_cancer", "ncd_respiratory"]:
        r = con.execute(f"""
            SELECT COUNT(*),
                   SUM(CAST(i.registry_results AS INT)),
                   SUM(CAST(i.layer2_abstract AS INT)),
                   SUM(CAST(i.layer3_oa_fulltext AS INT)),
                   SUM(CAST(i.fulltext_cached AS INT)),
                   SUM(CASE WHEN i.registry_results OR i.layer2_abstract
                             OR i.layer3_oa_fulltext THEN 1 ELSE 0 END),
                   SUM(CAST(i.has_african_site AS INT))
            FROM {I} i JOIN {K} k ON k.nct_id = i.nct_id
            WHERE k."{key}" """).fetchone()
        n = r[0] or 0
        out["cohorts"][key] = {
            "trials": n,
            "layer1_registry_results": r[1] or 0,
            "layer2_abstract": r[2] or 0,
            "layer3_oa_fulltext": r[3] or 0,
            "oa_fulltext_cached": r[4] or 0,
            "ANY_LAYER (the real availability)": r[5] or 0,
            "any_layer_pct": round(100.0 * (r[5] or 0) / n, 1) if n else 0.0,
            "with_african_site": r[6] or 0,
        }
    print(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    if a.report:
        report()
    else:
        build()
        report()
