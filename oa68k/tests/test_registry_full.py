"""Contract tests for the registry pre-extraction layer.

These encode the two failure modes that would corrupt the store silently:

1. **Arm identity.** `ctgov_group_code` is per-outcome, not per-trial. If anyone
   "simplifies" the extractor to key arms on the code, 85% of trials with results
   get distinct arms fused. `test_group_code_is_not_a_trial_level_arm_key` proves
   the trap still exists in the data, and `test_results_are_keyed_by_result_group_id`
   proves we key around it.

2. **Africa flag drift.** The flag is computed twice — in Python (`geo.py`, for
   tests/tools) and in SQL (`registry_full._norm_country_sql`, for 3.4M rows).
   Two implementations of one rule always drift. `test_sql_and_python_africa_agree`
   runs both over every distinct country string in the snapshot and fails on the
   first disagreement.

Skips (not failures) when the AACT mirror is absent, so the suite stays runnable
on a node without the 14 GB dump.

Run:  python -m pytest tests/test_registry_full.py -v
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config as C
import geo

pytestmark = pytest.mark.skipif(
    C.find_aact() is None or C.find_aact_flat() is None,
    reason="AACT mirror/flat dump not present on this node")


@pytest.fixture(scope="module")
def con():
    import registry_full as R
    return R.connect()


# ---------------------------------------------------------------- geo (pure)
def test_papua_new_guinea_is_not_african():
    """The exact false positive a /guinea/ regex produces."""
    assert geo.is_african_country("Papua New Guinea") is False
    assert geo.is_african_country("Guinea") is True
    assert geo.is_african_country("Guinea-Bissau") is True
    assert geo.is_african_country("Equatorial Guinea") is True


def test_curly_apostrophe_and_accents_normalise():
    """AACT ships `Côte d’Ivoire` with U+2019; a literal ASCII compare misses it."""
    assert geo.is_african_country("Côte d’Ivoire") is True
    assert geo.is_african_country("Cote d'Ivoire") is True
    assert geo.is_african_country("CÔTE D’IVOIRE") is True
    assert geo.is_african_country("Réunion") is True


def test_non_african_and_empty_are_false():
    for x in ["France", "United States", "China", "", None, "Guyana",
              "French Guiana"]:
        assert geo.is_african_country(x) is False


def test_african_list_has_no_duplicates_after_normalisation():
    norm = [geo.normalize_country(x) for x in geo.AFRICAN_COUNTRIES_RAW]
    assert len(norm) == len(set(norm)), "duplicate country in the curated list"


# ------------------------------------------------- SQL <-> Python agreement
def test_sql_and_python_africa_agree(con):
    """The whole point: one rule, two implementations, zero drift.

    Runs the duckdb expression over every distinct country string AACT ships and
    compares to geo.is_african_country row by row.
    """
    import registry_full as R
    F = R._ext("facilities")
    rows = con.execute(f"""
        SELECT DISTINCT country,
               list_contains({geo.africa_sql_list()},
                             {R._norm_country_sql('country')}) AS sql_flag
        FROM {F} WHERE country IS NOT NULL
    """).fetchall()
    assert len(rows) > 100, "expected the full country vocabulary"
    mismatches = [(c, bool(s), geo.is_african_country(c))
                  for c, s in rows if bool(s) != geo.is_african_country(c)]
    assert not mismatches, f"SQL/Python africa flag drift: {mismatches[:10]}"


def test_sql_africa_finds_the_expected_continent_size(con):
    """Sanity floor: the snapshot really does carry ~54 African countries."""
    import registry_full as R
    F = R._ext("facilities")
    n = con.execute(f"""
        SELECT COUNT(DISTINCT country) FROM {F}
        WHERE list_contains({geo.africa_sql_list()},
                            {R._norm_country_sql('country')})
    """).fetchone()[0]
    assert 45 <= n <= 60, f"expected ~54 African countries, got {n}"


# ------------------------------------------------------------ arm identity
def test_group_code_is_not_a_trial_level_arm_key(con):
    """Proves the trap is real in this snapshot, so the guard above stays honest.

    If a future AACT snapshot ever made (nct_id, ctgov_group_code) unique, this
    test fails loudly and someone re-reads the design — which is the point.
    """
    import registry_full as R
    OM = R._pq("outcome_measurements")
    ambiguous = con.execute(f"""
        SELECT COUNT(*) FROM (
          SELECT nct_id, ctgov_group_code FROM {OM}
          GROUP BY 1, 2 HAVING COUNT(DISTINCT result_group_id) > 1)
    """).fetchone()[0]
    assert ambiguous > 1000, (
        "ctgov_group_code now looks trial-unique; re-verify the arm-key design "
        "before trusting group_code as an arm identifier")


def test_result_group_id_resolves_to_exactly_one_title(con):
    """The key we DO use must be functionally dependent on the arm."""
    import registry_full as R
    RG = R._ext("result_groups")
    bad = con.execute(f"""
        SELECT COUNT(*) FROM (
          SELECT id FROM {RG} GROUP BY id HAVING COUNT(DISTINCT title) > 1)
    """).fetchone()[0]
    assert bad == 0, f"{bad} result_group_ids map to >1 title — arm key unsafe"


# --------------------------------------------------- extracted-store shape
def _store_ready(table="trials"):
    d = os.path.join(C.STORE, table)
    return os.path.isdir(d) and any(f.endswith(".parquet") for f in os.listdir(d))


@pytest.mark.skipif(not _store_ready(), reason="store not extracted yet")
def test_trials_one_row_per_nct(con):
    """A join fan-out would double-count trials — the unit is the trial."""
    p = os.path.join(C.STORE, "trials", "*.parquet").replace(os.sep, "/")
    n, d = con.execute(
        f"SELECT COUNT(*), COUNT(DISTINCT nct_id) FROM read_parquet('{p}')"
    ).fetchone()
    assert n == d, f"{n - d} duplicate trial rows in the store"


@pytest.mark.skipif(not _store_ready(), reason="store not extracted yet")
def test_every_row_carries_provenance(con):
    """The evidence contract: no datum without a source."""
    p = os.path.join(C.STORE, "trials", "*.parquet").replace(os.sep, "/")
    bad = con.execute(f"""
        SELECT COUNT(*) FROM read_parquet('{p}')
        WHERE source_tier IS NULL OR locator IS NULL
           OR aact_snapshot IS NULL OR extracted_at IS NULL
           OR locator NOT LIKE 'https://clinicaltrials.gov/study/NCT%'
    """).fetchone()[0]
    assert bad == 0, f"{bad} trial rows lack complete provenance"


@pytest.mark.skipif(not _store_ready(), reason="store not extracted yet")
def test_universe_is_randomised_interventional_only(con):
    p = os.path.join(C.STORE, "trials", "*.parquet").replace(os.sep, "/")
    bad = con.execute(f"""
        SELECT COUNT(*) FROM read_parquet('{p}')
        WHERE study_type <> 'INTERVENTIONAL' OR allocation <> 'RANDOMIZED'
    """).fetchone()[0]
    assert bad == 0, f"{bad} non-RCT rows leaked into the universe"


@pytest.mark.skipif(not _store_ready("trial_results"), reason="store not extracted")
def test_results_are_keyed_by_result_group_id(con):
    """Unresolvable arms are recorded as unresolved, never silently dropped."""
    p = os.path.join(C.STORE, "trial_results", "*.parquet").replace(os.sep, "/")
    cols = [r[0] for r in con.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{p}')").fetchall()]
    assert "result_group_id" in cols and "group_resolved" in cols
    # Resolution should be near-total; a collapse means the FK join broke.
    rate = con.execute(f"""
        SELECT AVG(CASE WHEN group_resolved THEN 1.0 ELSE 0.0 END)
        FROM read_parquet('{p}')""").fetchone()[0]
    assert rate > 0.99, f"arm resolution rate {rate:.4f} — FK join likely broken"
