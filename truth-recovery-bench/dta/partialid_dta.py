"""
partialid_dta.py -- Partial-identification bounds for the under-determined SROC.

The bivariate summary point (Se, Sp) is point-identified. But the clinically
useful question is often "what sensitivity does this test achieve at a chosen
specificity?" -- the operating point at a TARGET FPR away from the summary mean.
That requires the SROC slope, which is only weakly identified when there are few
studies or little threshold spread (Sigma is estimated from k points). Conditioning
on the plug-in slope and propagating only the mean's covariance gives an
over-confident interval that under-covers the true operating point.

The honest object is a Manski-style partial-identification bracket that hedges over
the SROC's irreducible ambiguity. Two pieces:

  1. The classic SROC regression-direction ambiguity (Rutter-Gatsonis): regressing
     logit Se on logit FPR gives slope b1 = Sigma_12/Sigma_22; the reverse
     regression gives b2 = Sigma_11/Sigma_12. The "true" RG / major-axis SROC lies
     between these two lines. We take the predicted logit Se at the target FPR
     under BOTH slopes (anchored at the summary point) as the bracket endpoints.
  2. The mean's own covariance, added as +/- z*sqrt(c' covMu c) around each endpoint.

When the slope is well identified (strong threshold spread, large k) the two
regression lines nearly coincide and the bracket collapses to the plug-in interval
-- no width cost. When it is weakly identified the bracket widens to restore
honest coverage of the true operating point. This is the DTA analogue of the NMA
partial-identification bound: zero cost where there is nothing to hedge, coverage
recovery where the estimand is genuinely under-determined.

Honest scope: this targets the SROC operating point. It does NOT correct
publication selection (a selection model is needed for that, out of scope here).
"""
from __future__ import annotations

import numpy as np

import dgp_dta as D
import methods_dta as M

_logit = M._logit
_expit = M._expit


def operating_point_plugin(fit, target_fpr, crit=M.Z975):
    """Plug-in SROC prediction of Se at a target FPR, with a mean-only CI.
    Returns (se_hat, lo, hi) on the probability (Se) scale."""
    lf = _logit(target_fpr)
    l_se = fit["sroc_intercept"] + fit["sroc_slope"] * lf
    # contrast on (logitSe, logitFPR) means: at FPR fixed to target, the predicted
    # logitSe moves with mu via the line anchored at the summary point:
    #   l_se = mu_se + slope*(lf - mu_fpr)  -> c = (1, -slope)
    c = np.array([1.0, -fit["sroc_slope"]])
    var = float(c @ fit["covMu"] @ c)
    se = np.sqrt(max(var, 0.0))
    return _expit(l_se), _expit(l_se - crit * se), _expit(l_se + crit * se)


def operating_point_partial_id(fit, target_fpr, crit=M.Z975):
    """Partial-ID bracket of Se at a target FPR: union of the two SROC
    regression-direction predictions, each widened by the mean covariance."""
    Sigma, covMu = fit["Sigma"], fit["covMu"]
    mu_se, mu_fpr = fit["mu"]
    lf = _logit(target_fpr)
    s12, s11, s22 = Sigma[0, 1], Sigma[0, 0], Sigma[1, 1]
    slopes = []
    if s22 > 0:
        slopes.append(s12 / s22)                 # regress logitSe on logitFPR
    if abs(s12) > 1e-8:
        slopes.append(s11 / s12)                 # reverse regression
    if not slopes:
        slopes = [fit["sroc_slope"]]
    los, his = [], []
    for b in slopes:
        l_se = mu_se + b * (lf - mu_fpr)
        c = np.array([1.0, -b])
        se = np.sqrt(max(float(c @ covMu @ c), 0.0))
        los.append(l_se - crit * se)
        his.append(l_se + crit * se)
    return _expit(np.mean([fit["sroc_intercept"] + fit["sroc_slope"] * lf])), \
        _expit(min(los)), _expit(max(his))


def true_se_at_fpr(truth, target_fpr):
    """True Se at a target FPR from the known generating SROC."""
    mu_se, mu_fpr = truth["mu"][0], truth["mu_logit_fpr"]
    b = truth["sroc_slope"]
    l_se = mu_se + b * (_logit(target_fpr) - mu_fpr)
    return _expit(l_se)


# ---------------------------------------------------------------------------
# Measured experiment
# ---------------------------------------------------------------------------
def run_experiment(reps=600, seed=20260615):
    """Coverage of the true operating point Se at a target FPR for the plug-in SROC
    interval vs the partial-ID bracket, across a ladder of study count k (slope
    identifiability) and threshold spread; the target FPR is shifted away from the
    summary mean so the SROC slope genuinely matters."""
    import hashlib

    def _h(s):
        return int.from_bytes(hashlib.sha256(s.encode()).digest()[:4], "big")

    out = {"reps": reps, "by_k": [], "by_thresh": []}
    se0, sp0 = 0.85, 0.80
    mu_fpr = _logit(1 - sp0)

    # (A) vary k at fixed moderate heterogeneity + threshold spread
    for k in (4, 6, 10, 20):
        cid = f"k{k}"
        ss = np.random.SeedSequence([seed, _h(cid)]).spawn(reps)
        cov = {"plugin": [], "PartialID": []}
        wid = {"plugin": [], "PartialID": []}
        n_conv = 0
        for rep in range(reps):
            rng = np.random.default_rng(ss[rep])
            rows, tr = D.generate(k, se0, sp0, 0.4, 0.4, -0.3, 0.5, "none", rng)
            fit = M.fit_bivariate(rows)
            n_conv += fit["converged"]
            # target a more specific cutpoint: FPR below the mean
            target_fpr = _expit(mu_fpr - 1.0)
            true_se = true_se_at_fpr(tr, target_fpr)
            _, lo, hi = operating_point_plugin(fit, target_fpr)
            cov["plugin"].append(lo <= true_se <= hi); wid["plugin"].append(hi - lo)
            _, lo, hi = operating_point_partial_id(fit, target_fpr)
            cov["PartialID"].append(lo <= true_se <= hi); wid["PartialID"].append(hi - lo)
        out["by_k"].append({"k": k, "conv_frac": n_conv / reps,
                            "coverage": {m: float(np.mean(v)) for m, v in cov.items()},
                            "width": {m: float(np.mean(v)) for m, v in wid.items()}})

    # (B) vary threshold spread at fixed k=8 (more spread -> slope better identified)
    for thresh in (0.0, 0.3, 0.6, 1.0):
        cid = f"thr{thresh}"
        ss = np.random.SeedSequence([seed, _h(cid)]).spawn(reps)
        cov = {"plugin": [], "PartialID": []}
        wid = {"plugin": [], "PartialID": []}
        for rep in range(reps):
            rng = np.random.default_rng(ss[rep])
            rows, tr = D.generate(8, se0, sp0, 0.3, 0.3, -0.3, thresh, "none", rng)
            fit = M.fit_bivariate(rows)
            target_fpr = _expit(mu_fpr - 1.0)
            true_se = true_se_at_fpr(tr, target_fpr)
            _, lo, hi = operating_point_plugin(fit, target_fpr)
            cov["plugin"].append(lo <= true_se <= hi); wid["plugin"].append(hi - lo)
            _, lo, hi = operating_point_partial_id(fit, target_fpr)
            cov["PartialID"].append(lo <= true_se <= hi); wid["PartialID"].append(hi - lo)
        out["by_thresh"].append({"thresh": thresh,
                                 "coverage": {m: float(np.mean(v)) for m, v in cov.items()},
                                 "width": {m: float(np.mean(v)) for m, v in wid.items()}})
    return out


if __name__ == "__main__":
    import json
    import os
    res = run_experiment()
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results_partialid.json")
    json.dump(res, open(p, "w"), indent=1)
    print(json.dumps(res, indent=1))
