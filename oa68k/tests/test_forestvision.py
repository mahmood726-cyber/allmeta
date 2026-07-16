"""Tests for the forest-vision layer.

The governing discipline: a gate that cannot FAIL is verification theater. So
every check here is exercised RED (a known-bad input must be caught) as well as
GREEN. The arithmetic checker is the thing we will point at when we claim an
accuracy number, so it has to be shown to bite.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import figscan
import forestvision as FV
import refmatch as RM


# ---------------------------------------------------------------- figscan

def test_fig_count_is_not_a_figure():
    """The bug this whole module was written around.

    `re.search(r'<fig\\b', xml)` matches `<fig-count count="2"/>` because \\b sits
    between "fig" and the hyphen. An article with zero figures then reports one.
    scan_xml must match the tag exactly and find nothing here.
    """
    xml = (b'<article><front><article-meta><counts>'
           b'<fig-count count="2"/><table-count count="4"/>'
           b'</counts></article-meta></front><body><p>No figures.</p></body></article>')
    assert figscan.scan_xml("PMC1", xml) == []


def test_finds_real_fig_with_asset_and_caption():
    xml = ('<article xmlns:xlink="http://www.w3.org/1999/xlink"><body>'
           '<fig id="f1"><label>Figure 2</label>'
           '<caption><title>Forest plot of mortality.</title></caption>'
           '<graphic xlink:href="art-f2.jpg"/></fig></body></article>').encode()
    got = figscan.scan_xml("PMC9", xml)
    assert len(got) == 1
    f = got[0]
    assert f["kind"] == "forest"
    assert f["graphic_hrefs"] == ["art-f2.jpg"]
    assert f["assets"] == ["https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9/bin/art-f2.jpg"]
    assert f["retrievable"] is True


def test_classifier_refuses_funnel_and_prisma():
    assert figscan.classify("Funnel plot of the pooled odds ratio.", "Fig 4")[0] \
        == "not_forest"
    assert figscan.classify("PRISMA flow diagram of study selection.", "Fig 1")[0] \
        == "not_forest"
    assert figscan.classify("SROC curve for sensitivity and specificity.", "Fig 3")[0] \
        == "not_forest"


def test_explicit_forest_naming_beats_cooccurring_negative_word():
    """'Forest plot ... risk of bias' is still a forest plot."""
    assert figscan.classify(
        "Forest plot of RR for mortality, with risk of bias assessment.", "Fig 2"
    )[0] == "forest"


def test_empty_caption_is_unknown_not_not_forest():
    """Absence of evidence is not evidence of absence — and conflating the two
    would silently understate coverage."""
    assert figscan.classify("", "")[0] == "unknown"
    assert figscan.classify("", "Fig 7")[0] == "unknown"


# ---------------------------------------------------------------- refmatch

def test_parse_label_shapes():
    assert RM.parse_label("Pots 2016")[:2] == ("pots", "2016")
    assert RM.parse_label("Ahmad Othman 2023")[:2] == ("ahmad othman", "2023")
    assert RM.parse_label("van der Berg 2011")[:2] == ("van der berg", "2011")
    assert RM.parse_label("O'Brien 2015")[:2] == ("obrien", "2015")
    assert RM.parse_label("Smith et al. 2016a")[:2] == ("smith", "2016")
    assert RM.parse_label("Smith 2016a")[2] == "a"
    assert RM.parse_label("Total (95% CI)") is None


def test_match_is_ambiguous_not_guessed():
    """Two refs, same surname+year -> must NOT pick one. Guessing here would
    silently corrupt the accuracy denominator with wrong ground truth."""
    refs = [{"pmid": "1", "surname_keys": ["hayes"], "year": "2011"},
            {"pmid": "2", "surname_keys": ["hayes"], "year": "2011"}]
    assert RM.match_label("Hayes 2011", refs)["status"] == "ambiguous"


def test_match_does_not_prefix_collide():
    """'Wang' must not match 'Wangchuk' — substring matching would."""
    refs = [{"pmid": "1", "surname_keys": ["wangchuk"], "year": "2019"}]
    assert RM.match_label("Wang 2019", refs)["status"] == "unmatched"


def test_year_slack_only_when_exact_fails():
    exact = [{"pmid": "1", "surname_keys": ["pots"], "year": "2016"},
             {"pmid": "2", "surname_keys": ["pots"], "year": "2015"}]
    # Exact year 2016 resolves uniquely even though 2015 is within slack.
    assert RM.match_label("Pots 2016", exact) == {"status": "matched",
                                                  "pmid": "1", "n_candidates": 1}
    # No exact -> slack finds the neighbour.
    assert RM.match_label("Pots 2017", [exact[0]])["pmid"] == "1"


# ------------------------------------------------------- arithmetic checker

def _row(**kw):
    base = {"label": "S", "row_type": "study", "confidence": "high"}
    base.update(kw)
    return base


def test_consistent_or_row_passes():
    # 2x2: 20/100 vs 10/100 -> OR = (20*90)/(80*10) = 2.25
    r = _row(events_t=20, n_t=100, events_c=10, n_c=100,
             effect=2.25, ci_low=1.0, ci_high=5.06)
    assert FV.check_row(r, "OR")["status"] == "arith_ok"


def test_misread_digit_is_CAUGHT():
    """RED test — the checker must bite. Events misread 20 -> 70; the printed
    effect (2.25, correct) no longer matches the counts."""
    r = _row(events_t=70, n_t=100, events_c=10, n_c=100,
             effect=2.25, ci_low=1.0, ci_high=5.06)
    out = FV.check_row(r, "OR")
    assert out["status"] == "arith_fail", out


def test_rr_consistency():
    # 30/150 vs 45/150 -> RR = 0.2/0.3 = 0.667
    r = _row(events_t=30, n_t=150, events_c=45, n_c=150,
             effect=0.67, ci_low=0.44, ci_high=1.01)
    assert FV.check_row(r, "RR")["status"] == "arith_ok"


def test_impossible_cell_is_not_computable():
    """events > N is arithmetically impossible; the checker must not 'succeed'."""
    r = _row(events_t=120, n_t=100, events_c=10, n_c=100, effect=2.0)
    assert FV.check_row(r, "OR")["status"] == "arith_na"


def test_zero_cell_uses_correction_only_when_a_cell_is_zero():
    """0.5 applied unconditionally biases OR toward 1 (standing stats rule).

    The printed values here are DERIVED, not eyeballed: 0/50 vs 8/50 with the 0.5
    correction gives OR = (0.5*42.5)/(50.5*8.5) = 0.0495, 95% CI 0.0028-0.883.
    An earlier draft of this test asserted a hand-invented 0.06 and the checker
    failed it — correctly, since 0.06 is 0.192 away on the log scale, past the
    0.15 tolerance. The fixture was wrong; the checker was right. Recorded here
    because "the test only passes after I changed the number" is exactly the
    situation that demands the source of the number be stated.
    """
    zero = _row(events_t=0, n_t=50, events_c=8, n_c=50, effect=0.0495,
                ci_low=0.0028, ci_high=0.883)
    assert FV.check_row(zero, "OR")["status"] == "arith_ok"
    # Non-zero row must be computed WITHOUT the correction: if 0.5 were added
    # here, OR would shift and this exact-value assertion would fail.
    rc = FV.recompute_dichotomous(
        _row(events_t=20, n_t=100, events_c=10, n_c=100), "OR")
    assert abs(rc["est"] - 2.25) < 1e-9


def test_non_study_rows_are_not_checked():
    for rt in ("subgroup_header", "subtotal", "total", "heterogeneity"):
        assert FV.check_row(_row(row_type=rt, effect=1.0), "OR")["status"] \
            == "arith_na"


def test_na_is_not_folded_into_ok():
    """A row with no counts must be arith_na, never arith_ok — otherwise an
    extractor that returns nothing would score 100% accurate."""
    assert FV.check_row(_row(effect=1.5), "OR")["status"] == "arith_na"


# ------------------------------------------------------- structural checker

def test_total_mismatch_catches_a_subtotal_misread_as_a_study():
    """The failure mode that inflates a corpus: a 'Subtotal' diamond typed as a
    study. Its N then double-counts and the printed Total no longer reconciles."""
    doc = {"effect_measure": "OR", "figure_kind": "forest_dichotomous", "rows": [
        _row(label="A", events_t=5, n_t=50, events_c=4, n_c=50),
        _row(label="B", events_t=6, n_t=50, events_c=5, n_c=50),
        _row(label="Subtotal (95% CI)", n_t=100, n_c=100),   # <- misclassified
        {"label": "Total (95% CI)", "row_type": "total", "n_t": 100, "n_c": 100},
    ]}
    out = FV.check_extraction(doc)
    assert any("MISMATCH" in s.get("verdict", "") for s in out["structural"]), out


def test_total_reconciles_when_rows_are_correct():
    doc = {"effect_measure": "OR", "figure_kind": "forest_dichotomous", "rows": [
        _row(label="A", events_t=5, n_t=50, events_c=4, n_c=50),
        _row(label="B", events_t=6, n_t=50, events_c=5, n_c=50),
        {"label": "Subtotal (95% CI)", "row_type": "subtotal", "n_t": 100,
         "n_c": 100},
        {"label": "Total (95% CI)", "row_type": "total", "n_t": 100, "n_c": 100},
    ]}
    out = FV.check_extraction(doc)
    assert all(s["verdict"] == "ok" for s in out["structural"])
    assert out["n_studies"] == 2
