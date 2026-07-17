"""Stage T5 — the distilled, shippable per-trial index. ONE row per trial.

This is the artefact a synthesist in Kampala actually queries: for a topic, which
trials exist, what data is reachable for each, and where each datum came from.
Everything upstream is raw material; this is the lookup.

THE TRIAL IS THE UNIT — the dedup rule that matters. A trial recurs across many
papers (primary report, secondary analyses, every meta that pools it), so joining
trials to papers naively fans out and counts one trial N times. Here the paper
side is COLLAPSED per trial before the join, so `SELECT COUNT(*)` on this table
is a true trial count. The row records how many papers report the trial (a real
signal — a trial reported many times is the redundancy the 68k lane's Phase-4
graph is built on) without ever multiplying the trial.

Only DERIVED/RESULT links attach a paper to a trial. BACKGROUND means the trial
cited the paper; treating that as "reports this trial" attaches other studies'
effect data to the wrong trial. 60.2% of linked PMIDs are BACKGROUND-only.

Layers, per trial:
  layer1_registry   always true here (the row exists because the registry has it)
  registry_results  the registry posted structured outcome data
  registry_ae       the registry posted a structured adverse-event table
  layer2_abstract   >=1 reporting paper with an abstract
  layer3_oa_ft      >=1 reporting paper that is open-access AND in PMC
  fulltext_cached   we have actually harvested that full text (not just that it
                    is theoretically open) — availability != acquisition, and
                    conflating them would over-claim coverage

`data_completeness` is a plain ordinal for triage, NOT a quality score: it counts
which layers are present, and says nothing about whether the numbers are right.

Run:  python trial_index.py            # build
      python trial_index.py --summary  # counts by cohort/disease
"""
from __future__ import annotations

import argparse
import glob
import json
import os
from datetime import date

import config as C

INDEX_DIR = os.path.join(C.STORE, "trial_index")


def _lst(table: str) -> str | None:
    fs = sorted(glob.glob(os.path.join(C.STORE, table, "*.parquet")))
    if not fs:
        return None
    return "read_parquet([" + ",".join(
        "'" + f.replace(os.sep, "/") + "'" for f in fs) + "])"


def _harvested_pmcids() -> set:
    """PMCIDs whose full text we have ACTUALLY cached (all corpora)."""
    import fulltext
    from net import load_done_keys
    out = set()
    for corpus in fulltext.CORPORA:
        led = fulltext.ft_ledger(corpus)
        if os.path.exists(led):
            with open(led, encoding="utf-8") as f:
                for ln in f:
                    if not ln.strip():
                        continue
                    try:
                        r = json.loads(ln)
                        if r.get("status") == "XML" and r.get("pmcid"):
                            out.add(r["pmcid"])
                    except Exception:
                        continue
    return out


def build() -> dict:
    import duckdb
    T = _lst("trials")
    if T is None:
        raise FileNotFoundError("no trials in the store — run registry_full.py")
    REF = _lst("trial_refs")
    # Prefer the WIDENED paper table (papers_union.py): `papers` holds only
    # PMIDs that came FROM aact refs, so a keyscan-recovered NCT whose paper the
    # registry never linked had no row to join to — the merged gain collapsed
    # 5,861 -> 625 on our own join, not on the world.
    P = _lst("papers_all") or _lst("papers")
    os.makedirs(INDEX_DIR, exist_ok=True)
    con = duckdb.connect()
    con.execute("SET memory_limit='4GB'")

    got = _harvested_pmcids()
    con.execute("CREATE OR REPLACE TEMP TABLE harvested(pmcid VARCHAR)")
    if got:
        con.executemany("INSERT INTO harvested VALUES (?)", [(x,) for x in got])

    # TWO LINK INSTRUMENTS, unioned. AACT's study_references is the REGISTRY's
    # view of the trial->paper link (curated, incomplete). keyscan is the PAPER's
    # view: the accession the authors printed in their own full text. They see
    # different things — measured, keyscan recovers **5,861** trials whose papers
    # study_references never linked — so using only the registry's view reports
    # OUR join predicate as the world's coverage (§0).
    #
    # Only OWN-zone keyscan hits are eligible: a paper CITING an NCT is not a
    # paper reporting it, and 85% of raw full-text hits in the meta-heavy corpora
    # are citations. See keyscan._zone.
    keys = _lst("keyscan") if os.path.isdir(os.path.join(C.STORE, "keyscan")) \
        else None
    ks_cte = f"""
        , ks AS (
          SELECT DISTINCT accession AS nct_id, pmcid, pmid
          FROM {keys}
          WHERE registry = 'ClinicalTrials.gov' AND zone = 'own'
        )""" if keys else ", ks AS (SELECT NULL nct_id, NULL pmcid, NULL pmid WHERE FALSE)"

    # Paper side collapsed to ONE row per trial BEFORE the join — this is the
    # dedup. Without it a trial with 7 reporting papers becomes 7 rows.
    papers_cte = f"""{ks_cte}
        , linked AS (
          SELECT r.nct_id, trim(r.pmid) AS pmid, 'aact_study_references' AS via
          FROM {REF} r WHERE upper(r.reference_type) IN ('DERIVED','RESULT')
          UNION
          SELECT k.nct_id, k.pmid, 'keyscan_own_fulltext' AS via FROM ks k
          WHERE k.pmid IS NOT NULL
        )
        , per_trial_papers AS (
          SELECT l.nct_id,
                 COUNT(DISTINCT p.pmid) AS n_reporting_papers,
                 MAX(CASE WHEN p.has_abstract THEN 1 ELSE 0 END) AS l2,
                 MAX(CASE WHEN p.is_open_access AND p.in_pmc THEN 1 ELSE 0 END) AS l3,
                 MAX(CASE WHEN h.pmcid IS NOT NULL THEN 1 ELSE 0 END) AS ft_cached,
                 MIN(p.pmid) AS first_pmid,
                 MIN(p.pmcid) AS first_pmcid,
                 MIN(p.doi) AS first_doi,
                 string_agg(DISTINCT l.via, '+') AS link_via
          FROM linked l
          JOIN {P} p ON p.pmid = l.pmid
          LEFT JOIN harvested h ON h.pmcid = p.pmcid
          GROUP BY l.nct_id
        )""" if (REF and P) else ""

    join = ("LEFT JOIN per_trial_papers pp ON pp.nct_id = t.nct_id"
            if papers_cte else "")
    cols = ("""COALESCE(pp.n_reporting_papers, 0) AS n_reporting_papers,
               COALESCE(pp.l2, 0) = 1 AS layer2_abstract,
               COALESCE(pp.l3, 0) = 1 AS layer3_oa_fulltext,
               COALESCE(pp.ft_cached, 0) = 1 AS fulltext_cached,
               pp.first_pmid AS pmid, pp.first_pmcid AS pmcid, pp.first_doi AS doi,
               pp.link_via,"""
            if papers_cte else """0 AS n_reporting_papers,
               FALSE AS layer2_abstract, FALSE AS layer3_oa_fulltext,
               FALSE AS fulltext_cached,
               NULL AS pmid, NULL AS pmcid, NULL AS doi, NULL AS link_via,""")

    today = date.today().isoformat()
    sql = f"""
    WITH base AS (SELECT * FROM {T}) {papers_cte}
    SELECT
      t.nct_id, t.cohort, t.brief_title, t.phase, t.overall_status,
      t.enrollment, t.number_of_arms, t.conditions, t.lead_sponsor,
      t.lead_sponsor_class, t.start_date, t.primary_completion_date,
      t.has_african_site, t.n_countries, t.countries,
      TRUE AS layer1_registry,
      t.results_posted AS registry_results,
      t.has_ae_table AS registry_ae,
      t.n_result_rows, t.n_ae_rows,
      {cols}
      -- ordinal triage counter, NOT a quality score
      (CAST(TRUE AS INT)
       + CAST(t.results_posted AS INT)
       + CAST(COALESCE(pp.l2,0)=1 AS INT)
       + CAST(COALESCE(pp.l3,0)=1 AS INT)) AS data_completeness,
      'registry+epmc' AS source_tier,
      'https://clinicaltrials.gov/study/' || t.nct_id AS locator,
      '{C.AACT_SNAPSHOT}' AS aact_snapshot,
      '{today}' AS built_at
    FROM base t {join}
    """ if papers_cte else f"""
    SELECT t.nct_id, t.cohort, t.brief_title, t.phase, t.overall_status,
      t.enrollment, t.number_of_arms, t.conditions, t.lead_sponsor,
      t.lead_sponsor_class, t.start_date, t.primary_completion_date,
      t.has_african_site, t.n_countries, t.countries,
      TRUE AS layer1_registry, t.results_posted AS registry_results,
      t.has_ae_table AS registry_ae, t.n_result_rows, t.n_ae_rows,
      {cols}
      (CAST(TRUE AS INT) + CAST(t.results_posted AS INT)) AS data_completeness,
      'registry' AS source_tier,
      'https://clinicaltrials.gov/study/' || t.nct_id AS locator,
      '{C.AACT_SNAPSHOT}' AS aact_snapshot, '{today}' AS built_at
    FROM {T} t
    """

    dst = os.path.join(INDEX_DIR, "trial_index.parquet")
    tmp = dst + ".tmp"
    con.execute(f"COPY ({sql}) TO '{tmp.replace(os.sep,'/')}' "
                f"(FORMAT PARQUET, COMPRESSION ZSTD)")

    n, d = con.execute(f"SELECT COUNT(*), COUNT(DISTINCT nct_id) FROM "
                       f"read_parquet('{tmp.replace(os.sep,'/')}')").fetchone()
    if n != d:
        os.remove(tmp)
        raise ValueError(
            f"trial_index fanned out: {n} rows for {d} trials. The paper side "
            f"must be collapsed per trial BEFORE the join — the unit is the "
            f"trial, and a fanned-out index double-counts every multi-paper trial.")
    os.replace(tmp, dst)
    return {"trials": n, "path": dst, "fulltext_cached_pmcids": len(got),
            "mb": round(os.path.getsize(dst) / 1e6, 1)}


def summary() -> dict:
    import duckdb
    p = os.path.join(INDEX_DIR, "trial_index.parquet").replace(os.sep, "/")
    if not os.path.isfile(p):
        raise FileNotFoundError("index not built — run trial_index.py first")
    con = duckdb.connect()
    I = f"read_parquet('{p}')"
    row = con.execute(f"""
        SELECT COUNT(*),
               SUM(CAST(registry_results AS INT)),
               SUM(CAST(layer2_abstract AS INT)),
               SUM(CAST(layer3_oa_fulltext AS INT)),
               SUM(CAST(fulltext_cached AS INT)),
               SUM(CASE WHEN registry_results AND layer2_abstract
                         AND layer3_oa_fulltext THEN 1 ELSE 0 END),
               SUM(CAST(has_african_site AS INT)),
               SUM(CASE WHEN n_reporting_papers > 0 THEN 1 ELSE 0 END)
        FROM {I}""").fetchone()
    out = {
        "trials": row[0], "registry_results": row[1],
        "layer2_abstract": row[2], "layer3_oa_fulltext": row[3],
        "fulltext_actually_cached": row[4],
        "all_three_layers": row[5],
        "with_african_site": row[6],
        "with_a_reporting_paper": row[7],
        "note": ("layers 2/3 are FLOORS — they rise as crosswalk/fulltext grind. "
                 "layer3 = OA and in PMC (available); fulltext_cached = actually "
                 "harvested. Availability is not acquisition."),
    }
    out["by_cohort"] = {r[0]: r[1] for r in con.execute(
        f"SELECT cohort, COUNT(*) FROM {I} GROUP BY 1 ORDER BY 2 DESC").fetchall()}
    out["by_completeness"] = {str(r[0]): r[1] for r in con.execute(
        f"SELECT data_completeness, COUNT(*) FROM {I} GROUP BY 1 ORDER BY 1 DESC"
    ).fetchall()}
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--summary", action="store_true")
    a = ap.parse_args()
    if not a.summary:
        print(json.dumps(build(), indent=2))
    print(json.dumps(summary(), indent=2, default=str))
