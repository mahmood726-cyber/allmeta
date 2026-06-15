"""
Validation gate for the DTA truth-recovery harness.

Correctness contracts, not leaderboard numbers: the bivariate ML fit must match
mada::reitsma on the AuditC data; at tau=thresh=0 the RE fits reduce to the FE
pool and recover (Se0, Sp0); the naive independent fixed-effect pool must
under-cover badly under heterogeneity (the archaic-dta bug, reproduced) while the
bivariate + Hartung-Knapp intervals recover marginal AND joint coverage; the joint
region must be calibrated; the threshold-effect Spearman must rise with injected
threshold variation; and the partial-ID bracket must restore operating-point
coverage where the SROC slope is weakly identified. Reps are modest (seeded) so the
suite stays well under a minute.
"""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import dgp_dta as D
import methods_dta as M
import partialid_dta as P

# mada's AuditC dataset (14 studies, 2 with FN=0 -> +0.5 to all cells).
_TP = [47, 126, 19, 36, 130, 84, 68, 752, 59, 142, 137, 57, 34, 152]
_FN = [9, 51, 10, 3, 19, 2, 0, 0, 5, 50, 24, 3, 1, 51]
_FP = [101, 272, 12, 78, 211, 68, 112, 3226, 55, 571, 107, 103, 21, 88]
_TN = [738, 1543, 192, 276, 959, 89, 423, 2977, 136, 2788, 358, 437, 56, 264]
AUDITC = [{"tp": _TP[i], "fp": _FP[i], "fn": _FN[i], "tn": _TN[i]}
          for i in range(len(_TP))]


def _rng(i):
    return np.random.default_rng(10_000 + i)


def test_bivariate_matches_mada_reitsma():
    """Anchor: bivariate ML == mada::reitsma(method='ml') on AuditC (~1e-3)."""
    f = M.fit_bivariate(AUDITC)
    assert abs(f["mu"][0] - 2.07625908) < 1e-3
    assert abs(f["mu"][1] - (-1.26244709)) < 1e-3
    assert abs(f["Sigma"][0, 0] - 1.22384177) < 1e-3
    assert abs(f["Sigma"][0, 1] - 0.58323292) < 1e-3
    assert abs(f["Sigma"][1, 1] - 0.37488242) < 1e-3


def test_threshold_spearman_flags_auditc():
    """AuditC has a known threshold effect (Spearman well above 0.6)."""
    assert M.threshold_spearman(AUDITC) > 0.6


def test_re_reduces_to_fe_and_recovers_at_no_heterogeneity():
    """At tau=thresh=0 the bivariate/DL points equal the FE pool and recover truth."""
    se0, sp0 = 0.85, 0.80
    se_err, sp_err = [], []
    for r in range(120):
        rows, tr = D.generate(25, se0, sp0, 0.0, 0.0, 0.0, 0.0, "none", _rng(r))
        fe = M.pool_univariate_fe(rows)
        bv = M.fit_bivariate(rows)
        assert abs(bv["sens"] - fe["sens"]) < 0.03
        assert abs(bv["spec"] - fe["spec"]) < 0.03
        se_err.append(bv["sens"] - se0)
        sp_err.append(bv["spec"] - sp0)
    assert abs(np.mean(se_err)) < 0.01
    assert abs(np.mean(sp_err)) < 0.01


def test_naive_fe_undercovers_bivariate_recovers_under_heterogeneity():
    """The archaic-dta bug: independent FE pool collapses; bivariate/HK recover."""
    cse = {"NaiveFE": 0, "Bivariate": 0, "BivarHK": 0}
    cj = {"NaiveFE": 0, "Bivariate": 0, "BivarHK": 0}
    tot = 0
    se0, sp0 = 0.85, 0.80
    for r in range(250):
        rows, tr = D.generate(12, se0, sp0, 0.6, 0.6, -0.3, 0.3, "none", _rng(r))
        mu_true = np.array([tr["mu"][0], tr["mu_logit_fpr"]])
        fe = M.pool_univariate_fe(rows)
        bv = M.fit_bivariate(rows)
        hk = M.bivariate_hk(bv)
        lo, hi = M.margin_ci(fe["mu"][0], fe["se"][0] ** 2)
        cse["NaiveFE"] += lo <= se0 <= hi
        cj["NaiveFE"] += M.covers_point_joint(fe["mu"], np.diag(fe["se"] ** 2), mu_true)
        lo, hi = M.margin_ci(bv["mu"][0], bv["covMu"][0, 0])
        cse["Bivariate"] += lo <= se0 <= hi
        cj["Bivariate"] += M.covers_point_joint(bv["mu"], bv["covMu"], mu_true)
        lo, hi = M.margin_ci(bv["mu"][0], hk["covMu"][0, 0], crit=hk["crit"])
        cse["BivarHK"] += lo <= se0 <= hi
        cj["BivarHK"] += M.covers_point_joint(bv["mu"], hk["covMu"], mu_true, r2=hk["r2_joint"])
        tot += 1
    assert cse["NaiveFE"] / tot < 0.75          # marginal under-coverage
    assert cj["NaiveFE"] / tot < 0.45           # joint is even worse (correlation ignored)
    assert cse["Bivariate"] / tot > 0.85        # bivariate recovers margin
    assert cse["BivarHK"] / tot > 0.88          # HK at/above nominal
    assert cj["BivarHK"] / tot > 0.85           # joint recovers too


def test_joint_region_calibrated_at_no_heterogeneity():
    c = tot = 0
    se0, sp0 = 0.85, 0.80
    for r in range(250):
        rows, tr = D.generate(20, se0, sp0, 0.0, 0.0, 0.0, 0.0, "none", _rng(r))
        mu_true = np.array([tr["mu"][0], tr["mu_logit_fpr"]])
        bv = M.fit_bivariate(rows)
        c += M.covers_point_joint(bv["mu"], bv["covMu"], mu_true)
        tot += 1
    assert 0.90 <= c / tot <= 0.99


def test_threshold_spearman_rises_with_injected_threshold():
    lo = np.mean([M.threshold_spearman(
        D.generate(20, 0.85, 0.80, 0.3, 0.3, -0.3, 0.0, "none", _rng(r))[0])
        for r in range(60)])
    hi = np.mean([M.threshold_spearman(
        D.generate(20, 0.85, 0.80, 0.3, 0.3, -0.3, 1.0, "none", _rng(100 + r))[0])
        for r in range(60)])
    assert hi > lo + 0.2


def test_partialid_restores_operating_point_coverage():
    """Where the SROC slope is weakly identified (small k), the plug-in operating-
    point interval under-covers; the partial-ID bracket restores coverage."""
    cov = {"plugin": 0, "PartialID": 0}
    tot = 0
    se0, sp0 = 0.85, 0.80
    mu_fpr = M._logit(1 - sp0)
    for r in range(300):
        rows, tr = D.generate(5, se0, sp0, 0.4, 0.4, -0.3, 0.5, "none", _rng(r))
        fit = M.fit_bivariate(rows)
        target = M._expit(mu_fpr - 1.0)
        true_se = P.true_se_at_fpr(tr, target)
        _, lo, hi = P.operating_point_plugin(fit, target)
        cov["plugin"] += lo <= true_se <= hi
        _, lo, hi = P.operating_point_partial_id(fit, target)
        cov["PartialID"] += lo <= true_se <= hi
        tot += 1
    assert cov["PartialID"] / tot > cov["plugin"] / tot + 0.03


def test_selection_collapses_coverage_honest_negative():
    """Strong selection biases the summary operating point; the joint region's
    coverage of the true (Se,Sp) point drops below nominal (uncorrected boundary)."""
    cj = 0
    tot = 0
    for r in range(200):
        rows, tr = D.generate(15, 0.85, 0.80, 0.4, 0.4, -0.3, 0.3, "step_strong", _rng(r))
        bv = M.fit_bivariate(rows)
        mu_true = np.array([tr["mu"][0], tr["mu_logit_fpr"]])
        cj += M.covers_point_joint(bv["mu"], bv["covMu"], mu_true)
        tot += 1
    assert cj / tot < 0.92       # selection bias is not corrected here
