"""
test_mech_ensemble.py — Contract / determinism / behaviour tests for the
mechanism-aware ensemble (mech_ensemble.py, roadmap P0).

The ensemble is a measured *negative* (it does not beat Unified; see
MECH_ENSEMBLE.md), but it is a registered, working method, so it must satisfy the
universal method contract and its documented construction invariants.

Run: python -m pytest tests/test_mech_ensemble.py -q   (from truth-recovery-bench/)
"""

import os
import sys

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import dgp
import methods as M

MODEL_PATH = os.path.join(ROOT, "sbi_model.pkl")
pytestmark = pytest.mark.skipif(not os.path.exists(MODEL_PATH),
                                reason="sbi_model.pkl not trained")
REQUIRED_KEYS = {"mu", "ci_lo", "ci_hi", "tau2", "ok"}


def _ma(scenario="step_strong", k=15, seed=0, mu=0.3, tau2=0.05):
    rng = np.random.default_rng(seed)
    y, v, _ = dgp.generate(mu, tau2, k, scenario, rng)
    return y, v


def test_registered():
    assert "MechEnsemble" in M.ALL_METHODS


def test_contract_all_scenarios():
    import mech_ensemble as ME
    for sc in dgp.SCENARIOS + dgp.STRESS_SCENARIOS:
        for k in (5, 15, 50):
            y, v = _ma(sc, k=k, seed=1)
            r = ME.mech_ensemble(y, v)
            assert REQUIRED_KEYS <= set(r), f"{sc} k={k}: missing keys"
            assert r["ok"] is True
            assert np.isfinite(r["ci_lo"]) and np.isfinite(r["ci_hi"])
            assert r["ci_lo"] <= r["mu"] <= r["ci_hi"], f"{sc} k={k}: point outside CI"


def test_point_is_gated_npe():
    """The ensemble point IS the production gated-NPE point (clamped into its
    possibly-widened interval)."""
    import mech_ensemble as ME
    from sbi import npe
    for sc in dgp.SCENARIOS:
        y, v = _ma(sc, k=15, seed=2)
        r = ME.mech_ensemble(y, v)
        a = npe(y, v)
        # equal unless the gated point had to be clamped into the interval
        assert abs(r["mu"] - min(max(a["mu"], r["ci_lo"]), r["ci_hi"])) < 1e-9


def test_widening_only_grows_interval():
    """With the OOD/PartialID trigger ON, the interval must contain the
    no-widen (scaled-NPE) interval — widening never shrinks coverage."""
    import mech_ensemble as ME
    for sc in dgp.SCENARIOS + dgp.STRESS_SCENARIOS:
        y, v = _ma(sc, k=25, seed=3)
        wide = ME.mech_ensemble(y, v, widen=True)
        base = ME.mech_ensemble(y, v, widen=False)
        assert wide["ci_lo"] <= base["ci_lo"] + 1e-9, f"{sc}: widen raised lower bound"
        assert wide["ci_hi"] >= base["ci_hi"] - 1e-9, f"{sc}: widen lowered upper bound"


def test_higher_threshold_never_wider():
    """A stricter OOD threshold triggers widening on fewer cells, so the interval
    can only be the same or tighter (monotone in OOD_K)."""
    import mech_ensemble as ME
    for sc in ("step_strong", "copas_strong", "mixed_strong"):
        y, v = _ma(sc, k=25, seed=4)
        lo_k = ME.mech_ensemble(y, v, ood_k=0.5)
        hi_k = ME.mech_ensemble(y, v, ood_k=5.0)
        w_lo = lo_k["ci_hi"] - lo_k["ci_lo"]
        w_hi = hi_k["ci_hi"] - hi_k["ci_lo"]
        assert w_hi <= w_lo + 1e-9, f"{sc}: stricter threshold widened the interval"


def test_determinism_and_permutation_invariance():
    import mech_ensemble as ME
    y, v = _ma("step_strong", k=15, seed=5)
    r1 = ME.mech_ensemble(y, v)
    r2 = ME.mech_ensemble(y, v)
    assert r1["mu"] == r2["mu"] and r1["ci_lo"] == r2["ci_lo"]
    perm = np.random.default_rng(0).permutation(len(y))
    r3 = ME.mech_ensemble(y[perm], v[perm])
    assert abs(r1["mu"] - r3["mu"]) < 1e-9           # NPE point: exact
    assert abs(r1["ci_lo"] - r3["ci_lo"]) < 1e-4     # PartialID bound: numerical


def test_mechanism_detection_separates_clean_from_strong():
    """detect_mechanism: clean weight high on `none`, low under strong selection."""
    import mech_ensemble as ME
    import features as F
    clean = np.mean([ME.detect_mechanism(F.featurize(*_ma("none", k=25, seed=s)))["clean_w"]
                     for s in range(20)])
    strong = np.mean([ME.detect_mechanism(F.featurize(*_ma("step_strong", k=25, seed=s)))["clean_w"]
                      for s in range(20)])
    assert clean > strong, f"clean_w not separating: none={clean:.2f} strong={strong:.2f}"
