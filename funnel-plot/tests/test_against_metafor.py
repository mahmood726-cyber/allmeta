import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hub" / "shared" / "tests"))
from _r_parity import assert_r_parity  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_funnel_plot_matches_metafor_regtest():
    expected = {
        "egger_zval": 0.5174702534207,
        "egger_pval": 0.6048279289181,
        "egger_slope": 0.02261401813126,
        "egger_slope_se": 0.2018146880716,
        "pool_b": 0.1213967993407,
        "pool_se": 0.05289342302168,
        "k": 8,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "funnel-tiny.R",
        fixture_csv=FIX / "funnel-tiny.csv",
        tol=1e-6,
    )
