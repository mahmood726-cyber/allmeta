"""Tests for the forest-plot behavioural record.

The plot is a record of what the authors DID: you cannot hide an inclusion.
These tests pin the extractor and, crucially, the double-count detector's
ability to REFUTE its own false positives.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import behaviour as B


def _fig(rows, **kw):
    f = {"pmcid": "PMC1", "image_path": "x.jpg", "figure_kind": "forest_dichotomous",
         "effect_measure": "RR", "scale": "log", "outcome": None,
         "reading_notes": "", "rows": rows}
    f.update(kw)
    return f


def _study(label, **kw):
    r = {"label": label, "row_type": "study", "subgroup": None,
         "events_t": None, "n_t": None, "events_c": None, "n_c": None,
         "effect": None, "ci_low": None, "ci_high": None,
         "weight_pct": None, "confidence": "high"}
    r.update(kw)
    return r


# --- the inclusion record -------------------------------------------------

def test_year_is_parsed_from_the_label():
    r = B.extract_one(_fig([_study("Ahren, B. 2013")]))
    assert r["trials"][0]["year"] == 2013


def test_missing_year_is_null_never_imputed():
    """A year absent from the label is absent from the PLOT. Do not impute."""
    r = B.extract_one(_fig([_study("None 2014"), _study("Anonymous")]))
    assert r["trials"][1]["year"] is None


def test_year_regex_does_not_match_a_count_or_a_ci():
    """1234 is not a year; 2050 is not a year we accept."""
    r = B.extract_one(_fig([_study("Trial 1234"), _study("Study 2050")]))
    assert [t["year"] for t in r["trials"]] == [None, None]


def test_weights_and_concentration_are_captured():
    """An error in a trial carrying 40% of the weight matters 40x one at 1%."""
    r = B.extract_one(_fig([_study("A", weight_pct=80.0), _study("B", weight_pct=20.0)]))
    assert r["weight_top_pct"] == 80.0
    assert r["weight_sum_pct"] == 100.0
    assert r["n_weighted"] == 2


def test_heterogeneity_is_parsed_from_free_text_both_glyph_forms():
    """Templates print I2/I² and Tau2/Tau². Matching one silently halves yield."""
    uni = {"label": "Heterogeneity: Tau² = 0.25; Chi² = 10.93, df = 4 (P = 0.03); I² = 63%",
           "row_type": "heterogeneity", "subgroup": None}
    asc = {"label": "Heterogeneity: Tau2 = 0.10; Chi2 = 5.0, df = 2 (P = 0.08); I2 = 60%",
           "row_type": "heterogeneity", "subgroup": None}
    r = B.extract_one(_fig([_study("A"), uni, asc]))
    assert r["heterogeneity"][0]["i2_pct"] == 63.0
    assert r["heterogeneity"][0]["tau2"] == 0.25
    assert r["heterogeneity"][0]["df"] == 4.0
    assert r["heterogeneity"][1]["i2_pct"] == 60.0
    assert r["heterogeneity"][1]["tau2"] == 0.10


def test_model_is_null_when_not_printed_never_inferred_from_tau2():
    """Presence of tau2 implies random effects — but implying is not reading."""
    het = {"label": "Heterogeneity: Tau2 = 0.25; I2 = 63%", "row_type": "heterogeneity",
           "subgroup": None}
    r = B.extract_one(_fig([_study("A"), het], reading_notes="no model printed"))
    assert r["model"] is None


def test_model_is_read_when_printed():
    r = B.extract_one(_fig([_study("A")], reading_notes="columns show IV, Random, 95% CI"))
    assert r["model"] and "random" in r["model"]


# --- double-count detector: it must REFUTE its own false positives ---------

def test_double_count_refuted_when_counts_differ():
    """THE REAL FALSE POSITIVE, 2026-07-16: rare-event trials round to the same
    effect by coincidence. PMC12399406 Jabbour (0/231 vs 1/233) and 'None 2014'
    (0/481 vs 1/484) BOTH give RR 0.34 [0.01, 8.21] at weight 1.9 — different
    trials. Matching on (effect, CI, weight) alone flags it. It must not."""
    rows = [_study("Jabbour", events_t=0, n_t=231, events_c=1, n_c=233,
                   effect=0.34, ci_low=0.01, ci_high=8.21, weight_pct=1.9),
            _study("None 2014", events_t=0, n_t=481, events_c=1, n_c=484,
                   effect=0.34, ci_low=0.01, ci_high=8.21, weight_pct=1.9)]
    fig = _fig(rows)
    c = B.double_count_candidates(B.extract_one(fig), rows)
    assert len(c) == 1
    assert c[0]["verdict"] == "REFUTED_different_counts"


def test_double_count_candidate_when_counts_identical_too():
    rows = [_study("Chiu", events_t=5, n_t=50, events_c=9, n_c=50,
                   effect=0.55, ci_low=0.2, ci_high=1.5, weight_pct=3.0),
            _study("Chih-Chiang", events_t=5, n_t=50, events_c=9, n_c=50,
                   effect=0.55, ci_low=0.2, ci_high=1.5, weight_pct=3.0)]
    c = B.double_count_candidates(B.extract_one(_fig(rows)), rows)
    assert c[0]["verdict"] == "CANDIDATE_identical_counts_too"


def test_double_count_unresolved_when_no_counts_exist():
    """Continuous/SMD plots print no counts -> we CANNOT discriminate. Say so.
    Never upgrade an unresolvable case to a finding."""
    rows = [_study("Chiu et al. (2008)", effect=0.1, ci_low=-0.64, ci_high=0.84, weight_pct=2.95),
            _study("Chih-Chiang et al. (2008)", effect=0.1, ci_low=-0.64, ci_high=0.84, weight_pct=2.95)]
    c = B.double_count_candidates(B.extract_one(_fig(rows)), rows)
    assert c[0]["verdict"] == "UNRESOLVED_no_counts_to_discriminate"


def test_same_label_twice_is_not_a_double_count_candidate():
    """One trial legitimately appears in two subgroups. That is non-independence,
    a different (also real) issue — not a hidden double-entry under two names."""
    rows = [_study("Pyle 2016", effect=0.5, ci_low=0.2, ci_high=1.1, weight_pct=5.0, subgroup="A"),
            _study("Pyle 2016", effect=0.5, ci_low=0.2, ci_high=1.1, weight_pct=5.0, subgroup="B")]
    c = B.double_count_candidates(B.extract_one(_fig(rows)), rows)
    assert c == [], "identical LABEL is not a two-name double-entry"


def test_detector_is_silent_on_a_clean_plot():
    rows = [_study("A", effect=0.5, ci_low=0.2, ci_high=1.1, weight_pct=50.0),
            _study("B", effect=0.9, ci_low=0.4, ci_high=1.9, weight_pct=50.0)]
    assert B.double_count_candidates(B.extract_one(_fig(rows)), rows) == []


def test_extractor_never_calls_a_model(monkeypatch):
    """Every behavioural number must be reproducible from disk."""
    src = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "behaviour.py"), encoding="utf-8").read()
    for bad in ("anthropic", "messages.create", "requests.post", "urllib.request"):
        assert bad not in src, "behaviour.py must never make a call: found %r" % bad
