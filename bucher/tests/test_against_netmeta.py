"""R-parity test: bucher indirect comparison engine vs R (netmeta cross-check).

The JS engine (bucher/index.html) implements the Bucher (1997) closed-form
indirect treatment comparison:
  d_indirect(BC) = d(AC) - d(AB)      [A is the common comparator]
  se_indirect(BC) = sqrt(se(AC)^2 + se(AB)^2)

The R script (bucher-tiny.R) replicates the identical algorithm:
  1. Pool AB trials via fixed-effect (IV) weighting.
  2. Pool AC trials via fixed-effect (IV) weighting.
  3. Bucher indirect: mu_bc_indirect = mu_ac - mu_ab; se = sqrt(se_ac^2 + se_ab^2).
  4. Cross-check indirect BC against netmeta::netmeta().

Values captured from a single Rscript run on bucher-tiny.csv
(2026-05-14, R 4.5.2, netmeta 3.2-0):
  {
    "mu_ab":           -0.2909502262443439,
    "se_ab":            0.07399400733959438,
    "mu_ac":           -0.4915294117647059,
    "se_ac":            0.09111079228383559,
    "mu_bc_indirect":  -0.200579185520362,
    "se_bc_indirect":   0.1173724396643445,
    "lo_bc_indirect":  -0.4306249400400776,
    "hi_bc_indirect":   0.02946656899935363,
    "p_bc_indirect":    0.08746722782258598,
    "te_indirect_nm":  -0.2005791855203728,
    "se_indirect_nm":   0.1173724396643451
  }

Input: 5 rows, columns: study, treat1, treat2, TE, seTE
  Triangle network: A-B (2 studies), A-C (2 studies), B-C (1 study).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hub" / "shared" / "tests"))
from _r_parity import assert_r_parity  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_bucher_indirect_bc_matches_r():
    """Bucher indirect B vs C: JS closed-form vs R replication + netmeta cross-check."""
    expected = {
        # Captured from R (bucher-tiny.R on bucher-tiny.csv, 2026-05-14)
        "mu_ab":           -0.2909502262443439,
        "se_ab":            0.07399400733959438,
        "mu_ac":           -0.4915294117647059,
        "se_ac":            0.09111079228383559,
        "mu_bc_indirect":  -0.200579185520362,
        "se_bc_indirect":   0.1173724396643445,
        "lo_bc_indirect":  -0.4306249400400776,
        "hi_bc_indirect":   0.02946656899935363,
        "p_bc_indirect":    0.08746722782258598,
        # netmeta cross-check (should match mu_bc_indirect to 1e-14)
        "te_indirect_nm":  -0.2005791855203728,
        "se_indirect_nm":   0.1173724396643451,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "bucher-tiny.R",
        fixture_csv=FIX / "bucher-tiny.csv",
        tol=1e-6,
    )
