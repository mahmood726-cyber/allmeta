"""R-parity test: PET-PEESE engine vs metafor regtest(model='lm').

metafor 4.x note: regtest() with ret.fit=TRUE returns an lm object.
pet$fit$b and pet$fit$se are NULL in metafor 4.x — coef() and
summary()$coefficients are used in the R fixture instead.
"""
import sys
from pathlib import Path

# Reuse the shared helper from hub/shared/tests/_r_parity.py
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hub" / "shared" / "tests"))
from _r_parity import assert_r_parity  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_petpeese_matches_metafor_regtest():
    expected = {
        # Values captured from a single Rscript run on petpeese-tiny.csv (2026-05-13):
        # {"pet_zval":0.5006803270791,"pet_pval":0.6344286536251,
        #  "pet_b0":0.02925758348903,"pet_se_b0":0.1920372186159,
        #  "peese_b0":0.0711497949453,"peese_se_b0":0.1024321694814,
        #  "pool_b":0.1213967993407,"pool_se":0.05289342302168,"k":8}
        "pet_zval":    0.5006803270791,
        "pet_pval":    0.6344286536251,
        "pet_b0":      0.02925758348903,
        "pet_se_b0":   0.1920372186159,
        "peese_b0":    0.0711497949453,
        "peese_se_b0": 0.1024321694814,
        "pool_b":      0.1213967993407,
        "pool_se":     0.05289342302168,
        "k":           8,
    }
    assert_r_parity(
        expected,
        r_script=FIX / "petpeese-tiny.R",
        fixture_csv=FIX / "petpeese-tiny.csv",
        tol=1e-6,
    )
