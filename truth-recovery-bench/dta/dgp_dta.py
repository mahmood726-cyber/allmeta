"""
dgp_dta.py -- Known-truth data-generating process for DIAGNOSTIC TEST ACCURACY.

A DTA meta-analysis pools 2x2 tables (TP, FP, FN, TN) from k studies, each
reporting a test's sensitivity Se = TP/(TP+FN) and specificity Sp = TN/(TN+FP).
The truth is a summary operating point (Se0, Sp0). On top of that truth we inject,
independently and at known magnitude:

  * between-study heterogeneity  (tau_Se, tau_Sp)  -- bivariate-normal random
        effects on the (logit Se, logit Sp) scale, with a Se-Sp correlation rho.
  * threshold variation          (thresh)          -- a per-study latent positivity
        threshold shift s_i that raises logit Se and lowers logit Sp by the SAME
        amount: lowering the cutpoint catches more true positives (Se up) at the
        cost of more false positives (Sp down). This is the mechanism that makes
        Se and Sp NEGATIVELY correlated across studies and that traces out the
        SROC curve -- the thing a single pooled (Se,Sp) point cannot represent.
  * publication selection        (scenario)        -- per-study selection on the
        one-sided significance of the log diagnostic odds ratio, reusing the
        pairwise/NMA step + copas mechanisms (Deeks' small-study effect).

Per study i we draw disease-group size n1_i and non-diseased size n0_i, then
  Se_i = expit(logit Se0 + u_Se_i + s_i),  Sp_i = expit(logit Sp0 + u_Sp_i - s_i),
  TP_i ~ Binom(n1_i, Se_i),  FP_i ~ Binom(n0_i, 1 - Sp_i),
with (u_Se, u_Sp) ~ BVN(0, Sigma_b), s_i ~ N(0, thresh^2).

Everything is seeded (numpy Generator) -> fully reproducible. Truth-first: the
true (Se0, Sp0), the true logit means, Sigma_b, thresh and the implied true SROC
slope are returned alongside the data so no harness ever hand-enters a target.

The reproduced bug this bench targets (archaic-dta): naive INDEPENDENT
fixed-effect pooling of logit Se and logit Sp has no tau^2 and ignores the Se-Sp
correlation, so its interval collapses to within-study width and under-covers
catastrophically (75% -> 20-25%) as tau and threshold variation rise. The honest
lever is the bivariate random-effects (Reitsma) model with a proper between-study
covariance + a Hartung-Knapp-style finite-sample widening.
"""
from __future__ import annotations

import numpy as np

# Selection scenarios reused (in spirit) from the pairwise / NMA bench dgp.
SCENARIOS = ["none", "step_weak", "step_strong", "copas_weak", "copas_strong"]

_STEP_CUTS = np.array([0.025, 0.05])
_STEP_WEIGHTS = {"weak": np.array([1.0, 0.75, 0.55]),
                 "strong": np.array([1.0, 0.35, 0.10])}
_COPAS = {"weak": {"g0": -0.10, "g1": 0.12, "rho": 0.50},
          "strong": {"g0": -0.20, "g1": 0.12, "rho": 0.90}}


def _logit(p):
    return np.log(p / (1.0 - p))


def _expit(x):
    return 1.0 / (1.0 + np.exp(-x))


def _step_weight(p_one, weights):
    if p_one < _STEP_CUTS[0]:
        return weights[0]
    if p_one < _STEP_CUTS[1]:
        return weights[1]
    return weights[2]


def _draw_n(rng, lo, hi):
    """Log-uniform integer group size."""
    return int(round(np.exp(np.log(lo) + (np.log(hi) - np.log(lo)) * rng.random())))


def _ln_dor_z(tp, fp, fn, tn):
    """One-sided z for H0: lnDOR <= 0, with 0.5 correction on the 2x2 used."""
    a, b, c, d = tp + 0.5, fp + 0.5, fn + 0.5, tn + 0.5
    lndor = np.log((a * d) / (b * c))
    se = np.sqrt(1 / a + 1 / b + 1 / c + 1 / d)
    return lndor / se, lndor, se


def generate(k, se0, sp0, tau_se, tau_sp, rho, thresh, scenario, rng,
             n_lo=30, n_hi=300, max_factor=60):
    """Generate one known-truth DTA dataset.

    Returns (rows, truth) where:
      rows  : list of dicts {tp, fp, fn, tn, n1, n0}
      truth : dict with se0, sp0, mu (logit Se0, logit Sp0), Sigma_b,
              tau_se, tau_sp, rho, thresh, sroc_slope (true, on logitSe~logitFPR),
              k, degenerate, sel_frac
    """
    mu_se, mu_sp = _logit(se0), _logit(sp0)
    # between-study covariance on (logit Se, logit Sp)
    cov = rho * tau_se * tau_sp
    Sigma_b = np.array([[tau_se ** 2, cov], [cov, tau_sp ** 2]])
    # PSD guard (rho in (-1,1) keeps it PD unless tau=0)
    if tau_se > 0 and tau_sp > 0:
        L = np.linalg.cholesky(Sigma_b + 1e-12 * np.eye(2))
    else:
        L = np.array([[tau_se, 0.0], [0.0, tau_sp]])

    is_none = scenario == "none"
    kind = "weak" if scenario.endswith("weak") else "strong"
    is_step = scenario.startswith("step")
    weights = _STEP_WEIGHTS[kind] if is_step else None
    cp = None if is_step else _COPAS[kind]

    rows = []
    n_examined = 0
    degenerate = False
    cap = max_factor * k
    kept = 0
    while kept < k and n_examined < cap:
        n1 = _draw_n(rng, n_lo, n_hi)
        n0 = _draw_n(rng, n_lo, n_hi)
        u = L @ rng.standard_normal(2)
        s = thresh * rng.standard_normal()
        se_i = _expit(mu_se + u[0] + s)
        sp_i = _expit(mu_sp + u[1] - s)
        tp = int(rng.binomial(n1, se_i))
        fp = int(rng.binomial(n0, 1 - sp_i))
        fn, tn = n1 - tp, n0 - fp
        n_examined += 1
        z, _, _ = _ln_dor_z(tp, fp, fn, tn)
        if is_none:
            publish = True
        elif is_step:
            from scipy.stats import norm
            p_one = 1.0 - norm.cdf(z)
            publish = rng.random() < _step_weight(p_one, weights)
        else:
            # copas: latent selection correlated with the study's accuracy signal
            eps = z  # standardized accuracy as the selection driver
            dlat = (cp["rho"] * np.tanh(eps / 3.0)
                    + np.sqrt(1 - cp["rho"] ** 2) * rng.standard_normal())
            zsel = cp["g0"] + cp["g1"] * np.sqrt((n1 + n0) / 100.0) + dlat
            publish = zsel > 0
        if publish:
            rows.append({"tp": tp, "fp": fp, "fn": fn, "tn": tn, "n1": n1, "n0": n0})
            kept += 1

    if kept < k:
        degenerate = True
        while kept < k:
            n1 = _draw_n(rng, n_lo, n_hi)
            n0 = _draw_n(rng, n_lo, n_hi)
            u = L @ rng.standard_normal(2)
            s = thresh * rng.standard_normal()
            se_i = _expit(mu_se + u[0] + s)
            sp_i = _expit(mu_sp + u[1] - s)
            tp = int(rng.binomial(n1, se_i))
            fp = int(rng.binomial(n0, 1 - sp_i))
            rows.append({"tp": tp, "fp": fp, "fn": n1 - tp, "tn": n0 - fp,
                         "n1": n1, "n0": n0})
            kept += 1

    # true SROC slope on the (logit Se, logit FPR) scale used by the Reitsma fit.
    # logit FPR = logit(1 - Sp); its between-study variance/cov flip the Sp sign.
    # Cov(logitSe, logitFPR) = -Cov(logitSe, logitSp); Var(logitFPR)=Var(logitSp).
    # plus the threshold component (+s on Se, -s on Sp -> +s on FPR): shared +thresh^2.
    var_se = tau_se ** 2 + thresh ** 2
    var_fpr = tau_sp ** 2 + thresh ** 2
    cov_se_fpr = -cov + thresh ** 2
    sroc_slope = cov_se_fpr / var_fpr if var_fpr > 0 else 0.0

    truth = {
        "se0": se0, "sp0": sp0, "mu": np.array([mu_se, mu_sp]),
        "mu_logit_fpr": _logit(1 - sp0),
        "Sigma_b": Sigma_b, "tau_se": tau_se, "tau_sp": tau_sp, "rho": rho,
        "thresh": thresh, "sroc_slope": sroc_slope,
        "var_logit_se": var_se, "var_logit_fpr": var_fpr,
        "k": k, "degenerate": degenerate,
        "sel_frac": (k / max(1, n_examined)) if not is_none else 1.0,
    }
    return rows, truth
