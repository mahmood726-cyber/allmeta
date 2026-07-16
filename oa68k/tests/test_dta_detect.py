"""Tests for the precision-first DTA 2x2 detector.

The negative cases are not invented: every one is a real table shape harvested
from the MeSH "Sensitivity and Specificity" corpus, which is why the corpus is a
candidate set rather than a DTA set. If the detector ever flags one of these, it
is producing fabricated 2x2s and the precision-first contract is broken.

Run:  python -m pytest tests/test_dta_detect.py -v
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dta_detect import classify_table


# ------------------------------------------------------------ true positives
def test_explicit_tp_fp_fn_tn_counts():
    v = classify_table(["Study", "TP", "FP", "FN", "TN"], "Accuracy of RDT")
    assert v["is_dta_2x2"] is True
    assert v["kind"] == "explicit_counts"


def test_spelled_out_counts():
    v = classify_table(
        ["Test", "True Positives", "False Positives", "False Negatives",
         "True Negatives"], "Diagnostic performance")
    assert v["is_dta_2x2"] is True and v["kind"] == "explicit_counts"


def test_three_of_four_cells_is_enough():
    """A 2x2 with a margin total often names only three cells explicitly."""
    v = classify_table(["Assay", "TP", "FN", "TN", "Total"], "")
    assert v["is_dta_2x2"] is True


def test_sens_spec_pair_with_n_is_recoverable():
    v = classify_table(["Test", "N", "Sensitivity (%)", "Specificity (%)"],
                       "Accuracy against culture")
    assert v["is_dta_2x2"] is True
    assert v["kind"] == "sens_spec"
    assert v["recoverable_2x2"] is True


def test_sens_spec_without_n_is_flagged_but_not_recoverable():
    """sens/spec alone cannot be back-computed to counts — record that."""
    v = classify_table(["Test", "Sensitivity", "Specificity"], "Performance")
    assert v["is_dta_2x2"] is True
    assert v["recoverable_2x2"] is False


# ------------------------------------------- real observed false-positive risks
def test_search_strategy_table_is_rejected():
    """Observed live: 'Search strategy on MEDLINE and EMBASE'."""
    v = classify_table(["Set", "Search Term"], "Search strategy on MEDLINE and EMBASE")
    assert v["is_dta_2x2"] is False
    assert v["rejected_by"].startswith("negative_guard")


def test_hit_count_table_is_rejected():
    """Observed live: 'No. of hits/abstracts reviewed | No. of papers included'."""
    v = classify_table(
        ["Search", "Search terms", "No. of hits/ abstracts reviewed",
         "No. of papers included"], "Summary of the main search terms and results")
    assert v["is_dta_2x2"] is False


def test_genome_statistics_table_is_rejected():
    """Observed live: VirGen growth statistics."""
    v = classify_table(["Sr. No", "Release", "No. of families", "No. of genomes"],
                       "Growth statistics of VirGen.")
    assert v["is_dta_2x2"] is False


def test_binding_pocket_table_is_rejected():
    """Observed live: JEV/DEN-2 binding-pocket residues."""
    v = classify_table(["Binding pocket", "JEV", "DEN2"],
                       "Residues in the binding pocket of NS3 of JEV and DEN-2.")
    assert v["is_dta_2x2"] is False


def test_train_test_split_is_rejected():
    """The 80/20 trap detect3 measured: split ratios are not 2x2 cells."""
    v = classify_table(["Model", "Training set", "Test set", "AUC"],
                       "Model development")
    assert v["is_dta_2x2"] is False


def test_baseline_characteristics_is_rejected():
    v = classify_table(["Characteristics", "Vaccine (n=20)", "Control (n=20)"],
                       "Baseline Characteristics")
    assert v["is_dta_2x2"] is False


def test_headerless_table_declines_rather_than_guesses():
    """No column semantics => decline. Absence of evidence, not evidence."""
    v = classify_table([], "Table 2")
    assert v["is_dta_2x2"] is False
    assert v["rejected_by"] == "no_headers"


def test_negative_guard_beats_positive_match():
    """Precision-first: a search-strategy table that happens to say 'sensitivity'
    of the search is still not a DTA 2x2."""
    v = classify_table(["Search terms", "Sensitivity", "Specificity"],
                       "Search strategy sensitivity on MEDLINE")
    assert v["is_dta_2x2"] is False
    assert v["rejected_by"].startswith("negative_guard")


def test_plain_numbers_are_not_evidence():
    """Digits alone never flag — a number means what its column says."""
    v = classify_table(["Group", "Value", "Count"], "Results")
    assert v["is_dta_2x2"] is False
    assert v["rejected_by"] == "no_positive_column_evidence"


def test_classify_never_raises_on_junk():
    for args in ([None], [""], ["  "]):
        assert classify_table(args, "") ["is_dta_2x2"] in (True, False)
