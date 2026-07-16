"""Stage T1 — FULL registry pre-extraction over the whole CT.gov RCT universe.

Scope difference from `preextract.py` (deliberate, not a fork): that stage answers
"for the NCTs the 68k metas cite, what does the registry hold?" and stores COUNTS.
This stage answers "for every randomised interventional trial CT.gov has, give me
the actual data a synthesist needs" and stores the RECORDS. It reuses the same
config roots, the same node-tagged JSONL ledger discipline, and the same AACT
snapshot, so the two land in one store and `coverage.py` reads both.

Universe: `study_type='INTERVENTIONAL' AND allocation='RANDOMIZED'` = 290,724
trials on the 2026-04-12 snapshot. Ordered malaria/TB/HIV first (Mahmood's
priority), then the rest — ordering only, nothing is dropped.

ARM IDENTITY — the load-bearing decision. `ctgov_group_code` (OG000, EG000…) is
NOT a trial-level arm key: it is scoped **per outcome**. Measured on this
snapshot, 157,837 of 185,624 (nct_id, group_code) pairs map to >1 distinct
`result_group_id`; NCT01626079's `OG000` alone resolves to 319 result groups
spanning three different arms ("MitraClip System", "Device Group", "Randomized
Group"). Keying arms on the code would silently fuse distinct arms in ~85% of
trials with results. So every result row is keyed on `result_group_id` and its
title is COPIED from `result_groups`, never inferred from the code. The code is
retained as a display label only.

Durable partition: `universe.parquet` (nct_id, cohort, batch_id) is written once
and reused. Batch boundaries therefore never shift, so a resume months later
skips exactly the batches already done. Rebuilding it is opt-in (--rebuild-universe)
and refuses to run if any batch is already extracted, because a reshuffle would
silently double-count trials across old and new batch files.

Provenance (the evidence contract): every emitted row carries source_tier,
locator, aact_snapshot and extracted_at. A datum without a source does not enter
the store.

Run:  python registry_full.py --batches 5          # next 5 pending batches
      python registry_full.py --all                # grind everything
      python registry_full.py --status
"""
from __future__ import annotations

import argparse
import json
import os
import time
from datetime import date

import config as C
import geo
from net import append_jsonl

SOURCE_TIER = "registry"
BATCH_SIZE = 5000

# Sub-tables written per batch. Order matters only for readability.
STORE_TABLES = ["trials", "trial_arms", "trial_interventions", "trial_outcomes",
                "trial_results", "trial_ae", "trial_sites", "trial_refs"]

# Priority cohort. Condition-name based; `\btb\b` and `\bhiv\b` are word-bounded
# because unbounded 'tb'/'hiv' substring-match unrelated terms.
PRIORITY_RE = (r'(malaria|plasmodium|tuberculos|\btb\b|\bhiv\b|\baids\b|'
               r'acquired immunodeficiency|antiretroviral)')

_P = None  # parquet mirror root, set at connect


def _pq(table: str) -> str:
    """Table expression for the upstream parquet mirror (may be sharded)."""
    import glob
    files = sorted(glob.glob(os.path.join(_P, table, "*.parquet")))
    if not files:
        raise FileNotFoundError(f"AACT mirror table absent: {table}")
    return "read_parquet([" + ",".join(
        "'" + f.replace(os.sep, "/") + "'" for f in files) + "])"


def _ext(table: str) -> str:
    """Table expression for a converted-ext parquet (aact_ext.py)."""
    p = C.ext_table(table)
    if p is None:
        raise FileNotFoundError(
            f"Extended AACT table '{table}' not converted. Run: python aact_ext.py")
    return f"read_parquet('{p.replace(os.sep, '/')}')"


def _norm_country_sql(col: str) -> str:
    """duckdb-side mirror of geo.normalize_country(). Kept in lockstep by
    tests/test_registry_full.py, which asserts SQL and Python agree on every
    distinct country string in the snapshot."""
    s = f"replace(replace(replace({col}, '’', ''''), '‘', ''''), 'ʼ', '''')"
    return f"trim(regexp_replace(lower(strip_accents({s})), '\\s+', ' ', 'g'))"


def connect():
    import duckdb
    global _P
    _P = C.require_aact()
    con = duckdb.connect()
    con.execute("SET memory_limit='6GB'")
    con.execute("SET preserve_insertion_order=false")
    return con


# --------------------------------------------------------------------------
# Universe: the durable, stable partition of the RCT space.
# --------------------------------------------------------------------------
def universe_path() -> str:
    return os.path.join(C.STORE, "universe.parquet")


def build_universe(con, batch_size: int = BATCH_SIZE, rebuild: bool = False) -> dict:
    path = universe_path()
    if os.path.isfile(path) and not rebuild:
        n = con.execute(f"SELECT COUNT(*), MAX(batch_id) FROM "
                        f"read_parquet('{path.replace(os.sep,'/')}')").fetchone()
        return {"status": "reuse", "trials": n[0], "batches": n[1] + 1}

    if rebuild and _done_batches():
        raise RuntimeError(
            "refusing to rebuild universe: batches already extracted. A reshuffle "
            "would reassign trials to different batch files and double-count them "
            "at merge. Delete the store first if you really mean to start over.")

    os.makedirs(C.STORE, exist_ok=True)
    sql = f"""
    WITH rct AS (
      SELECT s.nct_id FROM {_pq('studies')} s
      JOIN {_pq('designs')} d USING(nct_id)
      WHERE s.study_type = 'INTERVENTIONAL' AND d.allocation = 'RANDOMIZED'
    ),
    prio AS (
      SELECT DISTINCT nct_id FROM {_pq('conditions')}
      WHERE regexp_matches(downcase_name, '{PRIORITY_RE}')
    ),
    tagged AS (
      SELECT r.nct_id,
             CASE WHEN p.nct_id IS NOT NULL THEN 'p0_malaria_tb_hiv'
                  ELSE 'p1_rest' END AS cohort
      FROM rct r LEFT JOIN prio p ON r.nct_id = p.nct_id
    )
    -- FLOOR, not CAST: duckdb's `/` is true division, so CAST(x/n AS INTEGER)
    -- ROUNDS and would put only half a batch in batch 0 (measured: 2,501 of
    -- 5,000). Integer division must be explicit.
    SELECT nct_id, cohort,
           CAST(FLOOR((row_number() OVER (
                   ORDER BY CASE WHEN cohort = 'p0_malaria_tb_hiv' THEN 0 ELSE 1 END,
                            nct_id) - 1) / {batch_size}) AS INTEGER) AS batch_id
    FROM tagged
    """
    tmp = path + ".tmp"
    con.execute(f"COPY ({sql}) TO '{tmp.replace(os.sep,'/')}' (FORMAT PARQUET)")
    os.replace(tmp, path)
    r = con.execute(f"""SELECT COUNT(*), MAX(batch_id),
                        SUM(CASE WHEN cohort='p0_malaria_tb_hiv' THEN 1 ELSE 0 END)
                        FROM read_parquet('{path.replace(os.sep,'/')}')""").fetchone()
    return {"status": "built", "trials": r[0], "batches": r[1] + 1,
            "priority_malaria_tb_hiv": r[2]}


def extend_universe(con, batch_size: int = BATCH_SIZE) -> dict:
    """ADD trials the strict predicate misses. Additive only — never reshuffles.

    METHODS-CONTRACT §0: do not report OUR ceiling as the WORLD'S limit. Our
    universe predicate is `study_type='INTERVENTIONAL' AND allocation='RANDOMIZED'`,
    and AACT's `allocation` is simply NULL for some trials that ARE randomised —
    the field was never filled in. Measured on this snapshot:

        interventional, allocation NULL            5,694
        ...of which say "randomi*" in the title      710   <- randomised, dropped
        ...of those 710, with an African site         23
        ...of those 710, malaria/TB                    2

    710 of 290,724 is 0.24% — small, but it is OUR filter defining trials out of
    the corpus, which is exactly the failure the contract names. So we recover
    them rather than report a coverage number that quietly excludes them.

    Additive by construction: new NCTs get batch_ids starting at max+1, so every
    existing batch assignment is untouched and already-extracted batches are
    neither re-run nor invalidated. This is why `build_universe(rebuild=True)`
    stays forbidden — a reshuffle would double-count; an append cannot.

    These trials are tagged `randomised_by_title` so downstream can treat them as
    a distinct, weaker-evidence stratum: the title says randomised, the structured
    field never confirmed it. That is a candidate, not a verdict.
    """
    path = universe_path()
    if not os.path.isfile(path):
        raise FileNotFoundError("build the universe first")
    existing = con.execute(f"SELECT COUNT(*), MAX(batch_id) FROM {_univ()}").fetchone()
    next_batch = (existing[1] or 0) + 1

    sql = f"""
    WITH extra AS (
      SELECT s.nct_id
      FROM {_pq('studies')} s
      LEFT JOIN {_pq('designs')} d USING(nct_id)
      WHERE s.study_type = 'INTERVENTIONAL'
        AND d.allocation IS NULL
        AND lower(COALESCE(s.brief_title,'') || ' ' ||
                  COALESCE(s.official_title,'')) LIKE '%randomi%'
        AND s.nct_id NOT IN (SELECT nct_id FROM {_univ()})
    ),
    prio AS (
      SELECT DISTINCT nct_id FROM {_pq('conditions')}
      WHERE regexp_matches(downcase_name, '{PRIORITY_RE}')
    )
    SELECT e.nct_id,
           CASE WHEN p.nct_id IS NOT NULL THEN 'p0_malaria_tb_hiv'
                ELSE 'p1_rest' END AS cohort,
           CAST({next_batch} + FLOOR((row_number() OVER (ORDER BY e.nct_id) - 1)
                / {batch_size}) AS INTEGER) AS batch_id
    FROM extra e LEFT JOIN prio p ON p.nct_id = e.nct_id
    """
    n_new = con.execute(f"SELECT COUNT(*) FROM ({sql})").fetchone()[0]
    if n_new == 0:
        return {"status": "nothing to add", "trials": existing[0]}

    tmp = path + ".ext.tmp"
    con.execute(f"""COPY (
        SELECT nct_id, cohort, batch_id FROM {_univ()}
        UNION ALL
        SELECT nct_id, cohort, batch_id FROM ({sql})
    ) TO '{tmp.replace(os.sep,'/')}' (FORMAT PARQUET)""")
    n, d = con.execute(f"SELECT COUNT(*), COUNT(DISTINCT nct_id) FROM "
                       f"read_parquet('{tmp.replace(os.sep,'/')}')").fetchone()
    if n != d:
        os.remove(tmp)
        raise ValueError(f"extend would duplicate trials ({n} rows, {d} distinct)")
    os.replace(tmp, path)
    return {"status": "extended", "added": n_new, "trials_before": existing[0],
            "trials_after": n, "first_new_batch": next_batch,
            "note": "randomised-by-title, allocation NULL in AACT — recovered "
                    "per METHODS-CONTRACT §0 (our filter is not the world's limit)"}


def _univ() -> str:
    return f"read_parquet('{universe_path().replace(os.sep, '/')}')"


def _done_batches() -> set:
    done = set()
    for p in C.node_ledgers("registry_full"):
        with open(p, encoding="utf-8") as f:
            for ln in f:
                if not ln.strip():
                    continue
                try:
                    r = json.loads(ln)
                    if r.get("status") == "ok":
                        done.add(r["batch_id"])
                except Exception:
                    continue
    return done


# --------------------------------------------------------------------------
# Per-batch extraction SQL. Every SELECT is scoped to temp table `b` (the batch).
# --------------------------------------------------------------------------
def _sql_trials(today: str) -> str:
    africa = geo.africa_sql_list()
    return f"""
    WITH lead_sp AS (
      SELECT nct_id, MIN(name) AS lead_sponsor, MIN(agency_class) AS lead_sponsor_class
      FROM {_pq('sponsors')} WHERE lower(lead_or_collaborator) = 'lead'
        AND nct_id IN (SELECT nct_id FROM b) GROUP BY nct_id
    ),
    collab AS (
      SELECT nct_id, COUNT(*) AS n_collaborators FROM {_pq('sponsors')}
      WHERE lower(lead_or_collaborator) <> 'lead'
        AND nct_id IN (SELECT nct_id FROM b) GROUP BY nct_id
    ),
    cond AS (
      SELECT nct_id, COUNT(*) AS n_conditions,
             string_agg(name, ' | ' ORDER BY name) AS conditions
      FROM {_pq('conditions')} WHERE nct_id IN (SELECT nct_id FROM b) GROUP BY nct_id
    ),
    fac AS (
      SELECT nct_id, COUNT(*) AS n_sites,
             COUNT(DISTINCT country) AS n_countries,
             MAX(CASE WHEN list_contains({africa}, {_norm_country_sql('country')})
                      THEN 1 ELSE 0 END) AS has_african_site,
             string_agg(DISTINCT country, ' | ') AS countries
      FROM {_ext('facilities')} WHERE nct_id IN (SELECT nct_id FROM b) GROUP BY nct_id
    ),
    om AS (
      SELECT nct_id, COUNT(*) AS n_result_rows,
             COUNT(DISTINCT outcome_id) AS n_outcomes_with_results
      FROM {_pq('outcome_measurements')} WHERE nct_id IN (SELECT nct_id FROM b)
      GROUP BY nct_id
    ),
    ae AS (
      SELECT nct_id, COUNT(*) AS n_ae_rows,
             SUM(CASE WHEN lower(event_type)='serious' THEN 1 ELSE 0 END) AS n_serious_ae_rows
      FROM {_pq('reported_events')} WHERE nct_id IN (SELECT nct_id FROM b)
      GROUP BY nct_id
    ),
    dsn AS (
      SELECT nct_id, allocation, intervention_model, primary_purpose, masking
      FROM {_pq('designs')} WHERE nct_id IN (SELECT nct_id FROM b)
    )
    SELECT
      s.nct_id, u.cohort, u.batch_id,
      s.brief_title, s.official_title,
      s.study_type, d.allocation, d.intervention_model, d.primary_purpose, d.masking,
      s.phase, s.overall_status, s.last_known_status, s.why_stopped,
      TRY_CAST(s.enrollment AS INTEGER) AS enrollment, s.enrollment_type,
      TRY_CAST(s.number_of_arms AS INTEGER) AS number_of_arms,
      s.start_date, s.primary_completion_date, s.primary_completion_date_type,
      s.completion_date, s.study_first_posted_date, s.results_first_posted_date,
      (s.results_first_posted_date IS NOT NULL) AS results_posted,
      s.source AS source_org,
      lead_sp.lead_sponsor, lead_sp.lead_sponsor_class,
      COALESCE(collab.n_collaborators, 0) AS n_collaborators,
      COALESCE(cond.n_conditions, 0) AS n_conditions, cond.conditions,
      COALESCE(fac.n_sites, 0) AS n_sites,
      COALESCE(fac.n_countries, 0) AS n_countries,
      COALESCE(fac.has_african_site, 0) = 1 AS has_african_site,
      fac.countries,
      COALESCE(om.n_result_rows, 0) AS n_result_rows,
      COALESCE(om.n_outcomes_with_results, 0) AS n_outcomes_with_results,
      COALESCE(ae.n_ae_rows, 0) AS n_ae_rows,
      COALESCE(ae.n_serious_ae_rows, 0) AS n_serious_ae_rows,
      (COALESCE(ae.n_ae_rows,0) > 0) AS has_ae_table,
      s.fdaaa801_violation,
      '{SOURCE_TIER}' AS source_tier,
      'https://clinicaltrials.gov/study/' || s.nct_id AS locator,
      '{C.AACT_SNAPSHOT}' AS aact_snapshot,
      '{today}' AS extracted_at
    FROM {_pq('studies')} s
    JOIN b ON b.nct_id = s.nct_id
    JOIN {_univ()} u ON u.nct_id = s.nct_id
    LEFT JOIN dsn d ON d.nct_id = s.nct_id
    LEFT JOIN lead_sp ON lead_sp.nct_id = s.nct_id
    LEFT JOIN collab ON collab.nct_id = s.nct_id
    LEFT JOIN cond ON cond.nct_id = s.nct_id
    LEFT JOIN fac ON fac.nct_id = s.nct_id
    LEFT JOIN om ON om.nct_id = s.nct_id
    LEFT JOIN ae ON ae.nct_id = s.nct_id
    """


def _sql_arms(today: str) -> str:
    """Protocol arms, with their interventions attached via the link table."""
    return f"""
    WITH dgi AS (
      SELECT gi.design_group_id, gi.nct_id,
             string_agg(i.name, ' | ') AS intervention_names,
             string_agg(i.intervention_type, ' | ') AS intervention_types
      FROM {_ext('design_group_interventions')} gi
      JOIN {_pq('interventions')} i ON i.id = gi.intervention_id
      WHERE gi.nct_id IN (SELECT nct_id FROM b)
      GROUP BY gi.design_group_id, gi.nct_id
    )
    SELECT g.nct_id, g.id AS design_group_id, g.group_type, g.title, g.description,
           dgi.intervention_names, dgi.intervention_types,
           '{SOURCE_TIER}' AS source_tier,
           'https://clinicaltrials.gov/study/' || g.nct_id AS locator,
           '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS extracted_at
    FROM {_pq('design_groups')} g
    JOIN b ON b.nct_id = g.nct_id
    LEFT JOIN dgi ON dgi.design_group_id = CAST(g.id AS VARCHAR)
                 AND dgi.nct_id = g.nct_id
    """


def _sql_interventions(today: str) -> str:
    return f"""
    SELECT i.nct_id, i.id AS intervention_id, i.intervention_type, i.name,
           i.description,
           '{SOURCE_TIER}' AS source_tier,
           'https://clinicaltrials.gov/study/' || i.nct_id AS locator,
           '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS extracted_at
    FROM {_pq('interventions')} i JOIN b ON b.nct_id = i.nct_id
    """


def _sql_outcomes(today: str) -> str:
    """REGISTERED outcomes (design_outcomes) — present even with no results
    posted. This is what makes the non-posting/zombie signal measurable: a
    registered primary outcome with no matching posted result."""
    return f"""
    SELECT o.nct_id, o.outcome_type, o.measure, o.time_frame, o.population,
           o.description,
           '{SOURCE_TIER}' AS source_tier,
           'https://clinicaltrials.gov/study/' || o.nct_id AS locator,
           '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS extracted_at
    FROM {_ext('design_outcomes')} o JOIN b ON b.nct_id = o.nct_id
    """


def _sql_results(today: str) -> str:
    """POSTED outcome measurements, arm-resolved via result_group_id.

    `group_title` comes from result_groups by FK. `ctgov_group_code` is carried
    as a label only — see module docstring for why it is not an arm key.
    Rows whose result_group_id does not resolve (2,216 in the snapshot) keep a
    NULL group_title and group_resolved=false rather than being dropped or
    guessed: an unresolvable arm is a known gap, not an absent row.
    """
    return f"""
    SELECT m.nct_id, m.outcome_id, o.outcome_type, o.title AS outcome_title,
           o.time_frame, o.population AS outcome_population,
           m.result_group_id, m.ctgov_group_code,
           g.title AS group_title, g.description AS group_description,
           (g.id IS NOT NULL) AS group_resolved,
           m.classification, m.category, m.title AS measurement_title,
           m.units, m.param_type,
           TRY_CAST(m.param_value_num AS DOUBLE) AS param_value_num,
           m.param_value,
           m.dispersion_type,
           TRY_CAST(m.dispersion_value_num AS DOUBLE) AS dispersion_value_num,
           TRY_CAST(m.dispersion_lower_limit AS DOUBLE) AS dispersion_lower_limit,
           TRY_CAST(m.dispersion_upper_limit AS DOUBLE) AS dispersion_upper_limit,
           m.explanation_of_na,
           '{SOURCE_TIER}' AS source_tier,
           'https://clinicaltrials.gov/study/' || m.nct_id AS locator,
           '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS extracted_at
    FROM {_pq('outcome_measurements')} m
    JOIN b ON b.nct_id = m.nct_id
    LEFT JOIN {_pq('outcomes')} o ON CAST(o.id AS VARCHAR) = CAST(m.outcome_id AS VARCHAR)
    LEFT JOIN {_ext('result_groups')} g
           ON CAST(g.id AS VARCHAR) = CAST(m.result_group_id AS VARCHAR)
    """


def _sql_ae(today: str) -> str:
    """The harms layer: structured adverse-event table, arm-resolved by FK."""
    return f"""
    SELECT e.nct_id, e.result_group_id, e.ctgov_group_code,
           g.title AS group_title, (g.id IS NOT NULL) AS group_resolved,
           e.event_type, e.organ_system, e.adverse_event_term,
           TRY_CAST(e.subjects_affected AS INTEGER) AS subjects_affected,
           TRY_CAST(e.subjects_at_risk AS INTEGER) AS subjects_at_risk,
           TRY_CAST(e.event_count AS INTEGER) AS event_count,
           e.time_frame, e.frequency_threshold, e.assessment, e.vocab,
           '{SOURCE_TIER}' AS source_tier,
           'https://clinicaltrials.gov/study/' || e.nct_id AS locator,
           '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS extracted_at
    FROM {_pq('reported_events')} e
    JOIN b ON b.nct_id = e.nct_id
    LEFT JOIN {_ext('result_groups')} g
           ON CAST(g.id AS VARCHAR) = CAST(e.result_group_id AS VARCHAR)
    """


def _sql_sites(today: str) -> str:
    africa = geo.africa_sql_list()
    return f"""
    SELECT f.nct_id, f.name AS facility_name, f.city, f.state, f.zip, f.country,
           list_contains({africa}, {_norm_country_sql('f.country')}) AS is_african_site,
           TRY_CAST(f.latitude AS DOUBLE) AS latitude,
           TRY_CAST(f.longitude AS DOUBLE) AS longitude,
           '{SOURCE_TIER}' AS source_tier,
           'https://clinicaltrials.gov/study/' || f.nct_id AS locator,
           '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS extracted_at
    FROM {_ext('facilities')} f JOIN b ON b.nct_id = f.nct_id
    """


def _sql_refs(today: str) -> str:
    """NCT -> PMID crosswalk rows for this batch (registry side of the link)."""
    return f"""
    SELECT r.nct_id, r.pmid, r.reference_type, r.citation,
           '{SOURCE_TIER}' AS source_tier,
           'https://clinicaltrials.gov/study/' || r.nct_id AS locator,
           '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS extracted_at
    FROM {_ext('study_references')} r JOIN b ON b.nct_id = r.nct_id
    WHERE r.pmid IS NOT NULL AND trim(r.pmid) <> ''
    """


_BUILDERS = {
    "trials": _sql_trials, "trial_arms": _sql_arms,
    "trial_interventions": _sql_interventions, "trial_outcomes": _sql_outcomes,
    "trial_results": _sql_results, "trial_ae": _sql_ae,
    "trial_sites": _sql_sites, "trial_refs": _sql_refs,
}


def batch_path(table: str, batch_id: int) -> str:
    return os.path.join(C.STORE, table, f"batch_{batch_id:04d}.parquet")


def run_batch(con, batch_id: int) -> dict:
    today = date.today().isoformat()
    t0 = time.monotonic()
    con.execute("CREATE OR REPLACE TEMP TABLE b AS "
                f"SELECT nct_id FROM {_univ()} WHERE batch_id = {batch_id}")
    n_ncts = con.execute("SELECT COUNT(*) FROM b").fetchone()[0]
    if n_ncts == 0:
        return {"batch_id": batch_id, "status": "empty", "n_ncts": 0}

    counts = {}
    for table, builder in _BUILDERS.items():
        os.makedirs(os.path.join(C.STORE, table), exist_ok=True)
        dst = batch_path(table, batch_id)
        tmp = dst + ".tmp"
        con.execute(f"COPY ({builder(today)}) TO '{tmp.replace(os.sep,'/')}' "
                    f"(FORMAT PARQUET, COMPRESSION ZSTD)")
        counts[table] = con.execute(
            f"SELECT COUNT(*) FROM read_parquet('{tmp.replace(os.sep,'/')}')"
        ).fetchone()[0]
        os.replace(tmp, dst)

    # Fail closed: a batch must produce exactly one trial row per NCT. Anything
    # else means a join fanned out or dropped rows, and the batch is not trusted.
    if counts["trials"] != n_ncts:
        for t in STORE_TABLES:
            p = batch_path(t, batch_id)
            if os.path.isfile(p):
                os.remove(p)
        raise ValueError(
            f"batch {batch_id}: trials rows {counts['trials']} != NCTs {n_ncts} — "
            f"join fan-out or loss. Batch files removed; not recorded as done.")

    rec = {"batch_id": batch_id, "status": "ok", "n_ncts": n_ncts,
           "counts": counts, "secs": round(time.monotonic() - t0, 1),
           "aact_snapshot": C.AACT_SNAPSHOT, "extracted_at": today,
           "node": C.NODE}
    append_jsonl(C.DATA + f"/registry_full.{C.NODE}.jsonl", rec)
    return rec


def run(limit: int | None, do_all: bool = False,
        shard_id: int = 0, shard_count: int = 1) -> dict:
    con = connect()
    u = build_universe(con)
    print(f"[registry_full] universe: {u}", flush=True)

    total_batches = con.execute(
        f"SELECT MAX(batch_id) FROM {_univ()}").fetchone()[0] + 1
    done = _done_batches()
    pending = [b for b in range(total_batches) if b not in done
               and (shard_count <= 1 or b % shard_count == shard_id)]
    if not do_all and limit:
        pending = pending[:limit]

    print(f"[registry_full] {len(done)}/{total_batches} batches done; "
          f"running {len(pending)}", flush=True)
    agg = {"batches_run": 0, "trials": 0, "errors": 0}
    for b in pending:
        try:
            r = run_batch(con, b)
            agg["batches_run"] += 1
            agg["trials"] += r.get("n_ncts", 0)
            print(f"[registry_full] batch {b}: {r['n_ncts']} trials in {r['secs']}s "
                  f"results={r['counts']['trial_results']} ae={r['counts']['trial_ae']} "
                  f"sites={r['counts']['trial_sites']}", flush=True)
        except Exception as e:
            agg["errors"] += 1
            append_jsonl(C.DATA + f"/registry_full.{C.NODE}.jsonl",
                         {"batch_id": b, "status": "ERROR", "error": str(e)[:400]})
            print(f"[registry_full] batch {b} ERROR: {str(e)[:200]}", flush=True)
    return agg


def status() -> dict:
    done = _done_batches()
    return {"batches_done": len(done), "store": C.STORE,
            "tables": {t: len(os.listdir(os.path.join(C.STORE, t)))
                       for t in STORE_TABLES
                       if os.path.isdir(os.path.join(C.STORE, t))}}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--batches", type=int, default=1)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--rebuild-universe", action="store_true")
    ap.add_argument("--extend-universe", action="store_true",
                    help="additively recover randomised-by-title trials whose "
                         "AACT allocation field is NULL (METHODS-CONTRACT §0)")
    ap.add_argument("--shard-id", type=int, default=0)
    ap.add_argument("--shard-count", type=int, default=1)
    a = ap.parse_args()
    if a.status:
        print(json.dumps(status(), indent=2))
    elif a.rebuild_universe:
        print(json.dumps(build_universe(connect(), rebuild=True), indent=2))
    elif a.extend_universe:
        print(json.dumps(extend_universe(connect()), indent=2))
    else:
        print(json.dumps(run(a.batches, a.all, a.shard_id, a.shard_count), indent=2))
