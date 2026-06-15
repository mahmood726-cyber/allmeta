"""
bayes_nma.py -- Bounded BUGS-style Bayesian NMA (normal-normal hierarchical
random-effects consistency model), the Bayesian comparator for the harness.

This is the canonical WinBUGS / multinma normal-likelihood model:

    y_s    ~ N(theta_s, v_s)                 (observed contrast, known variance)
    theta_s ~ N(X_s . d, tau2)               (study random effect, common tau2)
    d      ~ N(0, 100^2)   (vague)           (basic parameters)
    tau2   ~ Inverse-Gamma(eps, eps)         (vague, the classic BUGS choice)

Sampled with a fully-conjugate Gibbs sweep (theta | d,tau2 ; d | theta,tau2 ;
tau2 | theta,d) so it is fast and dependency-free -- no Stan/JAGS needed, which
keeps the harness compute-bounded. It is a faithful stand-in for the Bayesian
random-effects NMA a reviewer would run, and lets us score CrI coverage of the
true relative effects and the POSTERIOR P(treatment best) -- the Bayesian
ranking object whose over-confidence we want to measure honestly.

Returns posterior summaries; seeded by the passed numpy Generator.
"""
from __future__ import annotations

import numpy as np

from methods_nma import design, _contrast_vec


def gibbs_nma(studies, T, rng, n_iter=1500, burn=500, prior_var=1.0e4,
              ig_eps=1.0e-3, higher_better=True):
    """Run the Gibbs sampler. Returns dict with posterior draws of d and derived
    contrast CrIs / ranking probabilities."""
    X, y, v = design(studies, T)
    N, p = X.shape
    inv_v = 1.0 / v
    XtX = X.T @ X
    prior_prec = np.eye(p) / prior_var

    # init
    d = np.linalg.lstsq(X, y, rcond=None)[0]
    theta = y.copy()
    tau2 = max(1e-3, np.var(y - X @ d))

    draws = np.empty((n_iter - burn, p))
    keep = 0
    for it in range(n_iter):
        # theta_s | d, tau2, y  (conjugate normal)
        mu_x = X @ d
        prec = inv_v + 1.0 / tau2
        mean = (y * inv_v + mu_x / tau2) / prec
        theta = mean + rng.standard_normal(N) / np.sqrt(prec)
        # d | theta, tau2  (GLS posterior with W = 1/tau2)
        prec_d = XtX / tau2 + prior_prec
        cov_d = np.linalg.inv(prec_d)
        mean_d = cov_d @ (X.T @ theta) / tau2
        L = np.linalg.cholesky(cov_d + 1e-12 * np.eye(p))
        d = mean_d + L @ rng.standard_normal(p)
        # tau2 | theta, d  (conjugate Inverse-Gamma)
        r = theta - X @ d
        a_post = ig_eps + N / 2.0
        b_post = ig_eps + 0.5 * float(r @ r)
        tau2 = 1.0 / rng.gamma(a_post, 1.0 / b_post)
        if it >= burn:
            draws[keep] = d
            keep += 1

    full = np.concatenate([np.zeros((draws.shape[0], 1)), draws], axis=1)
    sgn = full if higher_better else -full
    best_draw = np.argmax(sgn, axis=1)
    p_best = np.array([(best_draw == i).mean() for i in range(T)])
    # ranks (1 = best)
    order = np.argsort(-sgn, axis=1)
    ranks = np.empty_like(order)
    rows = np.arange(draws.shape[0])[:, None]
    ranks[rows, order] = np.arange(1, T + 1)[None, :]
    sucra = ((T - ranks).mean(axis=0)) / (T - 1)

    post_mean = draws.mean(axis=0)
    best = int(np.argmax(np.concatenate([[0.0], post_mean]) * (1 if higher_better else -1)))
    return {"draws": draws, "full": full, "dhat": post_mean,
            "p_best": p_best, "sucra": sucra, "best": best,
            "p_best_of_best": float(p_best[best]), "T": T}


def contrast_cri(res, a, b):
    """95% credible interval for relative effect b vs a from posterior draws."""
    c = _contrast_vec(a, b, res["T"])
    vals = res["draws"] @ c
    est = float(np.median(vals))
    lo, hi = np.percentile(vals, [2.5, 97.5])
    return est, float(lo), float(hi)
