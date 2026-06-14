"""
test_henmi_copas.py — Numerical-agreement + contract tests for the Henmi-Copas
port (methods.henmi_copas) against R's metafor::hc().

The reference values in hc_reference.json were produced by gen_hc_reference.R
(metafor 5.0.1) on the exact (y, v) inputs in hc_testcases.json. Both files are
committed so this test runs without R. To regenerate:

    python gen_hc_reference.py --emit-cases
    Rscript gen_hc_reference.R

Run: python -m pytest tests/test_henmi_copas.py -q   (from truth-recovery-bench/)
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
import methods as M

REF_PATH = os.path.join(ROOT, "hc_reference.json")
CASES_PATH = os.path.join(ROOT, "hc_testcases.json")
REQUIRED_KEYS = {"mu", "ci_lo", "ci_hi", "se", "tau2", "ok"}

# Point estimate (FE mean) and tau2 are closed-form -> machine precision.
# The CI bounds depend on a uniroot over a numerical integral; metafor and scipy
# agree to ~3e-6 (root/quadrature tolerance), so the bound tolerance is looser.
POINT_TOL = 1e-8
CI_TOL = 1e-4


def _load():
    ref = json.load(open(REF_PATH))
    cases = {c["label"]: c for c in json.load(open(CASES_PATH))}
    return ref, cases


@pytest.mark.skipif(not (os.path.exists(REF_PATH) and os.path.exists(CASES_PATH)),
                    reason="hc reference/cases not generated")
def test_matches_metafor_hc():
    ref, cases = _load()
    assert ref, "empty reference"
    worst = 0.0
    for r in ref:
        c = cases[r["label"]]
        out = M.henmi_copas(np.asarray(c["y"], float), np.asarray(c["v"], float))
        assert out["ok"], f"{r['label']}: HC failed"
        assert abs(out["mu"] - r["beta"]) < POINT_TOL, f"{r['label']}: beta"
        assert abs(out["tau2"] - r["tau2"]) < POINT_TOL, f"{r['label']}: tau2"
        assert abs(out["se"] - r["se"]) < POINT_TOL, f"{r['label']}: se"
        assert abs(out["ci_lo"] - r["ci_lb"]) < CI_TOL, f"{r['label']}: ci_lb"
        assert abs(out["ci_hi"] - r["ci_ub"]) < CI_TOL, f"{r['label']}: ci_ub"
        worst = max(worst, abs(out["ci_lo"] - r["ci_lb"]),
                    abs(out["ci_hi"] - r["ci_ub"]))
    assert worst < CI_TOL


def test_hc_contract():
    """Universal method-dict contract across every scenario."""
    for sc in dgp.SCENARIOS + dgp.STRESS_SCENARIOS:
        for k in (5, 15, 50):
            rng = np.random.default_rng(k)
            y, v, info = dgp.generate(0.3, 0.05, k, sc, rng)
            if info["degenerate"] or len(y) < 3:
                continue
            r = M.henmi_copas(y, v)
            assert REQUIRED_KEYS <= set(r), f"{sc} k={k}: missing keys"
            if r["ok"]:
                assert np.isfinite(r["mu"]) and np.isfinite(r["ci_lo"]) and np.isfinite(r["ci_hi"])
                assert r["ci_lo"] <= r["mu"] <= r["ci_hi"], f"{sc} k={k}: point outside CI"


def test_hc_point_is_fixed_effect_mean():
    """H&C's point estimate is the inverse-variance FE mean, by definition."""
    for sc in ("none", "step_strong", "copas_strong"):
        rng = np.random.default_rng(7)
        y, v, _ = dgp.generate(0.3, 0.05, 20, sc, rng)
        fe = float(np.sum((1.0 / v) * y) / np.sum(1.0 / v))
        assert abs(M.henmi_copas(y, v)["mu"] - fe) < 1e-12


def test_hc_wider_than_fe_wald():
    """The H&C interval must be at least as wide as the naive FE Wald interval
    (its whole purpose is to widen for unmodelled heterogeneity)."""
    for sc in ("step_strong", "copas_strong"):
        rng = np.random.default_rng(3)
        y, v, _ = dgp.generate(0.3, 0.05, 20, sc, rng)
        r = M.henmi_copas(y, v)
        fe_se = float(np.sqrt(1.0 / np.sum(1.0 / v)))
        fe_w = 2 * M.Z975 * fe_se
        assert (r["ci_hi"] - r["ci_lo"]) >= fe_w - 1e-9


def test_hc_registered():
    assert "HenmiCopas" in M.ALL_METHODS
    assert M.ALL_METHODS["HenmiCopas"] is M.henmi_copas


def test_hc_degenerate_fallback():
    r = M.henmi_copas(np.array([0.2]), np.array([0.05]))   # k=1
    assert r["ok"] is False and "fail" in r
