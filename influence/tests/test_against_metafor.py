"""R-parity test: influence engine (REML LOO) vs metafor::leave1out(rma.uni()).

The fixture inf-tiny.csv has 5 studies with one strong outlier (Epsilon yi=0.80).
We compare:
  - The overall REML pooled estimate (b, se, tau2, I2, Q, k).
  - LOO row 1 (Alpha dropped): estimate, se, ci.lb, ci.ub, tau2, Q, I2.

Values captured from a single Rscript run on inf-tiny.csv (2026-05-13):
  {"b":0.2282308054465,"se":0.1606687989381,"ci.lb":-0.08667425391148,
   "ci.ub":0.5431358648046,"tau2":0.1029364619671,"I2":80.471537211099,
   "Q":23.286444141689,"QEp":0.0001109866311559,"k":5,
   "loo1_estimate":0.232349108847,"loo1_se":0.2013577851329,
   "loo1_ci.lb":-0.1623048980203,"loo1_ci.ub":0.6270031157142,
   "loo1_tau2":0.1390622375901,"loo1_Q":23.155279503106,"loo1_I2":85.998624491028}
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hub" / "shared" / "tests"))
from _r_parity import assert_r_parity  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_influence_matches_metafor_rma_uni_reml_overall():
    expected = {
        "b":    0.2282308054465,
        "se":   0.1606687989381,
        "ci.lb": -0.08667425391148,
        "ci.ub":  0.5431358648046,
        "tau2": 0.1029364619671,
        "I2":   80.471537211099,
        "Q":    23.286444141689,
        "QEp":  0.0001109866311559,
        "k":    5,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "inf-tiny.R",
        fixture_csv=FIX / "inf-tiny.csv",
        tol=1e-6,
    )


def test_influence_loo_row1_matches_metafor_leave1out():
    """LOO row 1 = Alpha dropped: compare estimate, se, tau2, Q, I2."""
    expected = {
        "loo1_estimate": 0.232349108847,
        "loo1_se":       0.2013577851329,
        "loo1_ci.lb":   -0.1623048980203,
        "loo1_ci.ub":    0.6270031157142,
        "loo1_tau2":     0.1390622375901,
        "loo1_Q":        23.155279503106,
        "loo1_I2":       85.998624491028,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "inf-tiny.R",
        fixture_csv=FIX / "inf-tiny.csv",
        tol=1e-6,
    )
