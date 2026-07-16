"""Contract tests against the bias-adjusted-nma-adv data contract.

The engine is a separate repo (Codex's build) and is NOT imported or touched
here. These tests assert that what we EMIT matches the contract documented in
BIAS-ADJUSTED-NMA-ADV-BRIEF.md, so a schema drift on our side is caught here
rather than at integration time:

    StudyRecord(study_id, design in {"rct","nrs","other"}, rob_weight in (0,1],
                covariates: dict[str,float])
    ArmRecord(study_id, arm_id, treatment_id, n)
    OutcomeADRecord(study_id, arm_id, outcome_id,
                    measure_type in {"binary","continuous"}, value, se)

Run:  python -m pytest tests/test_nma_export.py -v
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import nma_export as N


# Tests read the priority-cohort export: it is the one that always exists (the
# --all build is long), and the schema contract is identical for both.
COHORT = "p0_malaria_tb_hiv"


def _p(name: str) -> str:
    return os.path.join(N.export_dir(COHORT), f"{name}.parquet")


def _ready(name: str) -> bool:
    return os.path.isfile(_p(name))


@pytest.fixture(scope="module")
def con():
    import duckdb
    return duckdb.connect()


def T(name: str) -> str:
    return f"read_parquet('{_p(name).replace(os.sep, '/')}')"


# ------------------------------------------------- treatment normalisation
def test_dose_and_route_are_stripped_from_the_node_key():
    """Dose belongs on the arm, not in the node id, or every dose is its own
    treatment and the network shatters."""
    a, _ = N.normalize_treatment("Pazopanib 800 mg oral daily")
    b, _ = N.normalize_treatment("Pazopanib")
    assert a == b == "pazopanib"
    assert N.treatment_id(a) == N.treatment_id(b)


def test_control_arms_are_detected_as_common_comparators():
    for s in ["Placebo", "Placebo Comparator: saline", "Standard of Care",
              "Sham procedure", "Usual care", "No Treatment"]:
        _, ctrl = N.normalize_treatment(s)
        assert ctrl is True, f"{s!r} should be flagged a common comparator"


def test_active_drug_is_not_flagged_as_control():
    for s in ["Pazopanib", "Artemether-Lumefantrine", "Dapivirine Vaginal Ring"]:
        _, ctrl = N.normalize_treatment(s)
        assert ctrl is False, f"{s!r} must not be flagged a control"


def test_treatment_id_is_stable_across_runs():
    """A content hash, not a row number — an id that changes between runs is
    not a crosswalk."""
    assert N.treatment_id("artesunate") == N.treatment_id("artesunate")
    assert N.treatment_id("artesunate") != N.treatment_id("artemether")


def test_empty_label_does_not_collide_with_a_real_treatment():
    assert N.treatment_id("") == "TRT_UNKNOWN"
    assert N.normalize_treatment(None) == ("", False)


# --------------------------------------------------------- emitted schema
@pytest.mark.skipif(not _ready("nma_studies"), reason="export not built")
def test_studyrecord_fields_and_enums(con):
    cols = {r[0] for r in con.execute(
        f"DESCRIBE SELECT * FROM {T('nma_studies')}").fetchall()}
    for f in ("study_id", "design", "rob_weight"):
        assert f in cols, f"StudyRecord.{f} missing from the export"
    bad = con.execute(f"""
        SELECT COUNT(*) FROM {T('nma_studies')}
        WHERE design NOT IN ('rct','nrs','other')
           OR rob_weight <= 0 OR rob_weight > 1""").fetchone()[0]
    assert bad == 0, "design enum or rob_weight in (0,1] violated"


@pytest.mark.skipif(not _ready("nma_studies"), reason="export not built")
def test_covariates_are_numeric_and_non_null(con):
    """The engine wants dict[str,float]; a NULL covariate would break the
    meta-regression design matrix rather than degrade it."""
    cols = [r[0] for r in con.execute(
        f"DESCRIBE SELECT * FROM {T('nma_studies')}").fetchall()
        if r[0].startswith("cov_")]
    assert cols, "no covariate columns emitted — the +0.154 layer has no input"
    for c in cols:
        if c == "cov_start_year":
            continue          # genuinely absent for some trials; engine may drop
        n = con.execute(f"SELECT COUNT(*) FROM {T('nma_studies')} "
                        f'WHERE "{c}" IS NULL').fetchone()[0]
        assert n == 0, f"covariate {c} has {n} NULLs"


@pytest.mark.skipif(not _ready("nma_studies"), reason="export not built")
def test_rob_weight_is_a_neutral_socket_not_an_invented_value(con):
    """We must never fabricate trust. Until the 68k ledger supplies weights,
    every study is exactly 1.0."""
    d = con.execute(f"SELECT COUNT(DISTINCT rob_weight) FROM {T('nma_studies')}"
                    ).fetchone()[0]
    assert d == 1, "rob_weight varies — weights must come from the 68k ledger"


@pytest.mark.skipif(not _ready("nma_arms"), reason="export not built")
def test_armrecord_has_no_orphans_and_no_null_ids(con):
    orphan = con.execute(f"""
        SELECT COUNT(*) FROM {T('nma_arms')} a
        LEFT JOIN {T('nma_studies')} s ON s.study_id = a.study_id
        WHERE s.study_id IS NULL""").fetchone()[0]
    assert orphan == 0, f"{orphan} arms reference a study not in the export"
    bad = con.execute(f"""SELECT COUNT(*) FROM {T('nma_arms')}
        WHERE arm_id IS NULL OR treatment_id IS NULL""").fetchone()[0]
    assert bad == 0


@pytest.mark.skipif(not _ready("nma_outcomes_ad"), reason="export not built")
def test_measure_type_enum_and_binary_has_no_fabricated_se(con):
    """Binary rows carry events in `value` and take n from ArmRecord — an SE on
    a binary row would be a number the registry never posted."""
    bad = con.execute(f"""
        SELECT COUNT(*) FROM {T('nma_outcomes_ad')}
        WHERE measure_type = 'binary' AND se IS NOT NULL""").fetchone()[0]
    assert bad == 0, f"{bad} binary rows carry an invented SE"


@pytest.mark.skipif(not _ready("nma_outcomes_ad"), reason="export not built")
def test_medians_are_never_coerced_to_continuous(con):
    """Converting MEDIAN/IQR to mean/SE invents a distributional assumption the
    registry never made. They must land in 'unsupported', not 'continuous'."""
    bad = con.execute(f"""
        SELECT COUNT(*) FROM {T('nma_outcomes_ad')}
        WHERE measure_type = 'continuous'
          AND registry_param_type IN ('MEDIAN','COUNT_OF_UNITS')""").fetchone()[0]
    assert bad == 0, f"{bad} median rows were coerced to continuous"


@pytest.mark.skipif(not _ready("nma_outcomes_ad"), reason="export not built")
def test_se_method_is_recorded_for_every_derived_se(con):
    """Provenance applies to derivations too: an SE with no stated derivation is
    an unauditable number."""
    bad = con.execute(f"""
        SELECT COUNT(*) FROM {T('nma_outcomes_ad')}
        WHERE se IS NOT NULL AND (se_method IS NULL OR se_method = '')
    """).fetchone()[0]
    assert bad == 0


@pytest.mark.skipif(not _ready("nma_outcomes_ad"), reason="export not built")
def test_outcome_rows_are_arm_resolved(con):
    """Only result_group_id-resolved rows are exported — an unresolved arm
    cannot be placed in a network."""
    bad = con.execute(f"""
        SELECT COUNT(*) FROM {T('nma_outcomes_ad')} o
        LEFT JOIN {T('nma_arms')} a ON a.arm_id = o.arm_id
                                   AND a.study_id = o.study_id
        WHERE a.arm_id IS NULL""").fetchone()[0]
    assert bad == 0, f"{bad} outcome rows reference an arm not in nma_arms"


# ------------------------------------------------------------- the bias pair
@pytest.mark.skipif(not _ready("nma_bias_inputs"), reason="export not built")
def test_bias_pair_emits_both_sides_not_a_verdict(con):
    cols = {r[0] for r in con.execute(
        f"DESCRIBE SELECT * FROM {T('nma_bias_inputs')}").fetchall()}
    for f in ("registered_primary", "reported_primary", "status"):
        assert f in cols, f"bias input {f} missing (engine stores this trio)"
    # every row must say it is a candidate, never a decided switch
    bad = con.execute(f"""
        SELECT COUNT(*) FROM {T('nma_bias_inputs')}
        WHERE confidence NOT LIKE 'candidate%'""").fetchone()[0]
    assert bad == 0, "bias rows must be labelled candidates for adjudication"


@pytest.mark.skipif(not _ready("nma_bias_inputs"), reason="export not built")
def test_one_bias_row_per_study(con):
    n, d = con.execute(f"SELECT COUNT(*), COUNT(DISTINCT study_id) FROM "
                       f"{T('nma_bias_inputs')}").fetchone()
    assert n == d, "the unit is the trial"


@pytest.mark.skipif(not _ready("nma_treatments"), reason="export not built")
def test_treatment_nodes_are_flagged_for_adjudication(con):
    """We do not have RxNorm/ATC here. Every node must say so rather than imply
    a validated mapping."""
    bad = con.execute(f"SELECT COUNT(*) FROM {T('nma_treatments')} "
                      f"WHERE NOT needs_adjudication").fetchone()[0]
    assert bad == 0
