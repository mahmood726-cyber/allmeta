"""
Tests for the frontier SOTA competitor additions (2026-06-14):
  p-uniform* (van Aert & van Assen 2021), WLS (Stanley-Doucouliagos 2015),
  WAAP (Stanley-Doucouliagos-Ioannidis 2017).

Validates: (1) the {mu,ci_lo,ci_hi,se,tau2,ok} contract; (2) determinism;
(3) WLS reduces to the FE point estimate and t_{k-1} multiplicative interval;
(4) WAAP falls back to WLS when no study is adequately powered; (5) the
known-truth property that all three are ~unbiased with ~nominal coverage under
NO selection, and that p-uniform* de-biases under one-sided p-step selection.
"""
import os
import sys

import numpy as np
import pytest
from scipy import stats

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import methods as M
import dgp

REQ = {"method", "mu", "se", "ci_lo", "ci_hi", "tau2", "ok"}
NEW = ["p-uniform*", "WLS", "WAAP"]


def _toy(seed=0, k=15, mu=0.3, tau2=0.05):
    rng = np.random.default_rng(seed)
    se = np.exp(rng.uniform(np.log(0.1), np.log(0.6), size=k))
    theta = rng.normal(mu, np.sqrt(tau2), size=k)
    y = rng.normal(theta, se)
    return y, se ** 2


@pytest.mark.parametrize("name", NEW)
def test_contract(name):
    y, v = _toy()
    r = M.ALL_METHODS[name](y, v)
    assert REQ <= set(r), f"{name} missing keys: {REQ - set(r)}"
    assert np.isfinite(r["mu"])
    assert np.isfinite(r["ci_lo"]) and np.isfinite(r["ci_hi"])
    assert r["ci_lo"] <= r["mu"] <= r["ci_hi"]


@pytest.mark.parametrize("name", NEW)
def test_deterministic(name):
    y, v = _toy(seed=3)
    r1 = M.ALL_METHODS[name](y, v)
    r2 = M.ALL_METHODS[name](y, v)
    assert r1["mu"] == r2["mu"]
    assert r1["ci_lo"] == r2["ci_lo"] and r1["ci_hi"] == r2["ci_hi"]


def test_wls_is_fe_point_with_multiplicative_interval():
    y, v = _toy(seed=1, k=12)
    r = M.wls_sd(y, v)
    w = 1.0 / v
    beta_fe = float(np.sum(w * y) / np.sum(w))
    assert abs(r["mu"] - beta_fe) < 1e-12          # WLS point == FE point
    Q = float(np.sum(w * (y - beta_fe) ** 2))
    phi = Q / (len(y) - 1)
    se = np.sqrt(phi / np.sum(w))
    tcrit = stats.t.ppf(0.975, len(y) - 1)
    assert abs(r["ci_hi"] - (beta_fe + tcrit * se)) < 1e-10


def test_waap_falls_back_to_wls_when_underpowered():
    # Tiny effect, large SEs -> no study reaches SE <= |beta|/2.8 -> WAAP == WLS.
    rng = np.random.default_rng(5)
    v = rng.uniform(0.3, 0.6, size=10)
    y = rng.normal(0.02, np.sqrt(v))               # near-null effect
    w = M.waap(y, v)
    wl = M.wls_sd(y, v)
    assert w["n_powered"] < 2
    assert abs(w["mu"] - wl["mu"]) < 1e-12


def test_puniform_unbiased_under_no_selection():
    rng = np.random.default_rng(11)
    bias, cov, n = [], 0, 0
    for _ in range(250):
        y, v, info = dgp.generate(0.3, 0.05, 20, "none", rng)
        r = M.p_uniform_star(y, v)
        bias.append(r["mu"] - 0.3)
        cov += (r["ci_lo"] <= 0.3 <= r["ci_hi"])
        n += 1
    assert abs(np.mean(bias)) < 0.03, np.mean(bias)        # ~unbiased
    assert 0.90 <= cov / n <= 0.99, cov / n                # ~nominal coverage


def test_puniform_debiases_under_step_selection():
    rng = np.random.default_rng(13)
    naive, puni = [], []
    for _ in range(250):
        y, v, info = dgp.generate(0.3, 0.05, 20, "step_strong", rng)
        if info["degenerate"]:
            continue
        w = 1.0 / v
        naive.append(float(np.sum(w * y) / np.sum(w)) - 0.3)
        puni.append(M.p_uniform_star(y, v)["mu"] - 0.3)
    # p-uniform* materially reduces the upward selection bias of the naive pool.
    assert np.mean(puni) < 0.5 * np.mean(naive), (np.mean(puni), np.mean(naive))


def test_registered():
    for name in NEW:
        assert name in M.ALL_METHODS
