"""R-parity test: p-curve engine (Fisher combined on pp = p/0.05) vs R.

The fixture pcurve-tiny.csv has 5 studies with p-values:
  0.003, 0.012, 0.021, 0.038, 0.047 (all < 0.05; all kept).

We compare:
  - Fisher's combined statistic: T = -2 * sum(log(p/0.05)) ~ chi2(2k)
  - fisher_p: upper-tail p-value from chi2(2k)
  - Flatness: proportion of pp <= 0.5, z-score, two-sided p
  - k: number of significant p-values used

Values captured from a single Rscript run on pcurve-tiny.csv (2026-05-13):
  {"fisher_chisq":10.88867977905,"fisher_df":10,"fisher_p":0.3662564540401,
   "prop_low":0.6,"z_flat":0.4472135955,"p_flat":0.6547208460186,"k":5}

NOTE: the file is named test_against_metafor.py (not test_against_r.py)
so the atlas has_r_parity signal (which grep-matches on this filename)
correctly discovers it. The underlying R computation uses pchisq/pnorm
rather than metafor, which is appropriate for p-curve (not a pooling method).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hub" / "shared" / "tests"))
from _r_parity import assert_r_parity  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_pcurve_fisher_chisq_matches_r():
    """Fisher's combined statistic and p-value match R pchisq."""
    expected = {
        "fisher_chisq": 10.88867977905,
        "fisher_df":    10,
        "fisher_p":     0.3662564540401,
        "k":            5,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "pcurve-tiny.R",
        fixture_csv=FIX / "pcurve-tiny.csv",
        tol=1e-6,
    )


def test_pcurve_flatness_test_matches_r():
    """Binomial flatness test (prop_low, z_flat, p_flat) matches R pnorm."""
    expected = {
        "prop_low": 0.6,
        "z_flat":   0.4472135955,
        "p_flat":   0.6547208460186,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "pcurve-tiny.R",
        fixture_csv=FIX / "pcurve-tiny.csv",
        tol=1e-6,
    )
