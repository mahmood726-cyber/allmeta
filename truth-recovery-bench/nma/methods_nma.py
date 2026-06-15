"""
methods_nma.py -- Standard NMA toolbox + truth-recovery network methods.

All estimators operate on a list of two-arm studies [{a,b,y,v}, ...] over
treatments 0..T-1 (0 = reference) and target the CONSISTENCY-model basic
parameters d = (d_01,...,d_0,T-1), from which every relative effect d_ab is
d_0b - d_0a. This is the frequentist contrast-synthesis (Lu-Ades) NMA that
netmeta computes; the graph-theoretic netmeta estimator is algebraically
identical under the same likelihood.

Methods provided
----------------
fit_consistency(studies, T, re=...)        -> fitted object (dhat, Cov, tau2, Q...)
  * FE  (re=False): W = 1/v.  Reproduces the LivingNMA / enma-snma FE-CI bug
                    (tau2 ignored in the CI) -> the "naive incumbent".
  * RE  (re=True) : W = 1/(v+tau2), network DerSimonian-Laird tau2.  Proper.
network_hk(fit)   -> Hartung-Knapp-style honest-coverage covariance + t crit.
inconsistency_test(studies, T, honest=...) -> global design-by-treatment Q-test.
  * honest=True : common-tau2 RE weights -> calibrated under heterogeneity.
  * honest=False: FE weights -> the tau2-ignoring over-detector (sheaf-nma).
ranking(dhat, Cov, rng, ...) -> P-score (analytic) + sampled SUCRA + P(best).

Validation targets (tests/test_nma.py): at tau2=0 the RE fit equals FE and
recovers d to O(1/sqrt(N)); network DL tau2 recovers injected tau2; the honest
inconsistency test holds type-I ~alpha under heterogeneity while the naive one
explodes; rankings concentrate on the true best as information grows.
"""
from __future__ import annotations

import numpy as np
from scipy import stats

np.seterr(all="ignore")

Z975 = stats.norm.ppf(0.975)


# ---------------------------------------------------------------------------
# Design matrix
# ---------------------------------------------------------------------------
def design(studies, T):
    """X (N x T-1), y (N), v (N). Column j (0-based) is basic param d_0,(j+1)."""
    N = len(studies)
    X = np.zeros((N, T - 1))
    y = np.zeros(N)
    v = np.zeros(N)
    for s, st in enumerate(studies):
        a, b = st["a"], st["b"]
        if b != 0:
            X[s, b - 1] += 1.0
        if a != 0:
            X[s, a - 1] -= 1.0
        y[s] = st["y"]
        v[s] = st["v"]
    return X, y, v


def _gls(X, W_diag, y):
    """Weighted least squares. Returns (dhat, A_inv) with A = X' W X."""
    XtW = X.T * W_diag                      # (p, N)
    A = XtW @ X
    A_inv = np.linalg.pinv(A)
    dhat = A_inv @ (XtW @ y)
    return dhat, A_inv


def _network_dl_tau2(X, y, v):
    """Generalized (multivariate) DerSimonian-Laird moment estimator of the common
    between-study tau2 for a contrast-synthesis NMA (Jackson-White-Riley 2010)."""
    p = X.shape[1]
    N = X.shape[0]
    df = N - p
    if df <= 0:
        return 0.0, 0.0, df
    W = 1.0 / v
    dhat, A_inv = _gls(X, W, y)
    e = y - X @ dhat
    Q = float(np.sum(W * e * e))
    # C = tr(W) - tr[ A_inv X' W^2 X ]
    XtW2X = (X.T * (W * W)) @ X
    C = float(np.sum(W) - np.trace(A_inv @ XtW2X))
    tau2 = max(0.0, (Q - df) / C) if C > 0 else 0.0
    return tau2, Q, df


# ---------------------------------------------------------------------------
# Consistency-model fit (the core NMA)
# ---------------------------------------------------------------------------
def fit_consistency(studies, T, re=True):
    """Fit the consistency NMA. re=False -> fixed-effect (naive incumbent: tau2
    ignored in the CI). re=True -> random-effects with network DL tau2 and the
    correct RE covariance A_RE^{-1}."""
    X, y, v = design(studies, T)
    N, p = X.shape
    tau2, Q_fe, df = _network_dl_tau2(X, y, v)
    if re:
        W = 1.0 / (v + tau2)
    else:
        tau2 = 0.0
        W = 1.0 / v
    dhat, A_inv = _gls(X, W, y)
    e = y - X @ dhat
    Q_resid = float(np.sum(W * e * e))
    return {"dhat": dhat, "Cov": A_inv, "tau2": tau2, "Q_resid": Q_resid,
            "df": N - p, "N": N, "p": p, "T": T, "re": re,
            "X": X, "y": y, "v": v, "W": W}


def network_hk(fit):
    """Hartung-Knapp-style honest-coverage scaling of the RE covariance.
    H = (e' W e)/df  with floor max(1, H); critical value t_{df}. The multivariate
    analog of the pairwise HKSJ floor that fixed proportionma / LivingNMA."""
    df = max(1, fit["df"])
    H = fit["Q_resid"] / df
    H = max(1.0, H)
    crit = stats.t.ppf(0.975, df)
    return {"Cov": H * fit["Cov"], "crit": crit, "H": H, "df": df}


# ---------------------------------------------------------------------------
# Relative-effect inference for a single contrast (a,b)
# ---------------------------------------------------------------------------
def _contrast_vec(a, b, T):
    c = np.zeros(T - 1)
    if b != 0:
        c[b - 1] += 1.0
    if a != 0:
        c[a - 1] -= 1.0
    return c


def contrast_ci(fit, a, b, Cov=None, crit=Z975):
    """Estimate and CI for the relative effect of b vs a from a fit (or override
    covariance / critical value, e.g. the network-HK ones)."""
    Cov = fit["Cov"] if Cov is None else Cov
    c = _contrast_vec(a, b, fit["T"])
    est = float(c @ fit["dhat"])
    var = float(c @ Cov @ c)
    se = np.sqrt(max(var, 0.0))
    return est, est - crit * se, est + crit * se, se


# ---------------------------------------------------------------------------
# Global inconsistency test (design-by-treatment / generalized Bucher)
# ---------------------------------------------------------------------------
def inconsistency_test(studies, T, honest=True):
    """Global inconsistency test. Compares the consistency-model fit (each edge
    constrained to satisfy consistency) against the saturated design model (each
    edge free). Q_inc = RSS_consistency - RSS_saturated ~ chi2_{#loops}.

    honest=True uses a COMMON RE tau2 (v+tau2) in both fits -> calibrated under
    heterogeneity. honest=False uses FE weights (1/v) -> ignores tau2 and
    over-rejects on consistent-but-heterogeneous networks (the sheaf-nma /
    enma-snma failure mode, reproduced here for contrast)."""
    X, y, v = design(studies, T)
    N, p = X.shape
    edges = sorted(set((st["a"], st["b"]) for st in studies))
    df_inc = len(edges) - p          # cycle rank = number of independent loops
    if df_inc <= 0:
        return {"Q": np.nan, "df": 0, "p_value": np.nan, "testable": False}

    if honest:
        tau2, _, _ = _network_dl_tau2(X, y, v)
    else:
        tau2 = 0.0
    W = 1.0 / (v + tau2)

    # consistency fit residuals
    dhat, _ = _gls(X, W, y)
    e_c = y - X @ dhat
    RSS_c = float(np.sum(W * e_c * e_c))

    # saturated: each edge floats to its own RE-weighted mean
    RSS_s = 0.0
    edge_of = {e: i for i, e in enumerate(edges)}
    idx = np.array([edge_of[(st["a"], st["b"])] for st in studies])
    for i in range(len(edges)):
        m = idx == i
        wi = W[m]
        ybar = float(np.sum(wi * y[m]) / np.sum(wi))
        RSS_s += float(np.sum(wi * (y[m] - ybar) ** 2))

    Q = max(0.0, RSS_c - RSS_s)
    pval = float(stats.chi2.sf(Q, df_inc))
    return {"Q": Q, "df": df_inc, "p_value": pval, "testable": True,
            "tau2": tau2}


# ---------------------------------------------------------------------------
# Rankings
# ---------------------------------------------------------------------------
def _full_d(dhat, T):
    """Prepend reference d_00 = 0."""
    return np.concatenate([[0.0], dhat])


def pscore(dhat, Cov, T, higher_better=True):
    """Rucker-Schwarzer analytic P-score (frequentist SUCRA analogue).
    P-score_i = mean_{j!=i} P(treatment i better than j)."""
    d = _full_d(dhat, T)
    # full covariance over all T treatments (reference has 0 variance)
    Cf = np.zeros((T, T))
    Cf[1:, 1:] = Cov
    P = np.zeros(T)
    for i in range(T):
        acc = 0.0
        for j in range(T):
            if i == j:
                continue
            diff = d[i] - d[j]
            var = Cf[i, i] + Cf[j, j] - 2 * Cf[i, j]
            se = np.sqrt(max(var, 1e-12))
            # P(i better than j): if higher_better, P(d_i > d_j)
            z = diff / se if higher_better else -diff / se
            acc += stats.norm.cdf(z)
        P[i] = acc / (T - 1)
    return P


def ranking(dhat, Cov, T, rng, n_draw=2000, higher_better=True):
    """Monte-Carlo ranking distribution from MVN(dhat, Cov).
    Returns dict: sucra (T,), p_best (T,), best (argmax point), p_best_of_best."""
    d = _full_d(dhat, T)
    Cf = np.zeros((T, T))
    Cf[1:, 1:] = Cov
    # symmetric PSD draw
    try:
        L = np.linalg.cholesky(Cf[1:, 1:] + 1e-10 * np.eye(T - 1))
        draws = dhat[None, :] + (rng.standard_normal((n_draw, T - 1)) @ L.T)
    except np.linalg.LinAlgError:
        draws = rng.multivariate_normal(dhat, Cov, size=n_draw)
    full = np.concatenate([np.zeros((n_draw, 1)), draws], axis=1)
    if not higher_better:
        full = -full
    # rank: 1 = best (largest). ranks via argsort of -full
    order = np.argsort(-full, axis=1)
    ranks = np.empty_like(order)
    rows = np.arange(n_draw)[:, None]
    ranks[rows, order] = np.arange(1, T + 1)[None, :]
    sucra = ((T - ranks).mean(axis=0)) / (T - 1)
    best_draw = np.argmax(full, axis=1)
    p_best = np.array([(best_draw == i).mean() for i in range(T)])
    pt = _full_d(dhat, T)
    best = int(np.argmax(pt if higher_better else -pt))
    return {"sucra": sucra, "p_best": p_best, "best": best,
            "p_best_of_best": float(p_best[best])}
