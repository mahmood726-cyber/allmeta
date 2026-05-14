"""R-parity test: multilevel-ma engine vs the same iterative MoM algorithm in R.

The JS engine (multilevel-ma/index.html) implements a three-level
random-effects model via iterated method-of-moments (Cheung 2014 /
Raudenbush style) — explicitly NOT REML. The R script mlma-tiny.R
replicates the same MoM algorithm so this test asserts genuine
JS<->R numeric equivalence (not metafor::rma.mv REML, which would
give different variance components).

Values captured from a single Rscript run on mlma-tiny.csv (2026-05-14):
  {"mu":0.3130836394161561,
   "seMu":0.06607061847114695,
   "seMuHK":0.08340805896106201,
   "tau2_study":0.01266049129297928,
   "tau2_within":0,
   "ci_lb_z":0.1835852272127081,
   "ci_ub_z":0.4425820516196042,
   "k":6,
   "J":3}

Input: 6 rows (3 studies x 2 effects each), columns: study,effect,SE,label.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hub" / "shared" / "tests"))
from _r_parity import assert_r_parity  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_mlma_mom_pooled_mean_matches_r():
    """Pooled mean mu: JS MoM engine vs R MoM replication."""
    expected = {
        # Captured from R (mlma-tiny.R on mlma-tiny.csv, 2026-05-14)
        "mu":          0.3130836394161561,
        "seMu":        0.06607061847114695,
        "seMuHK":      0.08340805896106201,
        "tau2_study":  0.01266049129297928,
        "tau2_within": 0.0,
        "ci_lb_z":     0.1835852272127081,
        "ci_ub_z":     0.4425820516196042,
        "k":           6,
        "J":           3,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "mlma-tiny.R",
        fixture_csv=FIX / "mlma-tiny.csv",
        tol=1e-6,
    )
