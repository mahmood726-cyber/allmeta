import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hub" / "shared" / "tests"))
from _r_parity import assert_r_parity  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_meta_regression_matches_metafor_rma_with_mods():
    # Cycle 7.11: R script switched to method='PM' + test='knha' to match the
    # JS engine (Paule-Mandel + HKSJ).  Previous REML expected dict was
    # numerically inapplicable to the engine.
    expected = {
        "intercept":       -95.650381993419,
        "intercept_se":      5.683654437232,
        "intercept_pval":    7.307363425989e-05,
        "intercept_ci_lb": -111.430736535306,
        "intercept_ci_ub":  -79.870027451531,
        "slope":              0.04763457921955,
        "slope_se":           0.002817227795757,
        "slope_pval":         7.172817611346e-05,
        "slope_ci_lb":        0.03981270089579,
        "slope_ci_ub":        0.05545645754331,
        "tau2":               0,
        "R2":               100,
        "QM":               285.891166819601,
        "QMp":                7.172817611346e-05,
        "k":                  6,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "mr-tiny.R",
        fixture_csv=FIX / "mr-tiny.csv",
        tol=1e-6,
    )
