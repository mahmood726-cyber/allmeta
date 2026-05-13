"""R-parity test: heterogeneity engine vs metafor rma.uni(method='REML')."""
import sys
from pathlib import Path

# Reuse the shared helper from hub/shared/tests/_r_parity.py
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hub" / "shared" / "tests"))
from _r_parity import assert_r_parity  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_heterogeneity_matches_metafor_rma_uni_reml():
    expected = {
        # Values captured from a single Rscript run on het-tiny.csv (2026-05-13):
        # {"b":0.04108527131783,"se":0.06819943394705,"ci.lb":-0.0925831629844,
        #  "ci.ub":0.1747537056201,"tau2":0,"I2":0,"Q":2.022080103359,
        #  "QEp":0.7316975563492,"k":5}
        "b": 0.04108527131783,
        "se": 0.06819943394705,
        "ci.lb": -0.0925831629844,
        "ci.ub": 0.1747537056201,
        "tau2": 0.0,
        "I2": 0.0,
        "Q": 2.022080103359,
        "QEp": 0.7316975563492,
        "k": 5,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "het-tiny.R",
        fixture_csv=FIX / "het-tiny.csv",
        tol=1e-6,
    )
