"""R-parity test: cumulative-subgroup PM engine vs metafor::cumul().

The JS engine (cumulative-subgroup/index.html) implements:
  - Paule-Mandel (PM) tau² via bisection (100 iters, tol=1e-9).
  - Cumulative pooling: studies sorted by year; at step i, pool studies[0..i]
    using PM tau² and inverse-variance weights; CI = mu ± 1.96*se.
  - Final step == full-data RE pool.

The R script (cumul-tiny.R) calls metafor::cumul(rma(yi, vi, method="PM"),
order = year) and re-computes CI bounds using qnorm(0.975) exactly
(matching the JS engine after Cycle 7.1; was 1.96 before).
The fixture has Q < df so tau² = 0 in both engines (PM floor).

Values captured from a single Rscript run on cumul-tiny.csv (2026-05-14, R 4.5.2):
  {"mu_final":-0.3432098765432097,"se_final":0.08606629658238701,
   "lo_final":-0.511896718127431,"hi_final":-0.1745230349589884,
   "mu_penu":-0.3403508771929825,"se_penu":0.1025978352085154,
   "lo_penu":-0.5414389390934481,"hi_penu":-0.1392628152925168,
   "tau2":0,"i2":0,"Q":1.672942386831276,"k":5}

Input: 5 studies, columns: study, year, yi, vi.
Penultimate = pool of first 4 studies (sorted by year = chronological order).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hub" / "shared" / "tests"))
from _r_parity import assert_r_parity  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_cumulative_pm_matches_metafor_final():
    """Final cumulative step (all k=5 studies): JS engine vs metafor::cumul(PM)."""
    expected = {
        # Captured from R (cumul-tiny.R on cumul-tiny.csv, 2026-05-14)
        "mu_final": -0.3432098765432097,
        "se_final":  0.08606629658238701,
        "lo_final": -0.511896718127431,
        "hi_final": -0.1745230349589884,
        "tau2":      0.0,
        "i2":        0.0,
        "Q":         1.672942386831276,
        "k":         5,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "cumul-tiny.R",
        fixture_csv=FIX / "cumul-tiny.csv",
        tol=1e-6,
    )


def test_cumulative_pm_matches_metafor_penultimate():
    """Penultimate cumulative step (k-1=4 studies): JS engine vs metafor::cumul(PM)."""
    expected = {
        # Captured from R (cumul-tiny.R on cumul-tiny.csv, 2026-05-14)
        "mu_penu": -0.3403508771929825,
        "se_penu":  0.1025978352085154,
        "lo_penu": -0.5414389390934481,
        "hi_penu": -0.1392628152925168,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "cumul-tiny.R",
        fixture_csv=FIX / "cumul-tiny.csv",
        tol=1e-6,
    )
