import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hub" / "shared" / "tests"))
from _r_parity import assert_r_parity  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_meta_regression_matches_metafor_rma_with_mods():
    expected = {
        "intercept": -95.650381993419,
        "intercept_se": 36.435392614584,
        "intercept_pval": 0.008659676241486,
        "slope": 0.04763457921955,
        "slope_se": 0.01806000029677,
        "slope_pval": 0.008350151395385,
        "R2": 100,  # metafor returns R2 as percentage; 100 = full model variance explained
        "QM": 6.95679426782,
        "QMp": 0.008350151395385,
        "k": 6,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "mr-tiny.R",
        fixture_csv=FIX / "mr-tiny.csv",
        tol=1e-6,
    )
