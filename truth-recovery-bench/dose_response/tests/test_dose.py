"""
Validation gate for the dose-response truth-recovery harness.

Correctness contracts, not leaderboard numbers: stage-1 GLS recovers the true slope
with the Greenland-Longnecker covariance; at τ²=0 the RE pool reduces to FE and
recovers β; REML recovers injected τ² and the fixed-effect pool collapses while
REML+HK and the one-stage model recover coverage under heterogeneity (the
dose-response-pro bug, reproduced); a linear pool is biased and under-covers the
curve under a quadratic truth while the quadratic multivariate pool recovers; and
selection collapses coverage (honest negative). Reps are modest (seeded) so the
suite stays well under a minute.
"""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import dgp_dose as D
import methods_dose as M


def _rng(i):
    return np.random.default_rng(20_000 + i)


def test_stage1_recovers_true_slope():
    """Per-study GLS slope is unbiased for the study's true slope (tau2=0)."""
    errs = []
    for r in range(300):
        st, tr = D.generate(1, 0.30, 0.0, 0.0, "linear", "none", _rng(r))
        b, v = M.stage1_linear(st[0])
        if np.isfinite(b):
            errs.append(b - 0.30)
    assert abs(np.mean(errs)) < 0.02


def test_fe_collapses_reml_recovers_under_heterogeneity():
    """The dose-response-pro bug: FE slope coverage collapses; REML+HK / one-stage
    recover. DL improves on FE but may still under-cover at small k."""
    cf = cd = cr = co = tot = 0
    beta, tau2 = 0.30, 0.20
    for r in range(400):
        studies, tr = D.generate(10, beta, 0.0, tau2, "linear", "none", _rng(r))
        betas, vars_ = [], []
        for st in studies:
            b, v = M.stage1_linear(st)
            betas.append(b); vars_.append(v)
        betas, vars_ = np.array(betas), np.array(vars_)
        fe = M.pool_fe(betas, vars_)
        dl = M.pool_dl(betas, vars_)
        re = M.pool_reml_hk(betas, vars_)
        os1 = M.one_stage_linear(studies)
        cf += fe["lo"] <= beta <= fe["hi"]
        cd += dl["lo"] <= beta <= dl["hi"]
        cr += re["lo"] <= beta <= re["hi"]
        co += os1["lo"] <= beta <= os1["hi"]
        tot += 1
    assert cf / tot < 0.30          # FE collapse (tau2 ignored)
    assert cr / tot > 0.92          # REML+HK recovers
    assert co / tot > 0.92          # one-stage recovers
    assert cd / tot > cf / tot + 0.4    # DL is a big improvement on FE


def test_reml_recovers_tau2():
    for true_t2 in (0.05, 0.15):
        ests = []
        for r in range(200):
            studies, _ = D.generate(15, 0.30, 0.0, true_t2, "linear", "none", _rng(r))
            betas, vars_ = [], []
            for st in studies:
                b, v = M.stage1_linear(st)
                betas.append(b); vars_.append(v)
            ests.append(M._reml_tau2(np.array(betas), np.array(vars_)))
        assert abs(np.mean(ests) - true_t2) < 0.04


def test_fe_calibrated_at_no_heterogeneity():
    c = tot = 0
    for r in range(300):
        studies, _ = D.generate(12, 0.30, 0.0, 0.0, "linear", "none", _rng(r))
        betas, vars_ = [], []
        for st in studies:
            b, v = M.stage1_linear(st)
            betas.append(b); vars_.append(v)
        fe = M.pool_fe(np.array(betas), np.array(vars_))
        c += fe["lo"] <= 0.30 <= fe["hi"]
        tot += 1
    assert 0.92 <= c / tot <= 0.99      # FE is fine ONLY when truly homogeneous


def test_linear_fit_biased_quadratic_recovers_under_nonlinearity():
    """Under a quadratic truth the linear-pool curve under-covers; the quadratic
    multivariate pool recovers."""
    beta, gamma = 0.45, -0.06
    test_doses = np.array([1.0, 3.0, 5.0])
    clin = cquad = tot = 0
    for r in range(250):
        studies, tr = D.generate(20, beta, gamma, 0.05, "quadratic", "none", _rng(r))
        betas, vars_, coefs, Covs = [], [], [], []
        for st in studies:
            b, v = M.stage1_linear(st)
            betas.append(b); vars_.append(v)
            cc, Cc = M.stage1_quad(st)
            coefs.append(cc); Covs.append(Cc)
        re = M.pool_reml_hk(np.array(betas), np.array(vars_))
        mv = M.pool_mv_reml(coefs, Covs)
        for d in test_doses:
            true_g = beta * d + gamma * d * d
            _, lo, hi = M.curve_ci_linear(re, d)
            clin += lo <= true_g <= hi
            _, lo, hi = M.curve_ci_quad(mv, d)
            cquad += lo <= true_g <= hi
            tot += 1
    assert clin / tot < 0.85                 # linear misspecification under-covers
    assert cquad / tot > clin / tot + 0.05   # quadratic recovers the curve


def test_selection_collapses_coverage_honest_negative():
    cf = tot = 0
    for r in range(250):
        studies, tr = D.generate(12, 0.30, 0.0, 0.10, "linear", "step_strong", _rng(r))
        betas, vars_ = [], []
        for st in studies:
            b, v = M.stage1_linear(st)
            betas.append(b); vars_.append(v)
        re = M.pool_reml_hk(np.array(betas), np.array(vars_))
        cf += re["lo"] <= 0.30 <= re["hi"]
        tot += 1
    assert cf / tot < 0.92          # selection bias is not corrected here
