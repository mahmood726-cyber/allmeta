"""Stage T7 — transportability covariates. WHO was actually enrolled.

Why this is the NCD deliverable. The hard problem MOVES between cohorts:

    malaria / TB   the data does not exist              -> absence
    NCD            the data exists but was generated    -> transportability
                   somewhere else

Measured on this store: 44,697 cardiometabolic trials, of which only 1,392
(3.1%) have any African site — versus malaria at 63.2%. So a Ugandan NCD
synthesis is not short of trials; it is short of trials in ITS patients. The
question "does this Western estimate apply to my clinic?" can only be answered
from structured covariates, so this stage extracts them as numbers on
`StudyRecord.covariates`, never as prose.

`Region of Enrollment` is the key field and it is better than a site flag: AACT
carries it as a BASELINE MEASURE with the participant COUNT per country for
42,711 trials. A site in Kampala that enrolled 4 patients is not the same
evidence as a trial that enrolled 400 there — `has_african_site` cannot tell
those apart, `pct_enrolled_africa` can.

SAME MACHINERY AS RUN-IN / INDIRECTNESS. A trial population differing from the
target population is exactly the indirectness domain. Run-in enrichment (the
trial pre-selects tolerant responders) and Western-trial-to-Ugandan-clinic
(the trial pre-selects a different population) are two instances of ONE problem:
the trial population is not the target population. Captured well, both become
analysable with the same covariate term — which is why these are worth doing
properly rather than as a flag.

What we DON'T do: infer. If a trial never posted Region of Enrollment, we emit
NULL and say so. An imputed enrolment geography would be exactly the assumption
this stage exists to replace with a finding.

Run:  python transport.py
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import date

import config as C
import geo

TRANSPORT_DIR = os.path.join(C.STORE, "transport")


def _ext(t: str) -> str:
    p = C.ext_table(t)
    if p is None:
        raise FileNotFoundError(f"run: python aact_ext.py --only {t}")
    return f"read_parquet('{p.replace(os.sep, '/')}')"


def build() -> dict:
    import duckdb
    con = duckdb.connect()
    con.execute("SET memory_limit='6GB'")
    os.makedirs(TRANSPORT_DIR, exist_ok=True)
    today = date.today().isoformat()
    B = _ext("baseline_measurements")
    africa = geo.africa_sql_list()

    def norm(col):
        s = (f"replace(replace(replace({col}, '’', ''''), '‘', ''''), 'ʼ', '''')")
        return f"trim(regexp_replace(lower(strip_accents({s})), '\\s+', ' ', 'g'))"

    # Region of Enrollment: classification = country, param_value_num = participants.
    # Summed across arms — the trial-level enrolment geography.
    con.execute(f"""CREATE OR REPLACE TEMP TABLE region AS
        SELECT nct_id,
               SUM(TRY_CAST(param_value_num AS DOUBLE)) AS n_total,
               SUM(CASE WHEN list_contains({africa}, {norm('classification')})
                        THEN TRY_CAST(param_value_num AS DOUBLE) ELSE 0 END)
                 AS n_africa,
               COUNT(DISTINCT classification) AS n_regions,
               string_agg(DISTINCT classification, ' | ') AS regions
        FROM {B}
        WHERE title ILIKE '%region of enrollment%'
          AND classification IS NOT NULL AND trim(classification) <> ''
          AND param_value_num IS NOT NULL
        GROUP BY nct_id""")

    con.execute(f"""CREATE OR REPLACE TEMP TABLE age AS
        SELECT nct_id,
               AVG(TRY_CAST(param_value_num AS DOUBLE)) AS age_mean,
               AVG(TRY_CAST(dispersion_value_num AS DOUBLE)) AS age_dispersion,
               MIN(units) AS age_units,
               MIN(param_type) AS age_param_type
        FROM {B}
        WHERE title ILIKE 'age%' AND param_value_num IS NOT NULL
          AND lower(COALESCE(param_type,'')) LIKE '%mean%'
        GROUP BY nct_id""")

    # Sex is a COUNT baseline measure, and the Female/Male split lives in
    # `category`, NOT `classification` — measured: category holds 220,988 Female
    # / 220,940 Male rows while classification is NULL for 434,617 of them.
    # Keying on classification (the obvious guess, and my first version) found
    # only 843 trials instead of ~73,000 — a 87x undercount that looked like
    # "the registry rarely reports sex" rather than like a bug. classification is
    # kept as a fallback for the minority that use it.
    # `lower(...) LIKE 'male%'` would also match 'male' inside nothing else here,
    # but note it must not be written as '%male%' — that matches FEMALE too.
    con.execute(f"""CREATE OR REPLACE TEMP TABLE sex AS
        SELECT nct_id,
               SUM(CASE WHEN lower(COALESCE(category, classification, ''))
                             LIKE 'female%'
                        THEN TRY_CAST(param_value_num AS DOUBLE) ELSE 0 END) AS n_female,
               SUM(CASE WHEN lower(COALESCE(category, classification, ''))
                             LIKE 'male%'
                        THEN TRY_CAST(param_value_num AS DOUBLE) ELSE 0 END) AS n_male
        FROM {B}
        WHERE (title ILIKE 'sex%' OR title ILIKE 'gender%')
          AND param_value_num IS NOT NULL
          AND lower(COALESCE(param_type,'')) LIKE '%count%'
        GROUP BY nct_id""")

    import glob
    fs = sorted(glob.glob(os.path.join(C.STORE, "trials", "*.parquet")))
    T = ("read_parquet([" + ",".join("'" + f.replace(os.sep, "/") + "'"
                                     for f in fs) + "])")

    sql = f"""
    SELECT
      t.nct_id AS study_id,
      -- ENROLMENT GEOGRAPHY (participants, not sites)
      r.n_total AS cov_enrolled_reported,
      r.n_africa AS cov_enrolled_africa,
      CASE WHEN r.n_total > 0 THEN r.n_africa / r.n_total END
        AS cov_pct_enrolled_africa,
      r.n_regions AS cov_n_regions,
      r.regions AS enrolment_regions,
      (r.nct_id IS NOT NULL) AS has_region_of_enrollment,
      -- site-level fallback: weaker (a site is not a participant) but broader
      CAST(CASE WHEN t.has_african_site THEN 1 ELSE 0 END AS DOUBLE)
        AS cov_has_african_site,
      CAST(COALESCE(t.n_countries,0) AS DOUBLE) AS cov_n_site_countries,
      -- WHO: age + sex, structured
      a.age_mean AS cov_age_mean,
      a.age_dispersion AS cov_age_dispersion,
      a.age_units, a.age_param_type,
      s.n_female AS cov_n_female, s.n_male AS cov_n_male,
      CASE WHEN (COALESCE(s.n_female,0) + COALESCE(s.n_male,0)) > 0
           THEN s.n_female / (s.n_female + s.n_male) END AS cov_pct_female,
      -- CONTEXT: what standard of care / era / setting the estimate came from
      TRY_CAST(substr(CAST(t.start_date AS VARCHAR),1,4) AS DOUBLE) AS cov_start_year,
      CAST(COALESCE(t.enrollment,0) AS DOUBLE) AS cov_enrollment_target,
      CAST(COALESCE(t.n_sites,0) AS DOUBLE) AS cov_n_sites,
      CAST(CASE WHEN upper(COALESCE(t.lead_sponsor_class,''))='INDUSTRY'
                THEN 1 ELSE 0 END AS DOUBLE) AS cov_industry_sponsor,
      t.phase, t.conditions,
      'registry' AS source_tier,
      'baseline_measurements: Region of Enrollment / Age / Sex (AACT '
        || '{C.AACT_SNAPSHOT}'  || ')' AS method,
      'NULL where the trial never posted the measure — never imputed'
        AS absence_policy,
      t.locator, '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS extracted_at
    FROM {T} t
    LEFT JOIN region r ON r.nct_id = t.nct_id
    LEFT JOIN age a ON a.nct_id = t.nct_id
    LEFT JOIN sex s ON s.nct_id = t.nct_id
    """
    dst = os.path.join(TRANSPORT_DIR, "trial_transport.parquet")
    tmp = dst + ".tmp"
    con.execute(f"COPY ({sql}) TO '{tmp.replace(os.sep,'/')}' "
                f"(FORMAT PARQUET, COMPRESSION ZSTD)")
    n, d = con.execute(f"SELECT COUNT(*), COUNT(DISTINCT study_id) FROM "
                       f"read_parquet('{tmp.replace(os.sep,'/')}')").fetchone()
    if n != d:
        os.remove(tmp)
        raise ValueError(f"transport fanned out: {n} rows for {d} trials")
    os.replace(tmp, dst)

    r = con.execute(f"""SELECT COUNT(*),
          SUM(CASE WHEN has_region_of_enrollment THEN 1 ELSE 0 END),
          SUM(CASE WHEN cov_pct_enrolled_africa > 0 THEN 1 ELSE 0 END),
          SUM(CASE WHEN cov_age_mean IS NOT NULL THEN 1 ELSE 0 END),
          SUM(CASE WHEN cov_pct_female IS NOT NULL THEN 1 ELSE 0 END)
        FROM read_parquet('{dst.replace(os.sep,'/')}')""").fetchone()
    out = {"trials": r[0], "with_region_of_enrollment": r[1],
           "with_any_african_enrolment": r[2],
           "with_structured_age": r[3], "with_structured_sex": r[4],
           "path": dst,
           "note": "NULL = the trial never posted it. Never imputed."}
    print(f"[transport] {json.dumps(out, indent=2)}")
    return out


def report() -> dict:
    """Transportability by cohort — the Kampala question, per disease."""
    import duckdb
    import cohorts
    con = duckdb.connect()
    p = os.path.join(TRANSPORT_DIR, "trial_transport.parquet")
    if not os.path.isfile(p):
        raise FileNotFoundError("run: python transport.py")
    X = f"read_parquet('{p.replace(os.sep,'/')}')"
    K = cohorts.cohort_table()
    out = {"question": "can a Kampala clinician tell whether this estimate "
                       "applies to their patients?", "cohorts": {}}
    for key in ["malaria", "tb", "hiv", "ncd_any", "ncd_cardiometabolic",
                "ncd_cancer", "ncd_kidney", "ncd_respiratory"]:
        r = con.execute(f"""
            SELECT COUNT(*),
                   SUM(CASE WHEN x.has_region_of_enrollment THEN 1 ELSE 0 END),
                   SUM(CASE WHEN x.cov_pct_enrolled_africa > 0 THEN 1 ELSE 0 END),
                   AVG(x.cov_pct_enrolled_africa),
                   SUM(CASE WHEN x.cov_age_mean IS NOT NULL THEN 1 ELSE 0 END),
                   SUM(CASE WHEN x.cov_pct_female IS NOT NULL THEN 1 ELSE 0 END)
            FROM {X} x JOIN {K} k ON k.nct_id = x.study_id
            WHERE k."{key}" """).fetchone()
        n = r[0] or 0
        out["cohorts"][key] = {
            "trials": n,
            "with_region_of_enrollment": r[1] or 0,
            "with_ANY_african_participants": r[2] or 0,
            "mean_pct_participants_in_africa":
                round(100.0 * (r[3] or 0.0), 2),
            "with_structured_age": r[4] or 0,
            "with_structured_sex": r[5] or 0,
            "transport_assessable_pct":
                round(100.0 * (r[1] or 0) / n, 1) if n else 0.0,
        }
    print(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    if not a.report:
        build()
    report()
