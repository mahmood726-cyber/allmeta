"""Cohort classification + transportability covariate contracts.

Two classes of bug these encode, both of which bit for real:

1. Cohort false positives. A regex that over-matches inflates exactly the
   population we exist to report honestly about. `\\bart\\b` for antiretroviral
   would hit "art" and ART=assisted reproductive technology; `%male%` matches
   FEMALE.
2. Reading the wrong AACT column. For Sex baseline measures the Female/Male split
   lives in `category`, NOT `classification`. Keying on classification found 843
   trials instead of 45,289 — a 54x undercount that reads as "the registry rarely
   reports sex" rather than as a bug. Nothing in a schema tells you this; only a
   count that looks wrong does.

Run:  python -m pytest tests/test_cohorts_transport.py -v
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config as C
import cohorts


# ------------------------------------------------------- cohort classification
def test_malaria_tb_hiv_classify():
    assert cohorts.classify("Malaria, Falciparum")["malaria"]
    assert cohorts.classify("Plasmodium vivax infection")["malaria"]
    assert cohorts.classify("Pulmonary Tuberculosis")["tb"]
    assert cohorts.classify("MDR-TB")["tb"]
    assert cohorts.classify("HIV Infections")["hiv"]
    assert cohorts.classify("Antiretroviral therapy naive")["hiv"]


def test_ncd_is_first_class_and_subgrouped():
    assert cohorts.classify("Hypertension")["ncd_cardiometabolic"]
    assert cohorts.classify("Heart Failure With Reduced Ejection Fraction")[
        "ncd_cardiometabolic"]
    assert cohorts.classify("Type 2 Diabetes Mellitus")["ncd_cardiometabolic"]
    assert cohorts.classify("Rheumatic Heart Disease")["ncd_cardiometabolic"]
    assert cohorts.classify("Chronic Kidney Disease")["ncd_kidney"]
    assert cohorts.classify("Breast Carcinoma")["ncd_cancer"]
    assert cohorts.classify("COPD")["ncd_respiratory"]
    for s in ["Hypertension", "Chronic Kidney Disease", "Breast Carcinoma",
              "COPD"]:
        assert cohorts.classify(s)["ncd_any"], s


def test_art_does_not_false_positive_hiv():
    """`\\bart\\b` would match ordinary prose and assisted reproductive tech."""
    assert not cohorts.classify("Art therapy for anxiety")["hiv"]
    assert not cohorts.classify("Assisted Reproductive Technology (ART)")["hiv"]


def test_tb_word_boundary():
    """`tb` unbounded matches 'tbi' (traumatic brain injury)."""
    assert not cohorts.classify("Traumatic Brain Injury (TBI)")["tb"]


def test_comorbid_trial_is_multi_label_not_forced_single():
    """HIV-associated cardiomyopathy is BOTH — and that overlap IS the Ugandan
    comorbidity picture. Forcing one label would erase it."""
    f = cohorts.classify("HIV-associated cardiomyopathy and heart failure")
    assert f["hiv"] and f["ncd_cardiometabolic"] and f["ncd_any"]


def test_unrelated_condition_matches_nothing():
    f = cohorts.classify("Seasonal Allergic Rhinitis")
    assert not f["priority_any"]


def test_empty_input_is_safe():
    for v in (None, "", "   "):
        assert cohorts.classify(v)["priority_any"] is False


# ------------------------------------------------- the category/classification trap
@pytest.mark.skipif(C.ext_table("baseline_measurements") is None,
                    reason="baseline_measurements not converted on this node")
def test_sex_split_lives_in_category_not_classification():
    """Guards the 54x undercount. If a future snapshot moves the split back to
    `classification`, this fails and transport.py must be re-read."""
    import duckdb
    con = duckdb.connect()
    B = f"read_parquet('{C.ext_table('baseline_measurements').replace(os.sep,'/')}')"
    cat = con.execute(f"SELECT COUNT(*) FROM {B} WHERE title ILIKE 'sex%' "
                      f"AND lower(category) IN ('female','male')").fetchone()[0]
    cls = con.execute(f"SELECT COUNT(*) FROM {B} WHERE title ILIKE 'sex%' "
                      f"AND lower(classification) IN ('female','male')").fetchone()[0]
    assert cat > cls * 10, (
        f"Sex split moved: category={cat}, classification={cls}. transport.py "
        f"reads `category` first — re-verify before trusting its sex counts.")


@pytest.mark.skipif(C.ext_table("baseline_measurements") is None,
                    reason="baseline_measurements not converted on this node")
def test_region_of_enrollment_country_lives_in_classification():
    """Region is the mirror image of Sex — country is in `classification`.
    The two fields disagree on which column means what, which is exactly why
    each is verified rather than assumed."""
    import duckdb
    con = duckdb.connect()
    B = f"read_parquet('{C.ext_table('baseline_measurements').replace(os.sep,'/')}')"
    n = con.execute(f"SELECT COUNT(*) FROM {B} "
                    f"WHERE title ILIKE '%region of enrollment%' "
                    f"AND classification = 'United States'").fetchone()[0]
    assert n > 1000, "Region country no longer in `classification` — re-read transport.py"


# ---------------------------------------------------------- emitted transport
def _ready() -> bool:
    import transport
    return os.path.isfile(os.path.join(transport.TRANSPORT_DIR,
                                       "trial_transport.parquet"))


@pytest.mark.skipif(not _ready(), reason="transport not built")
def test_transport_is_one_row_per_trial_and_never_imputes():
    import duckdb
    import transport
    p = os.path.join(transport.TRANSPORT_DIR,
                     "trial_transport.parquet").replace(os.sep, "/")
    con = duckdb.connect()
    n, d = con.execute(f"SELECT COUNT(*), COUNT(DISTINCT study_id) FROM "
                       f"read_parquet('{p}')").fetchone()
    assert n == d, "transport fanned out — the unit is the trial"
    # A trial with no posted Region must be NULL, never 0 — 0% African enrolment
    # and "never said" are different claims, and conflating them would invent
    # evidence of Western-only enrolment.
    bad = con.execute(f"""SELECT COUNT(*) FROM read_parquet('{p}')
        WHERE NOT has_region_of_enrollment
          AND cov_pct_enrolled_africa IS NOT NULL""").fetchone()[0]
    assert bad == 0, f"{bad} trials have an enrolment % without a posted region"


@pytest.mark.skipif(not _ready(), reason="transport not built")
def test_pct_fields_are_proportions_not_percentages():
    import duckdb
    import transport
    p = os.path.join(transport.TRANSPORT_DIR,
                     "trial_transport.parquet").replace(os.sep, "/")
    con = duckdb.connect()
    bad = con.execute(f"""SELECT COUNT(*) FROM read_parquet('{p}')
        WHERE cov_pct_enrolled_africa > 1.0001
           OR cov_pct_female > 1.0001""").fetchone()[0]
    assert bad == 0, "proportion field exceeds 1 — unit confusion"
