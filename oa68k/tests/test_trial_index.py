"""Contract tests for the shippable per-trial index.

The one invariant that matters: THE TRIAL IS THE UNIT. A trial recurs across many
papers, so a naive trials-to-papers join fans out and counts a trial once per
paper reporting it. The index collapses the paper side per trial BEFORE joining;
these tests assert the result really is one row per trial and that the layer flags
mean what they say.

Run:  python -m pytest tests/test_trial_index.py -v
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config as C
import trial_index

IDX = os.path.join(trial_index.INDEX_DIR, "trial_index.parquet")
pytestmark = pytest.mark.skipif(not os.path.isfile(IDX),
                                reason="trial index not built on this node")


@pytest.fixture(scope="module")
def con():
    import duckdb
    return duckdb.connect()


def _I() -> str:
    return f"read_parquet('{IDX.replace(os.sep, '/')}')"


def test_one_row_per_trial(con):
    n, d = con.execute(
        f"SELECT COUNT(*), COUNT(DISTINCT nct_id) FROM {_I()}").fetchone()
    assert n == d, (
        f"{n - d} duplicate trials — the paper join fanned out. A trial with 7 "
        f"reporting papers must be 1 row, not 7.")


def test_every_row_has_registry_layer_and_provenance(con):
    bad = con.execute(f"""
        SELECT COUNT(*) FROM {_I()}
        WHERE NOT layer1_registry OR locator IS NULL OR aact_snapshot IS NULL
           OR locator NOT LIKE 'https://clinicaltrials.gov/study/NCT%'
    """).fetchone()[0]
    assert bad == 0, f"{bad} index rows lack the registry layer or provenance"


def test_cached_fulltext_implies_oa_fulltext_available(con):
    """You cannot have harvested an OA full text that was never flagged OA.

    A violation means the availability flag and the harvest ledger disagree —
    i.e. one of them is lying about the same paper.
    """
    bad = con.execute(f"""
        SELECT COUNT(*) FROM {_I()}
        WHERE fulltext_cached AND NOT layer3_oa_fulltext
    """).fetchone()[0]
    assert bad == 0, f"{bad} trials claim cached full text without an OA flag"


def test_availability_is_not_acquisition(con):
    """layer3 (OA and in PMC) must be >= fulltext_cached (actually harvested).

    Guards the specific over-claim of reporting 'we have the full text' for
    papers that are merely open somewhere.
    """
    l3, cached = con.execute(f"""
        SELECT SUM(CAST(layer3_oa_fulltext AS INT)),
               SUM(CAST(fulltext_cached AS INT)) FROM {_I()}""").fetchone()
    assert cached <= l3, f"cached {cached} > available {l3} — impossible"


def test_layers_are_consistent_with_paper_links(con):
    """No trial can have an abstract/OA layer without a reporting paper."""
    bad = con.execute(f"""
        SELECT COUNT(*) FROM {_I()}
        WHERE n_reporting_papers = 0 AND (layer2_abstract OR layer3_oa_fulltext)
    """).fetchone()[0]
    assert bad == 0, f"{bad} trials carry a paper layer with no reporting paper"


def test_completeness_is_bounded_and_ordinal(con):
    lo, hi = con.execute(
        f"SELECT MIN(data_completeness), MAX(data_completeness) FROM {_I()}"
    ).fetchone()
    assert lo >= 1, "every row has the registry layer, so the floor is 1"
    assert hi <= 4, "completeness counts 4 layers at most"


def test_registry_results_matches_the_trials_table(con):
    """The index must not drift from its source."""
    t = os.path.join(C.STORE, "trials", "*.parquet").replace(os.sep, "/")
    a = con.execute(f"SELECT SUM(CAST(results_posted AS INT)) FROM "
                    f"read_parquet('{t}')").fetchone()[0]
    b = con.execute(f"SELECT SUM(CAST(registry_results AS INT)) FROM {_I()}"
                    ).fetchone()[0]
    assert a == b, f"index says {b} trials with results, store says {a}"
