"""Stage T6 — emit the registry store in the shape `bias-adjusted-nma-adv` eats.

The extraction is not an end in itself: its output must be the INPUT that engine
consumes. This module conforms to that repo's data contract as documented in
`C:\\Projects\\BIAS-ADJUSTED-NMA-ADV-BRIEF.md` (read-only; the engine is Codex's
build and is not touched here):

    StudyRecord(study_id, design in {"rct","nrs","other"}, rob_weight in (0,1],
                covariates: dict[str,float])
    ArmRecord(study_id, arm_id, treatment_id, n)
    OutcomeADRecord(study_id, arm_id, outcome_id,
                    measure_type in {"binary","continuous"}, value, se)

Aggregate data only — events/N for binary, mean/SE for continuous — which is
exactly what the registry posts, so no IPD is implied anywhere.

Emitted tables (all parquet, all carrying provenance):
  nma_studies      -> StudyRecord, with the covariate columns for the context
                      meta-regression (the ablation's surviving +0.154 layer)
  nma_arms         -> ArmRecord (arm_id = result_group_id; see ARM IDENTITY)
  nma_outcomes_ad  -> OutcomeADRecord, plus timepoint + outcome title
  nma_ae           -> the harms layer, same arm keys (the measured edge)
  nma_bias_inputs  -> ** the registered/protocol vs as-published PAIR **
  nma_treatments   -> the treatment-node crosswalk

THE BIAS PAIR — why this is the centrepiece. The engine's
`register_trial_protocol()` stores {registered_primary, reported_primary,
status}: the SWITCH between them is the bias term. AACT carries both sides
offline at one snapshot:
    design_outcomes.outcome_type = 'primary'   -> the REGISTERED protocol outcome
    outcomes.outcome_type        = 'PRIMARY'   -> the AS-POSTED result outcome
so the pair — and the delta — is computable for every trial with results,
without a single network call. `outcomes.outcome_type='POST_HOC'` is a further
switching signal: an outcome reported that was never registered.

ROB_WEIGHT is emitted as 1.0 (the engine's neutral default) and is a JOIN SOCKET,
not a value we invent: the 68k lane's error-pattern ledger learns trust weights
keyed by NCT, and `nct_id` IS `study_id` here, so "train on the 68k -> attach
weights -> feed the engine" is one continuous path. We never fabricate a weight.

ARM IDENTITY: arm_id = result_group_id, never ctgov_group_code (which is scoped
per-outcome; keying on it fuses distinct arms in 9,915 trials = 21.4% of trials
with results). See registry_full.py.

HONESTY: `treatment_id` is a CANDIDATE normalisation of the arm label, not a
validated ontology mapping (no RxNorm/ATC here). Network nodes must be
adjudicated before use — see nma_treatments.needs_adjudication.

Run:  python nma_export.py --cohort p0_malaria_tb_hiv
      python nma_export.py --all
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import re
from datetime import date

import config as C

EXPORT_ROOT = os.path.join(C.STORE, "nma_export")

# One directory PER COHORT, and a manifest written LAST. Both are scar tissue:
# a --all run that died partway (timeout) left nma_studies holding all 46,347
# studies while nma_arms still held the previous priority-cohort build — a
# silently MIXED export whose arms referenced a fifth of its studies. Separate
# dirs make cohorts incapable of overwriting each other, and a missing manifest
# marks a partial build as incomplete instead of letting it read as finished.
MANIFEST = "manifest.json"


def export_dir(cohort: str | None) -> str:
    return os.path.join(EXPORT_ROOT, cohort or "all")


# Back-compat for callers/tests that used the flat path.
EXPORT_DIR = export_dir("all")

# Engine enum. Our universe is allocation='RANDOMIZED' interventional, so every
# study is "rct". The brief notes design-stratification (the RCT-vs-NRS layer)
# therefore sits IDLE on a pure-RCT network — stated so nobody values that layer
# on this feed. `design` is a closed 3-way enum; a richer frame taxonomy
# (registry-only / CSR-backed / preprint) would need an engine schema change.
DESIGN_RCT = "rct"

# param_type -> engine measure_type. Only these are model-ready. MEDIAN/IQR/range
# are deliberately NOT mapped: converting a median to a mean silently invents a
# distributional assumption the registry never made.
BINARY_PARAMS = ("COUNT_OF_PARTICIPANTS",)
CONTINUOUS_PARAMS = ("MEAN", "LEAST_SQUARES_MEAN", "GEOMETRIC_MEAN",
                     "GEOMETRIC_LEAST_SQUARES_MEAN")

_DOSE_RE = re.compile(
    r"\b\d+(\.\d+)?\s*(mg|mcg|µg|ug|g|ml|l|iu|units?|%)\b|"
    r"\b(qd|bid|tid|qid|q\d+h|once|twice|daily|weekly|monthly|/day|/kg)\b|"
    r"\b(oral|iv|im|sc|subcutaneous|intravenous|topical|inhaled)\b", re.I)
_CONTROL_RE = re.compile(
    r"\b(placebo|sham|control|standard of care|soc|usual care|no treatment|"
    r"vehicle|comparator|untreated|observation)\b", re.I)
_PUNCT_RE = re.compile(r"[^a-z0-9 ]+")


def normalize_treatment(title: str | None) -> tuple[str, bool]:
    """(normalised label, is_control) for an arm title.

    Strips dose/route/frequency so "Pazopanib 800 mg oral daily" and
    "Pazopanib" collapse to one node — the component/dose layer keeps the raw
    string, so nothing is lost, it is just not the node key.

    This is a heuristic, and it is labelled as one. It cannot know that
    "MK-3475" and "pembrolizumab" are the same drug; that needs an ontology we
    do not have here. Hence needs_adjudication on every emitted node.
    """
    t = (title or "").strip().lower()
    if not t:
        return "", False
    is_ctrl = bool(_CONTROL_RE.search(t))
    t = _DOSE_RE.sub(" ", t)
    t = _PUNCT_RE.sub(" ", t)
    t = " ".join(t.split())
    return t, is_ctrl


def treatment_id(label: str) -> str:
    """Stable node id. Content-hashed, so the same label yields the same id on
    every node and every re-run — a crosswalk that changes between runs is not a
    crosswalk."""
    if not label:
        return "TRT_UNKNOWN"
    return "TRT_" + hashlib.sha256(label.encode()).hexdigest()[:12]


def _lst(table: str, ext: bool = False) -> str:
    if ext:
        p = C.ext_table(table)
        if p is None:
            raise FileNotFoundError(f"run aact_ext.py --only {table}")
        return f"read_parquet('{p.replace(os.sep,'/')}')"
    fs = sorted(glob.glob(os.path.join(C.STORE, table, "*.parquet")))
    if not fs:
        raise FileNotFoundError(f"no {table} in the store — run registry_full.py")
    return "read_parquet([" + ",".join(
        "'" + f.replace(os.sep, "/") + "'" for f in fs) + "])"


def _copy(con, sql: str, name: str, outdir: str) -> int:
    os.makedirs(outdir, exist_ok=True)
    dst = os.path.join(outdir, f"{name}.parquet")
    tmp = dst + ".tmp"
    con.execute(f"COPY ({sql}) TO '{tmp.replace(os.sep,'/')}' "
                f"(FORMAT PARQUET, COMPRESSION ZSTD)")
    n = con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{tmp.replace(os.sep,'/')}')"
    ).fetchone()[0]
    os.replace(tmp, dst)
    return n


def build(cohort: str | None = None) -> dict:
    import duckdb
    con = duckdb.connect()
    con.execute("SET memory_limit='6GB'")
    today = date.today().isoformat()
    outdir = export_dir(cohort)
    os.makedirs(outdir, exist_ok=True)
    # Drop any previous manifest FIRST: from here until the manifest is rewritten
    # this export is officially incomplete, so a crash mid-build cannot leave a
    # half-written cohort looking finished.
    mpath = os.path.join(outdir, MANIFEST)
    if os.path.isfile(mpath):
        os.remove(mpath)
    where_cohort = f"AND t.cohort = '{cohort}'" if cohort else ""
    out = {"cohort": cohort or "ALL", "aact_snapshot": C.AACT_SNAPSHOT,
           "built_at": today, "counts": {}}

    con.execute(f"""CREATE OR REPLACE TEMP TABLE studies AS
        SELECT * FROM {_lst('trials')} t
        WHERE t.results_posted {where_cohort}""")

    # ---- StudyRecord ------------------------------------------------------
    # covariates are the context meta-regression sockets. All numeric (the
    # engine wants dict[str,float]); booleans emitted as 0/1.
    out["counts"]["nma_studies"] = _copy(con, f"""
        SELECT
          s.nct_id AS study_id,
          '{DESIGN_RCT}' AS design,
          1.0 AS rob_weight,          -- neutral default; JOIN SOCKET for the
                                      -- 68k-learned trust weights (key=study_id)
          s.cohort,
          -- covariates for covariate_effects meta-regression
          TRY_CAST(substr(CAST(s.start_date AS VARCHAR), 1, 4) AS DOUBLE)
              AS cov_start_year,
          CAST(COALESCE(s.enrollment, 0) AS DOUBLE) AS cov_enrollment,
          CAST(COALESCE(s.n_countries, 0) AS DOUBLE) AS cov_n_countries,
          CAST(COALESCE(s.n_sites, 0) AS DOUBLE) AS cov_n_sites,
          CAST(CASE WHEN s.has_african_site THEN 1 ELSE 0 END AS DOUBLE)
              AS cov_african_site,
          CAST(CASE WHEN upper(COALESCE(s.lead_sponsor_class,'')) = 'INDUSTRY'
                    THEN 1 ELSE 0 END AS DOUBLE) AS cov_industry_sponsor,
          CAST(CASE
                 WHEN s.phase ILIKE '%PHASE1%' THEN 1
                 WHEN s.phase ILIKE '%PHASE2%' THEN 2
                 WHEN s.phase ILIKE '%PHASE3%' THEN 3
                 WHEN s.phase ILIKE '%PHASE4%' THEN 4
                 ELSE 0 END AS DOUBLE) AS cov_phase_ord,
          CAST(CASE
                 WHEN s.masking ILIKE '%QUADRUPLE%' THEN 4
                 WHEN s.masking ILIKE '%TRIPLE%' THEN 3
                 WHEN s.masking ILIKE '%DOUBLE%' THEN 2
                 WHEN s.masking ILIKE '%SINGLE%' THEN 1
                 ELSE 0 END AS DOUBLE) AS cov_masking_ord,
          s.brief_title, s.conditions, s.phase, s.overall_status,
          s.lead_sponsor, s.lead_sponsor_class, s.enrollment,
          'registry' AS source_tier, s.locator,
          '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS extracted_at
        FROM studies s""", "nma_studies", outdir)

    # ---- treatment nodes + ArmRecord -------------------------------------
    # Arm N comes from outcome_counts (analysed N per arm per outcome, scope
    # 'Measure'); we take the MAX across that trial's outcomes as the arm's N,
    # because per-outcome analysed N varies with attrition and the engine's
    # ArmRecord.n is one number per arm.
    con.execute(f"""CREATE OR REPLACE TEMP TABLE arms_raw AS
        SELECT g.nct_id, CAST(g.id AS VARCHAR) AS arm_id, g.title AS arm_title,
               g.description AS arm_description,
               MAX(TRY_CAST(oc.count AS INTEGER)) AS n
        FROM {_lst('result_groups', ext=True)} g
        JOIN studies s ON s.nct_id = g.nct_id
        LEFT JOIN {_lst('outcome_counts', ext=True)} oc
               ON CAST(oc.result_group_id AS VARCHAR) = CAST(g.id AS VARCHAR)
              AND lower(COALESCE(oc.units,'participants')) = 'participants'
        WHERE g.result_type = 'Outcome'
        GROUP BY 1,2,3,4""")

    rows = con.execute(
        "SELECT arm_id, arm_title FROM arms_raw").fetchall()
    norm = [(a, *normalize_treatment(t)) for a, t in rows]
    con.execute("CREATE OR REPLACE TEMP TABLE armmap"
                "(arm_id VARCHAR, label VARCHAR, is_control BOOLEAN, trt VARCHAR)")
    con.executemany("INSERT INTO armmap VALUES (?,?,?,?)",
                    [(a, lab, ctrl, treatment_id(lab)) for a, lab, ctrl in norm])

    out["counts"]["nma_arms"] = _copy(con, f"""
        SELECT r.nct_id AS study_id, r.arm_id, m.trt AS treatment_id,
               m.label AS treatment_label, m.is_control AS is_common_comparator,
               r.n, r.arm_title, r.arm_description AS arm_dose_text,
               'registry' AS source_tier,
               'https://clinicaltrials.gov/study/' || r.nct_id AS locator,
               '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS extracted_at
        FROM arms_raw r JOIN armmap m ON m.arm_id = r.arm_id""", "nma_arms", outdir)

    out["counts"]["nma_treatments"] = _copy(con, f"""
        SELECT m.trt AS treatment_id, m.label AS treatment_label,
               BOOL_OR(m.is_control) AS is_common_comparator,
               COUNT(DISTINCT r.nct_id) AS n_studies,
               COUNT(*) AS n_arms,
               string_agg(DISTINCT r.arm_title, ' ~ ') AS raw_variants,
               TRUE AS needs_adjudication,
               'heuristic label normalisation (dose/route/frequency stripped); '
               || 'NOT an ontology mapping — synonyms like MK-3475 vs '
               || 'pembrolizumab are NOT merged' AS method,
               '{today}' AS extracted_at
        FROM armmap m JOIN arms_raw r ON r.arm_id = m.arm_id
        WHERE m.label <> '' GROUP BY 1,2""", "nma_treatments", outdir)

    # ---- OutcomeADRecord --------------------------------------------------
    # se: SE as posted; SD -> SD/sqrt(n); 95% CI -> (hi-lo)/(2*1.96). IQR/range
    # are NOT converted — se stays NULL and se_method records why, because
    # inventing an SE from an IQR fabricates precision the registry never posted.
    out["counts"]["nma_outcomes_ad"] = _copy(con, f"""
        SELECT
          m.nct_id AS study_id,
          CAST(m.result_group_id AS VARCHAR) AS arm_id,
          CAST(m.outcome_id AS VARCHAR) AS outcome_id,
          CASE WHEN m.param_type IN {BINARY_PARAMS!r} THEN 'binary'
               WHEN m.param_type IN {CONTINUOUS_PARAMS!r} THEN 'continuous'
               ELSE 'unsupported' END AS measure_type,
          m.param_value_num AS value,
          CASE
            WHEN m.param_type IN {BINARY_PARAMS!r} THEN NULL
            WHEN m.dispersion_type = 'Standard Error' THEN m.dispersion_value_num
            WHEN m.dispersion_type = 'Standard Deviation'
                 AND oc.n > 0 THEN m.dispersion_value_num / sqrt(oc.n)
            WHEN m.dispersion_type = '95% Confidence Interval'
                 AND m.dispersion_upper_limit IS NOT NULL
                 AND m.dispersion_lower_limit IS NOT NULL
              THEN (m.dispersion_upper_limit - m.dispersion_lower_limit) / 3.919928
            ELSE NULL END AS se,
          CASE
            WHEN m.param_type IN {BINARY_PARAMS!r} THEN 'binary: value=events, n from ArmRecord'
            WHEN m.dispersion_type = 'Standard Error' THEN 'posted SE'
            WHEN m.dispersion_type = 'Standard Deviation' AND oc.n > 0 THEN 'SD/sqrt(n)'
            WHEN m.dispersion_type = '95% Confidence Interval' THEN 'CI width/(2*1.96)'
            ELSE 'NOT DERIVABLE (' || COALESCE(m.dispersion_type,'none') || ')'
          END AS se_method,
          oc.n AS n_analyzed,
          m.outcome_type AS reported_outcome_type,
          m.outcome_title, m.time_frame AS timepoint,
          m.units, m.param_type AS registry_param_type,
          m.group_title AS arm_title, m.group_resolved,
          'registry' AS source_tier, m.locator,
          '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS extracted_at
        FROM {_lst('trial_results')} m
        JOIN studies s ON s.nct_id = m.nct_id
        LEFT JOIN (SELECT CAST(result_group_id AS VARCHAR) rg,
                          CAST(outcome_id AS VARCHAR) oid,
                          MAX(TRY_CAST(count AS INTEGER)) n
                   FROM {_lst('outcome_counts', ext=True)}
                   WHERE lower(COALESCE(units,'participants')) = 'participants'
                   GROUP BY 1,2) oc
               ON oc.rg = CAST(m.result_group_id AS VARCHAR)
              AND oc.oid = CAST(m.outcome_id AS VARCHAR)
        WHERE m.param_value_num IS NOT NULL AND m.group_resolved""",
        "nma_outcomes_ad", outdir)

    # ---- harms, on the same arm keys -------------------------------------
    out["counts"]["nma_ae"] = _copy(con, f"""
        SELECT a.nct_id AS study_id,
               CAST(a.result_group_id AS VARCHAR) AS arm_id,
               a.event_type, a.organ_system, a.adverse_event_term,
               a.subjects_affected, a.subjects_at_risk, a.event_count,
               a.time_frame AS timepoint, a.assessment, a.vocab,
               a.group_title AS arm_title,
               'registry' AS source_tier, a.locator,
               '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS extracted_at
        FROM {_lst('trial_ae')} a JOIN studies s ON s.nct_id = a.nct_id
        WHERE a.group_resolved""", "nma_ae", outdir)

    # ---- THE BIAS PAIR ----------------------------------------------------
    out["counts"]["nma_bias_inputs"] = _copy(con, f"""
        WITH reg AS (
          SELECT d.nct_id,
                 string_agg(d.measure, ' ~ ' ORDER BY d.measure) AS registered_primary,
                 COUNT(*) AS n_registered_primary
          FROM {_lst('design_outcomes', ext=True)} d
          JOIN studies s ON s.nct_id = d.nct_id
          WHERE lower(d.outcome_type) = 'primary' GROUP BY 1
        ),
        rep AS (
          SELECT o.nct_id,
                 string_agg(DISTINCT o.outcome_title, ' ~ ') AS reported_primary,
                 COUNT(DISTINCT o.outcome_id) AS n_reported_primary
          FROM {_lst('trial_results')} o
          JOIN studies s ON s.nct_id = o.nct_id
          WHERE upper(o.outcome_type) = 'PRIMARY' GROUP BY 1
        ),
        ph AS (
          SELECT o.nct_id, COUNT(DISTINCT o.outcome_id) AS n_post_hoc
          FROM {_lst('trial_results')} o
          JOIN studies s ON s.nct_id = o.nct_id
          WHERE upper(o.outcome_type) = 'POST_HOC' GROUP BY 1
        )
        SELECT s.nct_id AS study_id,
               reg.registered_primary,
               rep.reported_primary,
               COALESCE(reg.n_registered_primary, 0) AS n_registered_primary,
               COALESCE(rep.n_reported_primary, 0) AS n_reported_primary,
               COALESCE(ph.n_post_hoc, 0) AS n_post_hoc_reported,
               s.overall_status AS status,
               -- the switch signals. Text equality is a WEAK comparator (wording
               -- drifts between protocol and results), so we emit the raw pair and
               -- cheap structural signals, and let adjudication decide. A boolean
               -- "switched" from string equality alone would be mostly false alarms.
               (reg.registered_primary IS NOT NULL
                AND rep.reported_primary IS NULL) AS primary_registered_not_reported,
               (COALESCE(ph.n_post_hoc,0) > 0) AS has_post_hoc_outcome,
               (COALESCE(rep.n_reported_primary,0)
                <> COALESCE(reg.n_registered_primary,0)) AS primary_count_differs,
               'registry' AS source_tier, s.locator,
               'registered=design_outcomes.primary; reported=outcomes.PRIMARY; '
               || 'both from AACT ' || '{C.AACT_SNAPSHOT}' AS method,
               'candidate — text pair emitted for adjudication, NOT a verdict'
                 AS confidence,
               '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS extracted_at
        FROM studies s
        LEFT JOIN reg ON reg.nct_id = s.nct_id
        LEFT JOIN rep ON rep.nct_id = s.nct_id
        LEFT JOIN ph  ON ph.nct_id  = s.nct_id""", "nma_bias_inputs", outdir)

    # fail closed: the engine keys everything on study_id
    n_st = con.execute("SELECT COUNT(*), COUNT(DISTINCT nct_id) FROM studies"
                       ).fetchone()
    if n_st[0] != n_st[1]:
        raise ValueError("duplicate study_id in export — the unit is the trial")
    out["path"] = outdir
    out["complete"] = True
    with open(mpath, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)          # LAST write = the completion marker
    return out


def summary(cohort: str | None = None) -> dict:
    import duckdb
    con = duckdb.connect()
    outdir = export_dir(cohort)
    mpath = os.path.join(outdir, MANIFEST)
    if not os.path.isfile(mpath):
        return {"cohort": cohort or "all", "status": "INCOMPLETE — no manifest; "
                "this export did not finish and must not be consumed",
                "path": outdir}

    def q(name, sql):
        p = os.path.join(outdir, f"{name}.parquet").replace(os.sep, "/")
        if not os.path.isfile(p):
            return None
        return con.execute(sql.format(T=f"read_parquet('{p}')")).fetchone()

    out = {}
    r = q("nma_outcomes_ad", """SELECT COUNT(*),
            SUM(CASE WHEN measure_type='binary' THEN 1 ELSE 0 END),
            SUM(CASE WHEN measure_type='continuous' THEN 1 ELSE 0 END),
            SUM(CASE WHEN measure_type='unsupported' THEN 1 ELSE 0 END),
            SUM(CASE WHEN se IS NOT NULL THEN 1 ELSE 0 END)
          FROM {T}""")
    if r:
        out["outcomes_ad"] = {
            "rows": r[0], "binary": r[1], "continuous": r[2],
            "unsupported_param_type": r[3], "with_se": r[4],
            "note": ("unsupported = MEDIAN/IQR/range etc. — deliberately not "
                     "coerced to mean/SE; se NULL where not derivable")}
    r = q("nma_arms", "SELECT COUNT(*), SUM(CASE WHEN n IS NULL THEN 1 ELSE 0 END),"
                      " SUM(CASE WHEN is_common_comparator THEN 1 ELSE 0 END) FROM {T}")
    if r:
        out["arms"] = {"rows": r[0], "missing_n": r[1], "control_arms": r[2]}
    r = q("nma_bias_inputs", """SELECT COUNT(*),
            SUM(CASE WHEN registered_primary IS NOT NULL
                      AND reported_primary IS NOT NULL THEN 1 ELSE 0 END),
            SUM(CASE WHEN primary_registered_not_reported THEN 1 ELSE 0 END),
            SUM(CASE WHEN has_post_hoc_outcome THEN 1 ELSE 0 END),
            SUM(CASE WHEN primary_count_differs THEN 1 ELSE 0 END) FROM {T}""")
    if r:
        out["bias_pair"] = {
            "studies": r[0], "BOTH_registered_and_reported_primary": r[1],
            "registered_primary_never_reported": r[2],
            "has_post_hoc_outcome": r[3], "primary_count_differs": r[4],
            "note": "candidate signals for adjudication, not verdicts"}
    r = q("nma_treatments", "SELECT COUNT(*), SUM(CASE WHEN is_common_comparator "
                            "THEN 1 ELSE 0 END) FROM {T}")
    if r:
        out["treatments"] = {"nodes": r[0], "control_nodes": r[1],
                             "note": "candidate normalisation — needs adjudication"}
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", default=None,
                    help="e.g. p0_malaria_tb_hiv; omit with --all for everything")
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    cohort = None if a.all else (a.cohort or "p0_malaria_tb_hiv")
    print(json.dumps(build(cohort), indent=2))
    print(json.dumps(summary(cohort), indent=2, default=str))
