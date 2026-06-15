"""
methods_dta.py -- Standard DTA toolbox + truth-recovery bivariate methods.

All estimators take a list of 2x2 tables [{tp,fp,fn,tn}, ...] and target the
summary operating point (Se, Sp). Working scale is (logit Se, logit FPR) with
FPR = 1 - Sp, the Reitsma parameterisation (so the bivariate fit matches
mada::reitsma exactly; see tests/test_dta.py for the AuditC anchor).

Methods provided
----------------
pool_univariate_fe(rows)  -> the ARCHAIC-DTA BUG: independent fixed-effect
    inverse-variance pooling of logit Se and logit Sp, no tau^2, no Se-Sp
    correlation. CI from within-study variance only -> under-covers as
    heterogeneity / threshold variation rise (the reproduced failure).
pool_univariate_dl(rows)  -> independent DerSimonian-Laird random-effects pooling
    of logit Se and logit Sp. Adds tau^2 per margin (fixes the marginal
    under-coverage) but STILL ignores the Se-Sp correlation -> wrong joint region
    and wrong SROC.
fit_bivariate(rows)       -> genuine bivariate random-effects MLE (Reitsma 2005):
    y_i = (logit Se_i, logit FPR_i) ~ BVN(mu, Sigma + S_i), Sigma the between-study
    covariance, S_i = diag(1/TP+1/FN, 1/FP+1/TN). Cholesky-parameterised Sigma,
    mu profiled by GLS, Nelder-Mead on the 3-param profile -logL. Returns mu, Sigma,
    covMu (GLS vcov of mu), the summary (Se, Sp), SROC slope, and HSROC/AUC.
bivariate_hk(fit, rows)   -> Hartung-Knapp-style honest-coverage widening of covMu
    (the multivariate analogue of the HKSJ floor that repaired the pairwise track):
    H = max(1, Q_gen/df) and a t critical value. The truth-recovery lever.
contrast / region helpers -> marginal CI and joint (chi2_2 / Hotelling F) region.
hsroc_auc(fit)            -> area under the summary ROC via the normal CDF (Phi),
    NOT the logistic, per the HSROC AUC convention.
threshold_spearman(rows)  -> Spearman corr(logit Se, logit FPR); > 0.6 flags a
    threshold effect (report SROC, not a single pooled point).
deeks_test(rows)          -> Deeks' funnel asymmetry test (small-study detection).

Validation targets (tests/test_dta.py): the bivariate MLE matches
mada::reitsma(method="ml") on AuditC to ~1e-3; at tau=thresh=0 the RE fits reduce
to the FE pool and recover (Se0,Sp0); univariate FE under-covers under
heterogeneity while bivariate + HK recover; the joint region covers the true point
at ~nominal.
"""
from __future__ import annotations

import numpy as np
from scipy import optimize, stats

np.seterr(all="ignore")

Z975 = stats.norm.ppf(0.975)
# sqrt(qchisq(0.95, 2)): radius of the joint 95% confidence ellipse in 2D.
R95 = float(np.sqrt(stats.chi2.ppf(0.95, 2)))


def _logit(p):
    return np.log(p / (1.0 - p))


def _expit(x):
    return 1.0 / (1.0 + np.exp(-x))


# ---------------------------------------------------------------------------
# Per-study transform (continuity correction = mada correction.control="all")
# ---------------------------------------------------------------------------
def _prep(rows):
    """Return arrays y (k,2) = (logit Se_i, logit FPR_i) and S (k,2) within-study
    variances diag(var logitSe, var logitFPR). If ANY study has a zero cell, add
    0.5 to ALL studies' cells (mada's default)."""
    any_zero = any(r["tp"] == 0 or r["fp"] == 0 or r["fn"] == 0 or r["tn"] == 0
                   for r in rows)
    c = 0.5 if any_zero else 0.0
    y = np.zeros((len(rows), 2))
    S = np.zeros((len(rows), 2))
    for i, r in enumerate(rows):
        tp, fp, fn, tn = r["tp"] + c, r["fp"] + c, r["fn"] + c, r["tn"] + c
        y[i, 0] = np.log(tp / fn)          # logit Se
        y[i, 1] = np.log(fp / tn)          # logit FPR = logit(1 - Sp)
        S[i, 0] = 1 / tp + 1 / fn
        S[i, 1] = 1 / fp + 1 / tn
    return y, S


# ---------------------------------------------------------------------------
# Univariate pooling on one margin (logit scale)
# ---------------------------------------------------------------------------
def _pool_margin(yj, vj, re):
    """FE/RE inverse-variance pool of one logit margin. Returns (mu, se_mu, tau2)."""
    w = 1.0 / vj
    mu_fe = np.sum(w * yj) / np.sum(w)
    Q = float(np.sum(w * (yj - mu_fe) ** 2))
    k = len(yj)
    tau2 = 0.0
    if re and k > 1:
        C = np.sum(w) - np.sum(w ** 2) / np.sum(w)
        tau2 = max(0.0, (Q - (k - 1)) / C) if C > 0 else 0.0
        w = 1.0 / (vj + tau2)
        mu = np.sum(w * yj) / np.sum(w)
    else:
        mu = mu_fe
    se_mu = np.sqrt(1.0 / np.sum(w))
    return mu, se_mu, tau2


def _univariate(rows, re):
    y, S = _prep(rows)
    mu_se, se_se, t2_se = _pool_margin(y[:, 0], S[:, 0], re)
    mu_fpr, se_fpr, t2_fpr = _pool_margin(y[:, 1], S[:, 1], re)
    return {"mu": np.array([mu_se, mu_fpr]),
            "se": np.array([se_se, se_fpr]),
            "tau2": np.array([t2_se, t2_fpr]),
            "sens": float(_expit(mu_se)), "spec": float(1 - _expit(mu_fpr)),
            "k": len(rows), "re": re}


def pool_univariate_fe(rows):
    """THE BUG: independent fixed-effect pooling of logit Se and logit Sp."""
    return _univariate(rows, re=False)


def pool_univariate_dl(rows):
    """Independent DerSimonian-Laird RE pooling (per-margin tau^2, no correlation)."""
    return _univariate(rows, re=True)


# ---------------------------------------------------------------------------
# Bivariate random-effects MLE (Reitsma 2005) -- ported from shared/dta-bivariate.js
# ---------------------------------------------------------------------------
def _inv2(M):
    det = M[0, 0] * M[1, 1] - M[0, 1] * M[1, 0]
    if not (det > 0):
        return None, det
    inv = np.array([[M[1, 1], -M[0, 1]], [-M[1, 0], M[0, 0]]]) / det
    return inv, det


def _profile(y, S, Sigma):
    """GLS mu for a given Sigma; returns (mu, negLL, Vinvs, A) or None on singular."""
    k = y.shape[0]
    A = np.zeros((2, 2))
    bvec = np.zeros(2)
    Vinvs = []
    dets = []
    for i in range(k):
        V = np.array([[Sigma[0, 0] + S[i, 0], Sigma[0, 1]],
                      [Sigma[1, 0], Sigma[1, 1] + S[i, 1]]])
        iv, det = _inv2(V)
        if iv is None:
            return None
        Vinvs.append(iv)
        dets.append(det)
        A += iv
        bvec += iv @ y[i]
    iA, dA = _inv2(A)
    if iA is None:
        return None
    mu = iA @ bvec
    ll = 0.0
    for i in range(k):
        d = y[i] - mu
        ll += -np.log(2 * np.pi) - 0.5 * np.log(dets[i]) - 0.5 * (d @ Vinvs[i] @ d)
    return {"mu": mu, "negLL": -ll, "Vinvs": Vinvs, "A": A, "covMu": iA}


def fit_bivariate(rows):
    """Bivariate ML fit. Returns mu (logitSe, logitFPR), Sigma, covMu, summary,
    SROC slope/intercept, and a `converged` flag."""
    y, S = _prep(rows)
    k = y.shape[0]
    # warm start from method-of-moments halved marginal variances
    v1 = max(0.05, np.var(y[:, 0], ddof=1) if k > 1 else 0.2)
    v2 = max(0.05, np.var(y[:, 1], ddof=1) if k > 1 else 0.2)
    s1, s2 = np.sqrt(0.5 * v1), np.sqrt(0.5 * v2)

    def unpack(p):
        l11 = np.exp(np.clip(p[0], -6, 4))
        l21 = p[1]
        l22 = np.exp(np.clip(p[2], -6, 4))
        return np.array([[l11 * l11, l11 * l21],
                         [l11 * l21, l21 * l21 + l22 * l22]])

    def obj(p):
        r = _profile(y, S, unpack(p))
        return 1e12 if r is None else r["negLL"]

    start = np.array([np.log(s1), 0.0, np.log(s2)])
    converged = True
    try:
        o1 = optimize.minimize(obj, start, method="Nelder-Mead",
                               options={"xatol": 1e-6, "fatol": 1e-9, "maxiter": 4000})
        o2 = optimize.minimize(obj, o1.x, method="Nelder-Mead",
                               options={"xatol": 1e-7, "fatol": 1e-10, "maxiter": 4000})
        best = o2.x if o2.fun <= o1.fun else o1.x
        converged = bool(o2.success or o1.success)
    except Exception:
        best = start
        converged = False

    Sigma = unpack(best)
    pr = _profile(y, S, Sigma)
    if pr is None:                       # fall back to univariate-DL if singular
        uni = pool_univariate_dl(rows)
        covMu = np.diag(uni["se"] ** 2)
        Sigma = np.diag(uni["tau2"])
        mu = uni["mu"]
        converged = False
    else:
        mu, covMu = pr["mu"], pr["covMu"]

    se, fpr = float(_expit(mu[0])), float(_expit(mu[1]))
    sroc_slope = Sigma[0, 1] / Sigma[1, 1] if Sigma[1, 1] > 0 else 0.0
    sroc_intercept = mu[0] - sroc_slope * mu[1]
    return {"mu": np.asarray(mu, float), "Sigma": np.asarray(Sigma, float),
            "covMu": np.asarray(covMu, float), "sens": se, "spec": 1 - fpr,
            "fpr": fpr, "sroc_slope": float(sroc_slope),
            "sroc_intercept": float(sroc_intercept), "k": k,
            "converged": converged, "y": y, "S": S}


def bivariate_hk(fit):
    """Hartung-Knapp-style honest-coverage widening of the bivariate covMu.
    H = max(1, Q_gen/df), Q_gen = sum_i (y_i-mu)' (Sigma+S_i)^{-1} (y_i-mu),
    df = 2k - 2 (2k logit observations, 2 mean parameters). Marginal critical
    value t_{k-2}; joint region uses Hotelling 2*F_{2,k-2}. Mirrors NetHK."""
    y, S, mu, Sigma = fit["y"], fit["S"], fit["mu"], fit["Sigma"]
    k = fit["k"]
    Qg = 0.0
    for i in range(k):
        V = np.array([[Sigma[0, 0] + S[i, 0], Sigma[0, 1]],
                      [Sigma[1, 0], Sigma[1, 1] + S[i, 1]]])
        iv, det = _inv2(V)
        if iv is None:
            continue
        d = y[i] - mu
        Qg += float(d @ iv @ d)
    df = max(1, 2 * k - 2)
    H = max(1.0, Qg / df)
    df_t = max(1, k - 2)
    crit = float(stats.t.ppf(0.975, df_t))
    # joint-region radius^2: Hotelling T^2 -> 2*(k-2)/(k-... ) F; use 2*F_{2,k-2}
    f_crit = float(stats.f.ppf(0.95, 2, df_t))
    r2_joint = 2.0 * f_crit
    return {"covMu": H * fit["covMu"], "crit": crit, "H": H, "df": df_t,
            "r2_joint": r2_joint}


# ---------------------------------------------------------------------------
# Interval / region helpers
# ---------------------------------------------------------------------------
def margin_ci(mu_j, var_j, crit=Z975):
    """CI on a logit margin, back-transformed by expit. Returns (lo, hi) on prob
    scale (for Se directly; for the FPR margin pass the FPR mean -> 1-(.) for Sp)."""
    se = np.sqrt(max(var_j, 0.0))
    return _expit(mu_j - crit * se), _expit(mu_j + crit * se)


def covers_point_joint(mu_hat, covMu, mu_true, r2=R95 ** 2):
    """Does the joint confidence region cover the true (logitSe, logitFPR) point?
    (mu_hat-mu_true)' covMu^{-1} (mu_hat-mu_true) <= r2."""
    iv, det = _inv2(np.asarray(covMu, float))
    if iv is None:
        return False
    d = np.asarray(mu_hat, float) - np.asarray(mu_true, float)
    return float(d @ iv @ d) <= r2


# ---------------------------------------------------------------------------
# HSROC summaries
# ---------------------------------------------------------------------------
def hsroc_auc(fit, n=400):
    """Area under the summary ROC curve. The SROC is logit(TPR) =
    intercept + slope*logit(FPR); integrate TPR over FPR in (0,1). The operating
    point is shared with the bivariate fit (Harbord equivalence)."""
    fpr = np.linspace(1e-4, 1 - 1e-4, n)
    tpr = _expit(fit["sroc_intercept"] + fit["sroc_slope"] * _logit(fpr))
    _trap = getattr(np, "trapezoid", None) or np.trapz   # numpy>=2 renamed trapz
    return float(_trap(tpr, fpr))


def threshold_spearman(rows):
    """Spearman correlation between logit Se and logit FPR across studies.
    > ~0.6 indicates a threshold effect -> report the SROC, not a pooled point."""
    y, _ = _prep(rows)
    if y.shape[0] < 3:
        return 0.0
    rho, _ = stats.spearmanr(y[:, 0], y[:, 1])
    return float(rho) if np.isfinite(rho) else 0.0


def deeks_test(rows):
    """Deeks' funnel-plot asymmetry test: regress lnDOR on 1/sqrt(ESS), weighted by
    ESS; the slope t-test p flags small-study/publication bias."""
    x, yv, w = [], [], []
    for r in rows:
        tp, fp, fn, tn = r["tp"], r["fp"], r["fn"], r["tn"]
        if tp == 0 or fp == 0 or fn == 0 or tn == 0:
            tp, fp, fn, tn = tp + 0.5, fp + 0.5, fn + 0.5, tn + 0.5
        n1, n0 = tp + fn, fp + tn
        ess = 4 * n1 * n0 / (n1 + n0)
        x.append(1 / np.sqrt(ess))
        yv.append(np.log((tp * tn) / (fp * fn)))
        w.append(ess)
    x, yv, w = np.array(x), np.array(yv), np.array(w)
    n = len(x)
    if n < 3:
        return {"slope": np.nan, "p": np.nan, "df": 0}
    sw, swx, swy = w.sum(), (w * x).sum(), (w * yv).sum()
    swxx, swxy = (w * x * x).sum(), (w * x * yv).sum()
    det = sw * swxx - swx * swx
    if det == 0:
        return {"slope": np.nan, "p": np.nan, "df": 0}
    slope = (sw * swxy - swx * swy) / det
    intercept = (swxx * swy - swx * swxy) / det
    rss = float(np.sum(w * (yv - intercept - slope * x) ** 2))
    df = n - 2
    sigma2 = rss / df
    se_slope = np.sqrt(sigma2 * sw / det)
    t = slope / se_slope
    p = float(2 * (1 - stats.t.cdf(abs(t), df)))
    return {"slope": float(slope), "p": p, "df": df, "t": float(t)}
