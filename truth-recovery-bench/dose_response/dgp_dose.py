"""
dgp_dose.py -- Known-truth data-generating process for DOSE-RESPONSE meta-analysis.

Each study i reports log relative-risks at several exposure DOSES d_{i1} < ... <
d_{iJ_i} relative to a reference dose (d=0, logRR=0 by definition). Because every
non-reference level is compared against the SAME reference group, the reported
log-RRs within a study are CORRELATED -- the Greenland-Longnecker covariance:

    Var(logRR_j)        = 1/a_j + 1/a_0
    Cov(logRR_j, logRR_k) = 1/a_0           (shared reference cases a_0)

The truth is a dose-response curve g(d). We support:
  * linear     g(d) = beta * d                      (true slope beta on log-RR scale)
  * quadratic  g(d) = beta * d + gamma * d^2         (a nonlinear curve a linear
                                                      model misspecifies)

On top of the truth we inject, independently and at known magnitude:
  * between-study heterogeneity tau2 -- a study-specific random slope
        beta_i = beta + N(0, tau2) (and, for quadratic, a shared random curve scale)
  * publication selection scenario   -- per-study selection on the one-sided
        significance of the study's fitted slope (reusing the step/copas mechanisms).

Per study we draw a reference-cases count a_0 and per-dose cases a_j, build the GL
covariance C_i, set the true mean vector mu_i = g_i(d) at the non-reference doses,
and draw observed log-RRs y_i ~ MVN(mu_i, C_i). This is exactly the aggregate-data
input a two-stage dose-response MA (Greenland-Longnecker / Crippa) consumes.

Everything is seeded -> reproducible. Truth-first: the true beta (and gamma), the
true curve, and the per-study doses/covariances are returned alongside the data.

Reproduced bug (dose-response-pro): the two-stage pool's DerSimonian-Laird tau2
collapses to ~0 under GL-correlated slopes with few studies, so the pooled-slope CI
shrinks to fixed-effect width and slope coverage craters (~0.06 in the worst cell).
The honest lever is REML tau2 + a Knapp-Hartung t-interval.
"""
from __future__ import annotations

import numpy as np

SCENARIOS = ["none", "step_weak", "step_strong", "copas_weak", "copas_strong"]
CURVES = ["linear", "quadratic"]

_STEP_CUTS = np.array([0.025, 0.05])
_STEP_WEIGHTS = {"weak": np.array([1.0, 0.75, 0.55]),
                 "strong": np.array([1.0, 0.35, 0.10])}
_COPAS = {"weak": {"g0": -0.10, "g1": 0.12, "rho": 0.50},
          "strong": {"g0": -0.20, "g1": 0.12, "rho": 0.90}}

# dose pool (non-reference levels); each study samples a subset
_DOSE_POOL = np.array([1.0, 2.0, 3.0, 4.0, 5.0])


def _step_weight(p_one, weights):
    if p_one < _STEP_CUTS[0]:
        return weights[0]
    if p_one < _STEP_CUTS[1]:
        return weights[1]
    return weights[2]


def _curve(d, beta, gamma, curve):
    if curve == "linear":
        return beta * d
    return beta * d + gamma * d * d


def _gl_cov(a0, a):
    """Greenland-Longnecker covariance of the non-reference log-RRs."""
    J = len(a)
    C = np.full((J, J), 1.0 / a0)
    for j in range(J):
        C[j, j] = 1.0 / a[j] + 1.0 / a0
    return C


def _stage1_slope(y, d, C):
    """Linear GLS slope through the origin: beta = (d' Cinv y)/(d' Cinv d)."""
    Cinv = np.linalg.pinv(C)
    denom = float(d @ Cinv @ d)
    if denom <= 0:
        return np.nan, np.nan
    beta = float(d @ Cinv @ y) / denom
    var = 1.0 / denom
    return beta, var


def generate(k, beta, gamma, tau2, curve, scenario, rng,
             n_doses_lo=2, n_doses_hi=4, a0_lo=40, a0_hi=300,
             aj_lo=15, aj_hi=200, max_factor=60):
    """Generate one known-truth dose-response dataset.

    Returns (studies, truth):
      studies : list of dicts {d (J,), y (J,), C (J,J), a0, a (J,)}
      truth   : dict with beta, gamma, curve, tau2, k, degenerate, sel_frac
    """
    sd = np.sqrt(tau2)
    is_none = scenario == "none"
    kind = "weak" if scenario.endswith("weak") else "strong"
    is_step = scenario.startswith("step")
    weights = _STEP_WEIGHTS[kind] if is_step else None
    cp = None if is_step else _COPAS[kind]

    studies = []
    n_examined = 0
    degenerate = False
    cap = max_factor * k
    kept = 0

    def _draw_study():
        J = int(rng.integers(n_doses_lo, n_doses_hi + 1))
        d = np.sort(rng.choice(_DOSE_POOL, size=min(J, len(_DOSE_POOL)),
                               replace=False))
        a0 = int(np.exp(np.log(a0_lo) + (np.log(a0_hi) - np.log(a0_lo)) * rng.random()))
        a = np.array([int(np.exp(np.log(aj_lo) + (np.log(aj_hi) - np.log(aj_lo)) * rng.random()))
                      for _ in d])
        C = _gl_cov(a0, a)
        beta_i = beta + sd * rng.standard_normal()
        mu = _curve(d, beta_i, gamma, curve)
        L = np.linalg.cholesky(C + 1e-10 * np.eye(len(d)))
        y = mu + L @ rng.standard_normal(len(d))
        return {"d": d, "y": y, "C": C, "a0": a0, "a": a}

    while kept < k and n_examined < cap:
        st = _draw_study()
        n_examined += 1
        b_hat, v = _stage1_slope(st["y"], st["d"], st["C"])
        if not np.isfinite(b_hat) or not np.isfinite(v) or v <= 0:
            continue
        z = b_hat / np.sqrt(v)
        if is_none:
            publish = True
        elif is_step:
            from scipy.stats import norm
            p_one = 1.0 - norm.cdf(z)
            publish = rng.random() < _step_weight(p_one, weights)
        else:
            dlat = (cp["rho"] * np.tanh(z / 3.0)
                    + np.sqrt(1 - cp["rho"] ** 2) * rng.standard_normal())
            zsel = cp["g0"] + cp["g1"] * abs(z) + dlat
            publish = zsel > 0
        if publish:
            studies.append(st)
            kept += 1

    if kept < k:
        degenerate = True
        while kept < k:
            studies.append(_draw_study())
            kept += 1

    truth = {"beta": beta, "gamma": gamma, "curve": curve, "tau2": tau2,
             "k": k, "degenerate": degenerate,
             "sel_frac": (k / max(1, n_examined)) if not is_none else 1.0}
    return studies, truth
