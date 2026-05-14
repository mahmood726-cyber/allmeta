"""R-parity test: proportion-ma logit+PM engine vs the same algorithm in R.

The JS engine (proportion-ma/index.html) implements:
  - Logit transform with Cochrane Handbook §10.4.4 / Sweeting 2004 continuity
    correction (matches metafor::escalc(measure="PLO")).
  - Paule-Mandel (PM) tau2 via iterative reweighting (50 iters, |adj|<1e-8).
  - Back-transform via logit^{-1}(mu_re) = 1/(1+exp(-mu_re)).

The R script (prop-tiny.R) replicates the identical algorithm so this test
asserts genuine JS<->R numeric equivalence (NOT metafor::rma REML).

Values captured from a single Rscript run on prop-tiny.csv (2026-05-14, R 4.5.2):
  {"mu_re":-2.365861008193144,
   "seRE":0.1350315581077194,
   "tau2":0,
   "Q":0.1670466754710336,
   "i2":0,
   "poolP":0.08581328456303973,
   "poolLo":0.0671999729960778,
   "poolHi":0.1089798521337489,
   "k":5}

Input: 5 rows, columns: study,events,total.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hub" / "shared" / "tests"))
from _r_parity import assert_r_parity  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_propma_logit_pm_matches_r():
    """Pooled proportion (logit+PM): JS engine vs R replication."""
    expected = {
        # Captured from R (prop-tiny.R on prop-tiny.csv, 2026-05-14)
        "mu_re":  -2.365861008193144,
        "seRE":    0.1350315581077194,
        "tau2":    0.0,
        "Q":       0.1670466754710336,
        "i2":      0.0,
        "poolP":   0.08581328456303973,
        "poolLo":  0.0671999729960778,
        "poolHi":  0.1089798521337489,
        "k":       5,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "prop-tiny.R",
        fixture_csv=FIX / "prop-tiny.csv",
        tol=1e-6,
    )
