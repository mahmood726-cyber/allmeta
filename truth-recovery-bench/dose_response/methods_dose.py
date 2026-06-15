"""
methods_dose.py -- Standard dose-response MA toolbox + truth-recovery pooling.

Each study i carries {d (J,), y (J,), C (J,J)} where y are non-reference log-RRs,
d the doses, C the Greenland-Longnecker within-study covariance (shared reference
-> off-diagonal 1/a_0). Two analysis stages:

STAGE 1 (per study, GLS through the origin -- logRR(0)=0):
  stage1_linear(study) -> (beta_i, var_i)         linear slope on log-RR per dose
  stage1_quad(study)   -> (coef (2,), Cov (2,2))  [beta1, beta2] for g(d)=b1 d + b2 d^2
    (needs >=2 distinct doses; falls back to linear with a 0 quad term otherwise)

STAGE 2 (pool across studies):
  pool_dl(betas, vars)      -> THE BUG: DerSimonian-Laird tau2 + z (qnorm) interval.
        Under GL-correlated slopes with few studies DL tau2 collapses to ~0, the CI
        shrinks to fixed-effect width, and slope coverage craters (dose-response-pro).
  pool_reml_hk(betas, vars) -> REML tau2 + Knapp-Hartung t interval (the lever):
        REML resists the tau2->0 collapse and the HKSJ floor + t_{k-1} restore
        honest coverage. (advanced-stats rules: HKSJ floor max(1, Q/(k-1)); df=k-1.)
  pool_mv_reml(coefs, Covs) -> multivariate REML pool of the quadratic coefficient
        vectors (Cholesky-parameterised between-study T2, GLS mean, Nelder-Mead),
        with a Hartung-Knapp widening -> honest coverage of the CURVE.

ONE-STAGE (random-slope linear mixed model over all dose points):
  one_stage_linear(studies) -> (B, var_B, tau2) profiling the REML log-likelihood
        of y_i ~ MVN(B*d_i, C_i + tau2 d_i d_i') over tau2, GLS for B, KH interval.

Validation targets (tests/test_dose.py): at tau2=0 RE reduces to FE and recovers
beta; REML recovers injected tau2 where DL collapses; DL slope coverage craters
under heterogeneity while REML+HK and one-stage recover; the linear fit is biased
for a quadratic truth (curve coverage fails) while the quadratic multivariate pool
recovers; selection collapses coverage (honest negative).
"""
from __future__ import annotations

import numpy as np
from scipy import optimize, stats

np.seterr(all="ignore")

Z975 = stats.norm.ppf(0.975)


# ---------------------------------------------------------------------------
# Stage 1: per-study GLS
# ---------------------------------------------------------------------------
def stage1_linear(study):
    d, y, C = study["d"], study["y"], study["C"]
    Cinv = np.linalg.pinv(C)
    denom = float(d @ Cinv @ d)
    if denom <= 0:
        return np.nan, np.nan
    beta = float(d @ Cinv @ y) / denom
    return beta, 1.0 / denom


def stage1_quad(study):
    """GLS for [b1,b2] in y = b1 d + b2 d^2. Returns (coef (2,), Cov (2,2))."""
    d, y, C = study["d"], study["y"], study["C"]
    X = np.column_stack([d, d * d])
    Cinv = np.linalg.pinv(C)
    A = X.T @ Cinv @ X
    if np.linalg.matrix_rank(A) < 2:
        b, v = stage1_linear(study)
        return np.array([b, 0.0]), np.array([[v, 0.0], [0.0, 1e6]])
    Ainv = np.linalg.inv(A)
    coef = Ainv @ (X.T @ Cinv @ y)
    return coef, Ainv


# ---------------------------------------------------------------------------
# Stage 2: scalar slope pooling
# ---------------------------------------------------------------------------
def _dl_tau2(betas, vars_):
    k = len(betas)
    w = 1.0 / vars_
    mu = np.sum(w * betas) / np.sum(w)
    Q = float(np.sum(w * (betas - mu) ** 2))
    C = np.sum(w) - np.sum(w ** 2) / np.sum(w)
    return max(0.0, (Q - (k - 1)) / C) if C > 0 else 0.0, Q


def pool_fe(betas, vars_):
    """Fixed-effect inverse-variance pool + z interval. The incumbent that ignores
    between-study heterogeneity entirely (tau2 == 0 by construction): slope coverage
    collapses as soon as the slope is heterogeneous (the dose-response-pro failure in
    its starkest form -- the analogue of NaiveFE in the NMA / DTA benches)."""
    betas, vars_ = np.asarray(betas, float), np.asarray(vars_, float)
    w = 1.0 / vars_
    mu = np.sum(w * betas) / np.sum(w)
    se = np.sqrt(1.0 / np.sum(w))
    return {"mu": float(mu), "se": float(se), "tau2": 0.0,
            "lo": float(mu - Z975 * se), "hi": float(mu + Z975 * se), "crit": Z975}


def pool_dl(betas, vars_):
    """DerSimonian-Laird RE + z interval. THE BUG (tau2->0 collapse + qnorm)."""
    betas, vars_ = np.asarray(betas, float), np.asarray(vars_, float)
    tau2, Q = _dl_tau2(betas, vars_)
    w = 1.0 / (vars_ + tau2)
    mu = np.sum(w * betas) / np.sum(w)
    se = np.sqrt(1.0 / np.sum(w))
    return {"mu": float(mu), "se": float(se), "tau2": float(tau2),
            "lo": float(mu - Z975 * se), "hi": float(mu + Z975 * se), "crit": Z975}


def _reml_tau2(betas, vars_, t2_max=None):
    """REML tau2 by 1-D maximisation of the RE-MA restricted log-likelihood."""
    betas, vars_ = np.asarray(betas, float), np.asarray(vars_, float)
    k = len(betas)
    if t2_max is None:
        t2_max = max(1e-6, 10 * np.var(betas) + np.mean(vars_) * 10 + 1.0)

    def neg_reml(t2):
        w = 1.0 / (vars_ + t2)
        sw = np.sum(w)
        mu = np.sum(w * betas) / sw
        rss = np.sum(w * (betas - mu) ** 2)
        # REML log-lik (up to const): -.5*sum ln(v+t2) -.5*ln(sum w) -.5*rss
        return 0.5 * np.sum(np.log(vars_ + t2)) + 0.5 * np.log(sw) + 0.5 * rss

    res = optimize.minimize_scalar(neg_reml, bounds=(0.0, t2_max), method="bounded",
                                   options={"xatol": 1e-8})
    return max(0.0, float(res.x))


def pool_reml_hk(betas, vars_):
    """REML tau2 + Knapp-Hartung t interval with the HKSJ variance floor (the fix)."""
    betas, vars_ = np.asarray(betas, float), np.asarray(vars_, float)
    k = len(betas)
    tau2 = _reml_tau2(betas, vars_)
    w = 1.0 / (vars_ + tau2)
    sw = np.sum(w)
    mu = np.sum(w * betas) / sw
    # Hartung-Knapp scaling q with the HKSJ floor max(1, q); t_{k-1}.
    q = np.sum(w * (betas - mu) ** 2) / (k - 1) if k > 1 else 1.0
    q = max(1.0, q)
    se = np.sqrt(q / sw)
    crit = float(stats.t.ppf(0.975, k - 1)) if k > 1 else Z975
    return {"mu": float(mu), "se": float(se), "tau2": float(tau2),
            "lo": float(mu - crit * se), "hi": float(mu + crit * se), "crit": crit}


# ---------------------------------------------------------------------------
# One-stage random-slope linear mixed model
# ---------------------------------------------------------------------------
def one_stage_linear(studies):
    """Marginal model: y_i ~ MVN(B d_i, C_i + tau2 d_i d_i'). Profile REML over tau2,
    GLS for B, Knapp-Hartung-style t interval on df = (#studies - 1)."""
    k = len(studies)
    prepped = []
    for st in studies:
        d, y, C = st["d"], st["y"], st["C"]
        prepped.append((d, y, C))

    def gls_B(tau2):
        num = den = 0.0
        logdet = 0.0
        rss = 0.0
        mats = []
        for (d, y, C) in prepped:
            V = C + tau2 * np.outer(d, d)
            Vinv = np.linalg.pinv(V)
            sign, ld = np.linalg.slogdet(V)
            logdet += ld
            num += float(d @ Vinv @ y)
            den += float(d @ Vinv @ d)
            mats.append((d, y, Vinv))
        B = num / den if den > 0 else 0.0
        for (d, y, Vinv) in mats:
            r = y - B * d
            rss += float(r @ Vinv @ r)
        return B, den, logdet, rss

    def neg_reml(tau2):
        B, den, logdet, rss = gls_B(tau2)
        return 0.5 * logdet + 0.5 * np.log(den if den > 0 else 1e-12) + 0.5 * rss

    t2_max = 5.0
    res = optimize.minimize_scalar(neg_reml, bounds=(0.0, t2_max), method="bounded",
                                   options={"xatol": 1e-7})
    tau2 = max(0.0, float(res.x))
    B, den, _, rss = gls_B(tau2)
    se = np.sqrt(1.0 / den) if den > 0 else np.nan
    # KH-style finite-sample scaling on the slope residuals
    q = max(1.0, rss / max(1, sum(len(st["d"]) for st in studies) - 1))
    se_kh = se * np.sqrt(q)
    crit = float(stats.t.ppf(0.975, k - 1)) if k > 1 else Z975
    return {"mu": float(B), "se": float(se_kh), "tau2": tau2,
            "lo": float(B - crit * se_kh), "hi": float(B + crit * se_kh), "crit": crit}


# ---------------------------------------------------------------------------
# Multivariate REML pool for the quadratic curve
# ---------------------------------------------------------------------------
def _inv2(M):
    det = M[0, 0] * M[1, 1] - M[0, 1] * M[1, 0]
    if not (det > 0):
        return None
    return np.array([[M[1, 1], -M[0, 1]], [-M[1, 0], M[0, 0]]]) / det


def _mv_profile(coefs, Covs, T2):
    p = 2
    A = np.zeros((p, p))
    b = np.zeros(p)
    Vinvs, dets = [], []
    for i in range(len(coefs)):
        V = Covs[i] + T2
        Vi = _inv2(V)
        if Vi is None:
            return None
        det = V[0, 0] * V[1, 1] - V[0, 1] * V[1, 0]
        Vinvs.append(Vi)
        dets.append(det)
        A += Vi
        b += Vi @ coefs[i]
    Ai = _inv2(A)
    if Ai is None:
        return None
    mu = Ai @ b
    ll = 0.0
    for i in range(len(coefs)):
        d = coefs[i] - mu
        ll += -np.log(2 * np.pi) - 0.5 * np.log(dets[i]) - 0.5 * (d @ Vinvs[i] @ d)
    return {"mu": mu, "negLL": -ll, "covMu": Ai, "Vinvs": Vinvs}


def pool_mv_reml(coefs, Covs):
    """Multivariate RE pool of [b1,b2] vectors: Cholesky T2, Nelder-Mead on the
    profile -logL, GLS mean, + Hartung-Knapp widening. Returns mu (2,), covMu (2,2),
    crit, T2."""
    coefs = [np.asarray(c, float) for c in coefs]
    Covs = [np.asarray(C, float) for C in Covs]
    k = len(coefs)
    arr = np.array(coefs)
    v1 = max(1e-4, np.var(arr[:, 0]) * 0.5 if k > 1 else 0.01)
    v2 = max(1e-6, np.var(arr[:, 1]) * 0.5 if k > 1 else 1e-4)

    def unpack(p):
        l11 = np.exp(np.clip(p[0], -8, 3))
        l21 = p[1]
        l22 = np.exp(np.clip(p[2], -8, 3))
        return np.array([[l11 * l11, l11 * l21], [l11 * l21, l21 * l21 + l22 * l22]])

    def obj(p):
        r = _mv_profile(coefs, Covs, unpack(p))
        return 1e12 if r is None else r["negLL"]

    start = np.array([0.5 * np.log(v1), 0.0, 0.5 * np.log(v2)])
    o = optimize.minimize(obj, start, method="Nelder-Mead",
                          options={"xatol": 1e-6, "fatol": 1e-9, "maxiter": 4000})
    T2 = unpack(o.x)
    pr = _mv_profile(coefs, Covs, T2)
    if pr is None:                       # fallback: inverse-variance with no T2
        pr = _mv_profile(coefs, Covs, np.zeros((2, 2)))
        T2 = np.zeros((2, 2))
    mu, covMu = pr["mu"], pr["covMu"]
    # Hartung-Knapp generalized scaling
    Qg = 0.0
    for i in range(k):
        V = Covs[i] + T2
        Vi = _inv2(V)
        if Vi is None:
            continue
        d = coefs[i] - mu
        Qg += float(d @ Vi @ d)
    df = max(1, 2 * k - 2)
    H = max(1.0, Qg / df)
    crit = float(stats.t.ppf(0.975, max(1, k - 2)))
    return {"mu": np.asarray(mu, float), "covMu": H * np.asarray(covMu, float),
            "T2": np.asarray(T2, float), "crit": crit, "H": H}


# ---------------------------------------------------------------------------
# Curve evaluation helpers
# ---------------------------------------------------------------------------
def curve_ci_linear(pool, d, crit=None):
    """CI for g(d)=mu*d from a scalar-slope pool. Returns (est, lo, hi)."""
    crit = pool["crit"] if crit is None else crit
    est = pool["mu"] * d
    se = pool["se"] * d
    return est, est - crit * se, est + crit * se


def curve_ci_quad(mvpool, d):
    """CI for g(d)=b1 d + b2 d^2 from a multivariate pool. Returns (est, lo, hi)."""
    c = np.array([d, d * d])
    est = float(c @ mvpool["mu"])
    var = float(c @ mvpool["covMu"] @ c)
    se = np.sqrt(max(var, 0.0))
    crit = mvpool["crit"]
    return est, est - crit * se, est + crit * se
