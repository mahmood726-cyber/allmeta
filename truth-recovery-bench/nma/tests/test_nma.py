"""
Validation gate for the NMA truth-recovery harness.

These are correctness contracts, not leaderboard numbers: the estimator must be
unbiased and reduce to FE at tau2=0, network DL must recover injected tau2, the
honest inconsistency test must hold type-I while the naive one over-rejects under
heterogeneity, the FE CI must under-cover under heterogeneity (the LivingNMA /
enma-snma bug, reproduced) while RE/NetHK recover, rankings must concentrate on
the true best as information grows, and PartialID must collapse to NetHK when no
inconsistency is detectable. Reps are modest (seeded) so the suite stays < ~60s.
"""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import dgp_nma as D
import methods_nma as M
import partialid_nma as P


def _rng(i):
    return np.random.default_rng(10_000 + i)


def test_unbiased_and_re_reduces_to_fe_at_tau0():
    biases = []
    for r in range(200):
        st, tr = D.generate("dense", 4, 6, 0.0, 0.0, "none", _rng(r))
        fRE = M.fit_consistency(st, 4, re=True)
        fFE = M.fit_consistency(st, 4, re=False)
        # the only difference is the (near-zero) DL tau2 in the RE weights, so the
        # two points agree to the size of that nuisance estimate, not exactly.
        assert np.allclose(fRE["dhat"], fFE["dhat"], atol=0.1)
        biases.append(fRE["dhat"] - tr["d"][1:])
    # both are unbiased for the true basic parameters
    assert np.abs(np.mean(biases, axis=0)).max() < 0.03


def test_network_dl_recovers_tau2():
    for true_t2 in (0.05, 0.15):
        ests = [M.fit_consistency(
            D.generate("dense", 4, 6, true_t2, 0.0, "none", _rng(r))[0], 4)["tau2"]
            for r in range(300)]
        assert abs(np.mean(ests) - true_t2) < 0.03


def test_inconsistency_typeI_honest_vs_naive():
    """Honest test ~nominal under heterogeneity; naive (tau2-ignoring) over-rejects."""
    hon = nai = 0
    n = 400
    for r in range(n):
        st, _ = D.generate("loop", 3, 5, 0.10, 0.0, "none", _rng(r))
        hon += M.inconsistency_test(st, 3, honest=True)["p_value"] < 0.05
        nai += M.inconsistency_test(st, 3, honest=False)["p_value"] < 0.05
    assert hon / n < 0.10          # calibrated
    assert nai / n > 0.20          # the reproduced over-detection bug


def test_inconsistency_has_power():
    rej = 0
    n = 300
    for r in range(n):
        st, _ = D.generate("loop", 3, 6, 0.05, 0.6, "none", _rng(r))
        rej += M.inconsistency_test(st, 3, honest=True)["p_value"] < 0.05
    assert rej / n > 0.4


def test_fe_undercovers_re_recovers_under_heterogeneity():
    cFE = cRE = cHK = tot = 0
    for r in range(300):
        st, tr = D.generate("dense", 4, 4, 0.15, 0.0, "none", _rng(r))
        fFE = M.fit_consistency(st, 4, re=False)
        fRE = M.fit_consistency(st, 4, re=True)
        hk = M.network_hk(fRE)
        for a in range(4):
            for b in range(a + 1, 4):
                t = tr["D"][a, b]
                _, lo, hi, _ = M.contrast_ci(fFE, a, b); cFE += lo <= t <= hi
                _, lo, hi, _ = M.contrast_ci(fRE, a, b); cRE += lo <= t <= hi
                _, lo, hi, _ = M.contrast_ci(fRE, a, b, Cov=hk["Cov"], crit=hk["crit"]); cHK += lo <= t <= hi
                tot += 1
    assert cFE / tot < 0.75        # FE-CI bug: severe under-coverage
    assert cRE / tot > 0.88        # RE recovers
    assert cHK / tot > 0.90        # NetHK at/above nominal
    assert cHK / tot >= cRE / tot - 1e-9


def test_ranking_concentrates_on_true_best():
    rng = np.random.default_rng(7)
    hit = 0
    n = 200
    for r in range(n):
        st, tr = D.generate("dense", 4, 8, 0.0, 0.0, "none", _rng(r))
        f = M.fit_consistency(st, 4, re=True)
        rk = M.ranking(f["dhat"], f["Cov"], 4, rng)
        hit += rk["best"] == tr["best"]
    assert hit / n > 0.95


def test_partialid_collapses_to_nethk_when_consistent():
    """Star indirect-only contrast: no loops -> omega_hat=0 -> PartialID == NetHK."""
    st, _ = D.generate("star", 4, 5, 0.10, 0.0, "none", _rng(1))
    assert P.omega_hat(st, 4) == 0.0
    fit = M.fit_consistency(st, 4, re=True)
    hk = M.network_hk(fit)
    _, lo_hk, hi_hk, _ = M.contrast_ci(fit, 1, 2, Cov=hk["Cov"], crit=hk["crit"])
    _, lo_pid, hi_pid, _ = P.partial_id_interval(fit, st, 1, 2, c=2.0)
    assert abs(lo_hk - lo_pid) < 1e-9 and abs(hi_hk - hi_pid) < 1e-9


def test_partialid_restores_coverage_under_inconsistency():
    cRE = cPID = tot = 0
    for r in range(300):
        st, tr = D.generate("loop", 3, 5, 0.05, 0.4, "none", _rng(r))
        fit = M.fit_consistency(st, 3, re=True)
        for a in range(3):
            for b in range(a + 1, 3):
                t = tr["D"][a, b]
                _, lo, hi, _ = M.contrast_ci(fit, a, b); cRE += lo <= t <= hi
                _, lo, hi, _ = P.partial_id_interval(fit, st, a, b, c=2.0); cPID += lo <= t <= hi
                tot += 1
    assert cPID / tot > cRE / tot + 0.1     # materially better under inconsistency
