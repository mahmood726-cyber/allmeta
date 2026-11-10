import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hub" / "shared" / "tests"))
from _r_parity import assert_r_parity  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_meta_regression_matches_metafor_rma_with_mods():
    _assert_page_parity("mr-tiny.csv")


def test_meta_regression_positive_heterogeneity_matches_metafor():
    _assert_page_parity("mr-heterogeneous.csv")


def _assert_page_parity(fixture_name):
    # Execute the page engine and results adapter for this input on every run.
    proc = subprocess.run(
        ["node", str(Path(__file__).with_name("page-result.mjs")), str(FIX / fixture_name)],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
    )
    assert proc.returncode == 0, proc.stderr
    assert_r_parity(
        json.loads(proc.stdout),
        r_script=FIX / "mr-tiny.R",
        fixture_csv=FIX / fixture_name,
        tol=1e-6,
    )


def test_historical_pm_knha_constants_match_metafor():
    # Preserve the original 15 constants and tolerance as a historical R check.
    # PM/knha does not describe the page's floored KH uncertainty.
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
        r_script=FIX / "mr-tiny-knha.R",
        fixture_csv=FIX / "mr-tiny.csv",
        tol=1e-6,
    )
