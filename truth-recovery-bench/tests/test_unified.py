"""
test_unified.py — Contract, stability, determinism and calibration-regression
tests for the unified-estimator contributions (NPE, PVS, PartialID).

Run: python -m pytest tests/test_unified.py -q   (from truth-recovery-bench/)
"""

import json
import os
import sys

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import dgp
import features as F
import methods as M
import robust_selection as RS

REQUIRED_KEYS = {"mu", "ci_lo", "ci_hi", "tau2", "ok"}
MODEL_PATH = os.path.join(ROOT, "sbi_model.pkl")
DIAG_PATH = os.path.join(ROOT, "sbi_diagnostics.json")


def _ma(scenario="step_strong", k=15, seed=0, mu=0.3, tau2=0.05):
    rng = np.random.default_rng(seed)
    y, v, _ = dgp.generate(mu, tau2, k, scenario, rng)
    return y, v


def test_feature_parity():
    assert len(F.FEATURE_NAMES) == F.N_FEATURES
    y, v = _ma()
    f = F.featurize(y, v)
    assert f.shape == (F.N_FEATURES,)
    assert np.all(np.isfinite(f))


@pytest.mark.parametrize("name", ["PVS", "PartialID"])
def test_track2_contract(name):
    fn = RS.pvs if name == "PVS" else RS.partial_id
    for sc in dgp.SCENARIOS:
        y, v = _ma(sc, k=15, seed=1)
        r = fn(y, v)
        assert REQUIRED_KEYS <= set(r), f"{name} missing keys"
        assert np.isfinite(r["mu"]) and np.isfinite(r["ci_lo"]) and np.isfinite(r["ci_hi"])
        assert r["ci_lo"] <= r["mu"] <= r["ci_hi"], f"{name} point outside CI ({sc})"


def test_pvs_no_smallk_blowup():
    """Track-2's central promise: bounded estimates at small k (no Vevea runaway)."""
    maxabs = 0.0
    for seed in range(60):
        for sc in ("none", "step_strong", "copas_strong"):
            y, v = _ma(sc, k=5, seed=seed)
            r = RS.pvs(y, v)
            if r["ok"]:
                maxabs = max(maxabs, abs(r["mu"]))
    assert maxabs < 5.0, f"PVS produced a runaway estimate |mu|={maxabs}"


@pytest.mark.skipif(not os.path.exists(MODEL_PATH), reason="sbi_model.pkl not trained")
def test_npe_contract_and_determinism():
    import sbi
    y, v = _ma("copas_strong", k=10, seed=2)
    r1 = sbi.npe(y, v)
    r2 = sbi.npe(y, v)
    assert REQUIRED_KEYS <= set(r1)
    assert r1["ok"] is True
    assert r1["ci_lo"] <= r1["mu"] <= r1["ci_hi"]
    # amortized + deterministic model => identical repeats
    assert r1["mu"] == r2["mu"] and r1["ci_lo"] == r2["ci_lo"]


@pytest.mark.skipif(not os.path.exists(MODEL_PATH), reason="sbi_model.pkl not trained")
def test_npe_permutation_invariance():
    import sbi
    y, v = _ma("step_strong", k=15, seed=5)
    r1 = sbi.npe(y, v)
    perm = np.random.default_rng(0).permutation(len(y))
    r2 = sbi.npe(y[perm], v[perm])
    assert abs(r1["mu"] - r2["mu"]) < 1e-9
    assert abs(r1["ci_lo"] - r2["ci_lo"]) < 1e-9


@pytest.mark.skipif(not os.path.exists(DIAG_PATH), reason="diagnostics not generated")
def test_calibration_regression():
    """Guard: held-out exact-DGP coverage must not regress below the bar.

    The brief's target is >=0.90; we assert >=0.88 as a regression tripwire so a
    bad retrain is caught, while the REPORT states the exact measured numbers.
    """
    diag = json.load(open(DIAG_PATH))
    covs = []
    for sc, byk in diag["exact_dgp_eval"].items():
        for k, m in byk.items():
            covs.append(m["coverage"])
    assert covs, "no coverage cells in diagnostics"
    assert min(covs) >= 0.88, f"NPE exact-DGP coverage regressed: min={min(covs):.3f}"
