"""R-parity test: mh-peto engine vs metafor rma.peto() + rma.mh().

Values captured from a single Rscript run on mhpeto-tiny.csv (2026-05-14):
  {"peto_b":-1.081012806542,"peto_se":0.3065960104313,
   "peto_ci_lb":-1.681929944791,"peto_ci_ub":-0.4800956682933,
   "peto_Q":1.222399523946,"peto_QEp":0.8743970929713,"peto_k":5,
   "mh_b":-1.205880041393,"mh_se":0.362368908134,
   "mh_ci_lb":-1.916110050453,"mh_ci_ub":-0.4956500323332,
   "mh_Q":0.9472498929433,"mh_QEp":0.9176863337055,"mh_k":5}

The JavaScript engine in index.html implements the same MH and Peto formulas;
this test runs R to re-derive the values and asserts R-parity at tol=1e-6.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hub" / "shared" / "tests"))
from _r_parity import assert_r_parity  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_mhpeto_peto_matches_metafor_rma_peto():
    """Peto OR: JS engine logOR vs metafor rma.peto() b (log scale)."""
    expected = {
        # metafor::rma.peto() on mhpeto-tiny.csv (2026-05-14)
        "peto_b":     -1.081012806542,
        "peto_se":     0.3065960104313,
        "peto_ci_lb": -1.681929944791,
        "peto_ci_ub": -0.4800956682933,
        "peto_Q":      1.222399523946,
        "peto_QEp":    0.8743970929713,
        "peto_k":      5,
        # metafor::rma.mh() on mhpeto-tiny.csv (2026-05-14)
        "mh_b":       -1.205880041393,
        "mh_se":       0.362368908134,
        "mh_ci_lb":   -1.916110050453,
        "mh_ci_ub":   -0.4956500323332,
        "mh_Q":        0.9472498929433,
        "mh_QEp":      0.9176863337055,
        "mh_k":        5,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "mhpeto-tiny.R",
        fixture_csv=FIX / "mhpeto-tiny.csv",
        tol=1e-6,
    )
