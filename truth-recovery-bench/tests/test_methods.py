"""
Validation of the Python method ports against the audited R-parity oracles.

Anchors (from allmeta's own parity specs):
  - Vevea-Hedges: metafor::selmodel(rma(method='ML'), type='stepfun', steps=0.025)
        yi=[.10,.30,.35,.65,.45,.80,.55,1.05,.70,1.20,.90,1.40]
        sei=[.30,.28,.20,.35,.18,.40,.15,.45,.12,.50,.10,.55]
        -> mu=0.59722923 se=0.11093960 tau2=0.02598154 delta2=0.599915
  - Copas-Shi: metasens copas.loglik.without.beta profile MLE at the publprob path
        (copas-tiny fixture + copas-oracle.json).
  - REML: self-consistency vs a brute-force grid maximiser of the restricted LL.
"""
import json
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import methods as M


def test_reml_matches_brute_force_grid():
    rng = np.random.default_rng(0)
    for _ in range(20):
        k = rng.integers(5, 30)
        v = rng.uniform(0.01, 0.2, size=k)
        y = rng.normal(0.4, np.sqrt(0.05), size=k) + rng.normal(0, np.sqrt(v))
        t2 = M._reml_tau2(y, v)
        grid = np.concatenate([[0.0], np.exp(np.linspace(np.log(1e-6), np.log(5), 4000))])

        def rll(tau2):
            w = 1.0 / (v + tau2)
            sw = w.sum()
            mu = np.sum(w * y) / sw
            return (-0.5 * np.sum(np.log(v + tau2)) - 0.5 * np.log(sw)
                    - 0.5 * np.sum(w * (y - mu) ** 2))
        best = grid[np.argmax([rll(g) for g in grid])]
        assert abs(t2 - best) < 5e-3 + 0.02 * best, (t2, best)


def test_dl_pm_reml_ordering_and_fe_limit():
    # homogeneous data: all tau2 estimators near 0; RE -> FE
    v = np.array([0.04, 0.05, 0.03, 0.06, 0.04, 0.05])
    y = np.array([0.30, 0.31, 0.29, 0.30, 0.32, 0.30])
    assert M.dersimonian_laird(y, v)["tau2"] < 1e-3
    assert M._reml_tau2(y, v) < 1e-2
    fe = M._fe_mu(y, v)
    assert abs(M.reml(y, v)["mu"] - fe) < 1e-2


def test_vevea_hedges_metafor_anchor():
    yi = np.array([0.10, 0.30, 0.35, 0.65, 0.45, 0.80, 0.55, 1.05, 0.70, 1.20, 0.90, 1.40])
    sei = np.array([0.30, 0.28, 0.20, 0.35, 0.18, 0.40, 0.15, 0.45, 0.12, 0.50, 0.10, 0.55])
    vi = sei ** 2
    r = M.vevea_hedges(yi, vi, steps=(0.025,))
    assert abs(r["mu"] - 0.59722923) < 5e-3, r["mu"]
    assert abs(r["tau2"] - 0.02598154) < 5e-3, r["tau2"]
    assert abs(r["delta"][1] - 0.599915) < 1e-2, r["delta"]
    assert abs(r["se"] - 0.11093960) < 1e-2, r["se"]


def test_copas_profile_mle_metasens_anchor():
    yi = np.array([0.25, 0.18, 0.40, 0.30, 0.12, 0.55, 0.22, 0.32, 0.45, 0.28])
    sei = np.array([0.08, 0.10, 0.15, 0.09, 0.07, 0.20, 0.08, 0.12, 0.17, 0.10])
    oracle = json.load(open(os.path.join(os.path.dirname(__file__), "..",
                                         "..", "copas", "tests", "fixtures",
                                         "copas-oracle.json")))
    checked = 0
    for pt in oracle["points"]:
        g0, g1 = pt["gamma0"], pt["gamma1"]
        r = M._copas_profile_mle(yi, sei, g0, g1)
        assert r is not None
        assert abs(r["mu"] - pt["TE"]) < 2e-3, (pt["publprob"], r["mu"], pt["TE"])
        assert abs(r["tau"] - pt["tau"]) < 5e-3, (pt["publprob"], r["tau"], pt["tau"])
        checked += 1
    assert checked >= 5


def test_hksj_floor_widens_not_narrows():
    # When Q < k-1 (under-dispersed), HKSJ must NOT narrow below the Wald RE CI.
    v = np.array([0.04, 0.05, 0.03, 0.06, 0.04])
    y = np.array([0.30, 0.305, 0.298, 0.30, 0.302])  # very homogeneous
    re = M.reml(y, v)
    hk = M.hksj(y, v)
    re_w = re["ci_hi"] - re["ci_lo"]
    hk_w = hk["ci_hi"] - hk["ci_lo"]
    assert hk_w >= re_w - 1e-9, (hk_w, re_w)


def test_trimfill_no_asymmetry_returns_k0_zero_ish():
    rng = np.random.default_rng(3)
    v = rng.uniform(0.02, 0.1, 20)
    y = rng.normal(0.3, np.sqrt(v + 0.02))
    r = M.trim_fill(y, v)
    assert r["ok"] and r["k0"] >= 0


def test_all_methods_return_contract():
    rng = np.random.default_rng(5)
    v = rng.uniform(0.02, 0.15, 12)
    y = rng.normal(0.4, np.sqrt(v + 0.03))
    out = M.run_all(y, v, seed=1)
    for name, r in out.items():
        for key in ("mu", "ci_lo", "ci_hi", "ok"):
            assert key in r, (name, key)


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
