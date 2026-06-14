"""
methods.py — Truth-recovery yardstick: every meta-analysis pooling/bias method
=============================================================================

Each estimator takes (y, v) — effect sizes and their sampling VARIANCES — and
returns a dict with at least:
    mu      : point estimate of the pooled effect
    ci_lo   : lower 95% CI/CrI bound for mu
    ci_hi   : upper 95% CI/CrI bound for mu
    se      : standard error of mu (NaN if interval is not symmetric/Wald)
    tau2    : between-study variance estimate (np.nan if the method has none)
    ok      : True if the method converged / produced a usable estimate

Faithful ports of the audited allmeta implementations (the source of truth):
  - Vevea-Hedges step selection model  <- F:\\allmeta\\shared\\selmodel.js
  - Copas-Shi profile-MLE selection    <- F:\\allmeta\\copas\\index.html
  - RoBMA effect x heterogeneity BMA    <- F:\\allmeta\\shared\\robma.js
  - PET-PEESE conditional               <- F:\\allmeta\\pet-peese\\index.html
  - Duval-Tweedie trim-and-fill L0      <- F:\\allmeta\\shared\\trimfill.js
GRMA is imported verbatim from GWAM/GRMA_paper (grey_meta_v8.py).

Standard pooling kernels (DL / REML / PM / HKSJ) are implemented here from the
canonical formulas; REML is a true restricted-likelihood maximiser (the GRMA
module's "_reml" is honestly labelled Paule-Mandel, so we do not reuse it for
REML). All gotchas from the user's advanced-stats.md are respected:
  - DL only as one method (PM/REML are the small-k recommendation)
  - HKSJ floor max(1, Q/(k-1)); t_{k-1} critical value (not z)
  - tau2 pooled on the analysis scale; PI / CI use t where appropriate
"""

import warnings

import numpy as np
from scipy import stats, optimize, integrate
from scipy.special import ndtr, ndtri      # fast vectorised normal CDF / inverse CDF

# Benign numerical edge cases (overflow in optimiser excursions, 0/0 in GRMA
# bootstrap resamples of identical studies) are handled downstream via finite
# checks / 1e12 penalties; silence the noisy RuntimeWarnings so they don't
# dominate logs or throttle the simulation with stderr I/O.
np.seterr(all="ignore")
warnings.filterwarnings("ignore", category=RuntimeWarning)

Z975 = stats.norm.ppf(0.975)
_SQRT2PI = np.sqrt(2 * np.pi)


def _phi(x):
    return np.exp(-0.5 * x * x) / _SQRT2PI

# ---------------------------------------------------------------------------
# GRMA: import the audited kernel verbatim (do not re-implement)
# ---------------------------------------------------------------------------
import os, sys
_GRMA_DIRS = [
    r"F:\Models\GRMA_paper",
    r"F:\Models\GWAM\scripts",
]
for _d in _GRMA_DIRS:
    if os.path.isdir(_d) and _d not in sys.path:
        sys.path.insert(0, _d)
try:
    from grey_meta_v8 import GRMA as _GRMA
except Exception as _e:  # pragma: no cover
    _GRMA = None
    _GRMA_IMPORT_ERR = _e


# ===========================================================================
# 1. Standard pooling kernels
# ===========================================================================

def _fe_mu(y, v):
    w = 1.0 / v
    return float(np.sum(w * y) / np.sum(w))


def _dl_tau2(y, v):
    k = len(y)
    w = 1.0 / v
    mu = np.sum(w * y) / np.sum(w)
    Q = float(np.sum(w * (y - mu) ** 2))
    C = np.sum(w) - np.sum(w ** 2) / np.sum(w)
    if C <= 0:
        return 0.0, Q
    return max(0.0, (Q - (k - 1)) / C), Q


def dersimonian_laird(y, v):
    tau2, _ = _dl_tau2(y, v)
    w = 1.0 / (v + tau2)
    mu = float(np.sum(w * y) / np.sum(w))
    se = float(np.sqrt(1.0 / np.sum(w)))
    return {"method": "DL", "mu": mu, "se": se,
            "ci_lo": mu - Z975 * se, "ci_hi": mu + Z975 * se,
            "tau2": tau2, "ok": True}


def _reml_tau2(y, v):
    """True REML between-study variance via restricted-likelihood maximisation."""
    def neg_rll(log_t2):
        tau2 = np.exp(log_t2)
        w = 1.0 / (v + tau2)
        sw = np.sum(w)
        mu = np.sum(w * y) / sw
        ll = (-0.5 * np.sum(np.log(v + tau2))
              - 0.5 * np.log(sw)
              - 0.5 * np.sum(w * (y - mu) ** 2))
        return -ll
    # boundary check at tau2 -> 0
    lo, hi = np.log(1e-10), np.log(1e3)
    res = optimize.minimize_scalar(neg_rll, bounds=(lo, hi), method="bounded",
                                   options={"xatol": 1e-9})
    tau2 = float(np.exp(res.x))
    # compare to the tau2=0 boundary; if FE fits at least as well, snap to 0
    if neg_rll(np.log(1e-10)) <= res.fun + 1e-9:
        tau2 = 0.0
    return tau2


def reml(y, v):
    tau2 = _reml_tau2(y, v)
    w = 1.0 / (v + tau2)
    mu = float(np.sum(w * y) / np.sum(w))
    se = float(np.sqrt(1.0 / np.sum(w)))
    return {"method": "REML", "mu": mu, "se": se,
            "ci_lo": mu - Z975 * se, "ci_hi": mu + Z975 * se,
            "tau2": tau2, "ok": True}


def _pm_tau2(y, v, max_iter=200, tol=1e-9):
    """Paule-Mandel: solve sum(w_i (y-mu)^2) = k-1."""
    k = len(y)
    tau2 = max(0.0, _dl_tau2(y, v)[0])
    for _ in range(max_iter):
        w = 1.0 / (v + tau2)
        mu = np.sum(w * y) / np.sum(w)
        F = np.sum(w * (y - mu) ** 2) - (k - 1)
        # derivative wrt tau2 (treating mu as fixed): -sum(w^2 (y-mu)^2)
        dF = -np.sum(w ** 2 * (y - mu) ** 2)
        if abs(dF) < 1e-30:
            break
        step = F / dF
        tau2_new = max(0.0, tau2 - step)
        if abs(tau2_new - tau2) < tol:
            tau2 = tau2_new
            break
        tau2 = tau2_new
    return float(tau2)


def paule_mandel(y, v):
    tau2 = _pm_tau2(y, v)
    w = 1.0 / (v + tau2)
    mu = float(np.sum(w * y) / np.sum(w))
    se = float(np.sqrt(1.0 / np.sum(w)))
    return {"method": "PM", "mu": mu, "se": se,
            "ci_lo": mu - Z975 * se, "ci_hi": mu + Z975 * se,
            "tau2": tau2, "ok": True}


def hksj(y, v):
    """Hartung-Knapp-Sidik-Jonkman with DL tau2, floor max(1, Q/(k-1)), t_{k-1}."""
    k = len(y)
    tau2, _ = _dl_tau2(y, v)
    w = 1.0 / (v + tau2)
    mu = float(np.sum(w * y) / np.sum(w))
    q = np.sum(w * (y - mu) ** 2) / (k - 1)          # generalised Q / (k-1)
    q = max(1.0, q)                                   # HKSJ floor (advanced-stats.md)
    se = float(np.sqrt(q / np.sum(w)))
    tcrit = stats.t.ppf(0.975, k - 1)
    return {"method": "HKSJ", "mu": mu, "se": se,
            "ci_lo": mu - tcrit * se, "ci_hi": mu + tcrit * se,
            "tau2": tau2, "ok": True}


# ===========================================================================
# 2. Vevea-Hedges step-function selection model  (port of selmodel.js)
# ===========================================================================

def _unadjusted_ml(y, v):
    def nll(p):
        mu, tau2 = p[0], np.exp(p[1])
        e2 = v + tau2
        return float(0.5 * np.sum(np.log(2 * np.pi * e2) + (y - mu) ** 2 / e2))
    mu0 = _fe_mu(y, v)
    t20 = max(1e-6, _dl_tau2(y, v)[0])
    r = optimize.minimize(nll, [mu0, np.log(t20)], method="Nelder-Mead",
                          options={"xatol": 1e-8, "fatol": 1e-10, "maxiter": 4000})
    return r.x[0], float(np.exp(r.x[1])), -r.fun


def _selmodel_negll(y, v, steps, mu, tau2, delta, _ctx):
    """Vectorised one-sided step-function negative log-likelihood.

    _ctx caches steps-dependent constants (sv, zc, interval index, log wj) that
    don't change across the optimiser's (mu, tau2, delta) evaluations except
    through delta — so delta is looked up fresh each call.
    """
    if tau2 < 0:
        return 1e12
    sv = _ctx["sv"]
    zc = _ctx["zc"]            # (nbnd,)
    jidx = _ctx["jidx"]        # interval index per study
    nbnd = len(zc)
    delta = np.asarray(delta, float)
    if np.any(delta <= 0):
        return 1e12
    eta2 = v + tau2
    eta = np.sqrt(eta2)
    wj = delta[jidx]
    # normaliser A_i = sum_m delta_m (C[:,m]-C[:,m+1]); C col0=1 (+inf), last=0 (-inf)
    # interior boundaries: Phi((sv_i*zc[m]-mu)/eta_i)
    bnd = (sv[:, None] * zc[None, :] - mu) / eta[:, None]     # (k, nbnd)
    C = np.empty((len(y), nbnd + 2))
    C[:, 0] = 1.0
    C[:, 1:nbnd + 1] = ndtr(bnd)
    C[:, nbnd + 1] = 0.0
    probs = C[:, :nbnd + 1] - C[:, 1:nbnd + 2]                # (k, nbnd+1)
    A = probs @ delta
    if np.any(A <= 0) or np.any(wj <= 0):
        return 1e12
    logphi = -0.5 * np.log(2 * np.pi * eta2) - (y - mu) ** 2 / (2 * eta2)
    ll = np.sum(np.log(wj) + logphi - np.log(A))
    return float(-ll) if np.isfinite(ll) else 1e12


def vevea_hedges(y, v, steps=(0.025,)):
    """One-sided step selection model (favouring large positive effects).

    Returns mu/tau2/delta and a Wald CI from the inverse numerical Hessian.
    Matches metafor::selmodel(type='stepfun') to ~1e-4 on the validated fixture.
    """
    steps = sorted(steps)
    steps_arr = np.asarray(steps, float)
    nDelta = len(steps)            # delta_2 .. delta_{nInt} estimated; delta_1 = 1
    sv = np.sqrt(v)
    zc = ndtri(1.0 - steps_arr)                  # y = sqrt(v)*z at each cutpoint
    p_one = 1.0 - ndtr(y / sv)
    jidx = np.searchsorted(steps_arr, p_one, side="right")
    _ctx = {"sv": sv, "zc": zc, "jidx": jidx}
    mu0, t20, _ = _unadjusted_ml(y, v)
    t20 = max(1e-6, t20)

    def unpack(x):
        mu = x[0]
        tau2 = np.exp(x[1])
        delta = [1.0] + [np.exp(x[2 + d]) for d in range(nDelta)]
        return mu, tau2, delta

    def obj(x):
        mu, tau2, delta = unpack(x)
        return _selmodel_negll(y, v, steps, mu, tau2, delta, _ctx)

    x0 = [mu0, np.log(t20)] + [0.0] * nDelta
    r = optimize.minimize(obj, x0, method="Nelder-Mead",
                          options={"xatol": 1e-7, "fatol": 1e-9, "maxiter": 8000})
    r = optimize.minimize(obj, r.x, method="Nelder-Mead",
                          options={"xatol": 1e-9, "fatol": 1e-11, "maxiter": 8000})
    mu, tau2, delta = unpack(r.x)

    # Wald SE: numerical Hessian in NATURAL params (mu, tau2, delta_2..)
    theta = np.array([mu, tau2] + delta[1:])

    def nll_nat(th):
        dl = [1.0] + list(th[2:])
        return _selmodel_negll(y, v, steps, th[0], th[1], dl, _ctx)

    se = np.nan
    ok = bool(r.success or r.fun < 1e11)
    try:
        H = _num_hessian(nll_nat, theta)
        cov = np.linalg.inv(H)
        if cov[0, 0] > 0 and np.isfinite(cov[0, 0]):
            se = float(np.sqrt(cov[0, 0]))
    except Exception:
        se = np.nan
    if not np.isfinite(se):
        ok = False
        se = float(np.sqrt(1.0 / np.sum(1.0 / (v + tau2))))   # fall back to RE Wald
    return {"method": "VeveaHedges", "mu": float(mu), "se": se,
            "ci_lo": mu - Z975 * se, "ci_hi": mu + Z975 * se,
            "tau2": float(tau2), "delta": delta, "ok": ok}


def _num_hessian(f, x, rel=1e-3, absmin=1e-4):
    n = len(x)
    h = np.maximum(absmin, np.abs(x) * rel)
    H = np.zeros((n, n))
    for i in range(n):
        for j in range(i, n):
            xpp = x.copy(); xpm = x.copy(); xmp = x.copy(); xmm = x.copy()
            xpp[i] += h[i]; xpp[j] += h[j]
            xpm[i] += h[i]; xpm[j] -= h[j]
            xmp[i] -= h[i]; xmp[j] += h[j]
            xmm[i] -= h[i]; xmm[j] -= h[j]
            v = (f(xpp) - f(xpm) - f(xmp) + f(xmm)) / (4 * h[i] * h[j])
            H[i, j] = H[j, i] = v
    return H


# ===========================================================================
# 3. Copas-Shi (2000) profile-MLE selection model  (port of copas/index.html)
# ===========================================================================

def _copas_nll(par, g0, g1, te, se):
    mu, rho, tau = par
    u = g0 + g1 / se
    lam = _inv_mills(u)
    denom = 1.0 - rho * rho * lam * (u + lam)
    if np.any(denom <= 0):
        return np.inf
    sigma2 = se * se / denom
    s2t2 = sigma2 + tau * tau
    rhoT = rho * np.sqrt(sigma2) / np.sqrt(s2t2)
    omr = 1.0 - rhoT * rhoT
    if np.any(omr <= 0):
        return np.inf
    vv = (u + rhoT * (te - mu) / np.sqrt(s2t2)) / np.sqrt(omr)
    vv = np.maximum(vv, -37.0)
    Pv = ndtr(vv)
    if np.any(Pv <= 0):
        return np.inf
    d = te - mu
    val = np.sum(-(-0.5 * np.log(s2t2) - d * d / (2 * s2t2) + np.log(Pv)))
    return val if np.isfinite(val) else np.inf


def _inv_mills(u):
    P = ndtr(u)
    out = np.where(P > 1e-300, _phi(u) / np.where(P > 1e-300, P, 1.0),
                   np.where(u < 0, -u, 0.0))
    return out


def _copas_grad(par, g0, g1, te, se):
    mu, rho, tau = par
    rho2, tau2 = rho * rho, tau * tau
    TEmu = te - mu
    varTE = se * se
    u = g0 + g1 / se
    lam = _inv_mills(u)
    ci2 = lam * (u + lam)
    sigma2 = varTE / (1.0 - rho2 * ci2)
    sigma = np.sqrt(sigma2)
    s2t2 = sigma2 + tau2
    rhoT = rho * sigma / np.sqrt(s2t2)
    rho2T = rhoT * rhoT
    bottom = np.sqrt(1.0 - rho2T)
    top = u + rhoT * TEmu / np.sqrt(s2t2)
    vv = np.maximum(top / bottom, -37.0)
    lamv = _inv_mills(vv)
    gMu = TEmu / s2t2 - (rhoT / np.sqrt(s2t2 * (1.0 - rho2T))) * lamv
    gRho = (-ci2 * rho * sigma2 ** 2 / (varTE * s2t2)
            + TEmu ** 2 * ci2 * rho * sigma2 ** 2 / (varTE * s2t2 ** 2))
    diffTop = ((top - u) / rho
               - (top - u) * rho * ci2 / (1.0 - ci2 * rho2)
               + 2 * (top - u) * rho * tau2 * ci2 / (varTE + tau2 * (1.0 - ci2 * rho2)))
    eta = varTE / (varTE + tau2 * (1.0 - ci2 * rho2))
    diffBot = (1.0 - rho2T) ** (-1.5) * rho * eta * (1.0 + rho2 * tau2 * ci2 * eta / varTE)
    gRho = gRho + (top * diffBot + diffTop / bottom) * lamv
    gTau = (-0.5 / s2t2 + 0.5 * TEmu ** 2 / s2t2 ** 2
            + (-sigma * TEmu * rho / (bottom * s2t2 ** 2)
               - 0.5 * top * (1.0 - rho2T) ** (-1.5) * sigma2 * rho2 / s2t2 ** 2) * lamv)
    gTau = 2 * tau * gTau
    return np.array([-np.sum(gMu), -np.sum(gRho), -np.sum(gTau)])


_RHO_BOUND = 0.9999


def _egger_left(te, se):
    x = 1.0 / se
    yv = te / se
    n = len(te)
    sx, sy, sxx, sxy = x.sum(), yv.sum(), (x * x).sum(), (x * yv).sum()
    det = n * sxx - sx * sx
    a = (sy * sxx - sx * sxy) / det if det != 0 else 0.0
    return a > 0


def _copas_profile_mle(te, se, g0, g1, need_se=False, sgn=None):
    w = 1.0 / (se * se)
    muHat = float(np.sum(w * te) / np.sum(w))
    if sgn is None:
        sgn = 1.0 if _egger_left(te, se) else -1.0
    starts = [
        [muHat, sgn * _RHO_BOUND / 2, 0.05],
        [muHat, sgn * _RHO_BOUND * 0.9, 0.05],
    ]
    bounds = [(-1e6, 1e6), (-_RHO_BOUND, _RHO_BOUND), (0.0, 1e3)]
    best = None
    for s0 in starts:
        try:
            r = optimize.minimize(_copas_nll, s0, args=(g0, g1, te, se),
                                  jac=_copas_grad, method="L-BFGS-B", bounds=bounds,
                                  options={"maxiter": 500, "ftol": 1e-12})
        except Exception:
            continue
        if np.isfinite(r.fun) and (best is None or r.fun < best.fun - 1e-10):
            best = r
    if best is None:
        return None
    mu, rho, tau = best.x
    seTE = np.nan
    if need_se:
        try:
            H = _num_hessian(lambda p: _copas_nll(p, g0, g1, te, se), best.x,
                             rel=1e-4, absmin=1e-5)
            H = H + 1e-8
            inv = np.linalg.inv(H)
            seTE = float(np.sqrt(inv[0, 0])) if inv[0, 0] > 0 else np.nan
        except Exception:
            seTE = np.nan
    return {"mu": float(mu), "rho": float(rho), "tau": float(tau),
            "se": seTE, "nll": float(best.fun), "g0": g0, "g1": g1}


def copas_shi(y, v, n_path=9, p_min=0.30):
    """Copas-Shi selection model.

    Runs the profile MLE along the reproducible publication-probability path
    (smallest-SE study pinned ~always-published; largest-SE study's publprob
    swept down). The reported estimate is the maximum-likelihood IDENTIFIED
    point (|rho| < 0.95 and finite SE) -- i.e. the most-likely selection
    severity that is still identified. If no point is identified the method is
    flagged non-converged and falls back to the least-selection (≈unadjusted)
    point. This surfaces the known rho-identification failures honestly.
    """
    te = np.asarray(y, float)
    se = np.sqrt(np.asarray(v, float))
    seMin, seMax = se.min(), se.max()
    PHI = 0.9999
    qhi = ndtri(PHI)
    sgn = 1.0 if _egger_left(te, se) else -1.0
    ps = np.linspace(1.0, p_min, n_path)
    pts = []
    for p in ps:
        if p >= 1.0:
            g0, g1 = qhi, 0.0
        else:
            denom = (1.0 / seMin - 1.0 / seMax)
            g1 = (qhi - ndtri(p)) / denom if denom != 0 else 0.0
            g0 = qhi - g1 / seMin
        r = _copas_profile_mle(te, se, g0, g1, need_se=False, sgn=sgn)
        if r is not None:
            r["publprob"] = float(p)
            pts.append(r)
    if not pts:
        re = reml(y, v)
        return {"method": "Copas", "mu": re["mu"], "se": re["se"],
                "ci_lo": re["ci_lo"], "ci_hi": re["ci_hi"], "tau2": re["tau2"],
                "ok": False, "fail": "no_profile"}
    # Pick the maximum-likelihood IDENTIFIED point (|rho|<0.95). Only then pay
    # for the numerical-Hessian SE at that single point.
    identified = [r for r in pts if abs(r["rho"]) < 0.95]
    if identified:
        best = min(identified, key=lambda r: r["nll"])
        ok = True
    else:
        best = pts[0]            # least selection (publprob ~1, ~unadjusted)
        ok = False
    se_pt = _copas_profile_mle(te, se, best["g0"], best["g1"], need_se=True, sgn=sgn)
    if se_pt is not None:
        best = {**best, **se_pt}
    mu, seTE, tau = best["mu"], best["se"], best["tau"]
    if not np.isfinite(seTE):
        seTE = float(np.sqrt(1.0 / np.sum(1.0 / (v + tau * tau))))
        ok = False
    return {"method": "Copas", "mu": float(mu), "se": float(seTE),
            "ci_lo": mu - Z975 * seTE, "ci_hi": mu + Z975 * seTE,
            "tau2": float(tau * tau), "rho": float(best["rho"]), "ok": ok}


# ===========================================================================
# 4. RoBMA core: effect x heterogeneity BMA  (port of robma.js)
# ===========================================================================

# Fixed Gauss-Legendre nodes (fast, deterministic) for the marginal-likelihood
# integrals. 64 nodes is ample for these smooth low-dim integrands.
_GL_X, _GL_W = np.polynomial.legendre.leggauss(64)


def _gl_integral(f, a, b):
    xm = 0.5 * (b - a) * _GL_X + 0.5 * (b + a)
    return 0.5 * (b - a) * np.sum(_GL_W * f(xm))


def robma(y, v, muSD=1.0, tauSD=1.0, priors=(0.25, 0.25, 0.25, 0.25)):
    """Bayesian model-averaging over {effect present/absent} x {RE/FE}.

    NOTE (inventory): this is RoBMA's effect/heterogeneity sub-ensemble; the
    publication-bias models are deliberately NOT included (the full RoBMA R
    package adds them via MCMC). Scored here as the 'honest-but-bias-blind'
    reference. CrI is a normal approximation from the model-averaged posterior
    moments.
    """
    y = np.asarray(y, float)
    v = np.asarray(v, float)
    k = len(y)

    sw = np.sum(1.0 / v)
    muHat = np.sum(y / v) / sw
    MUW = 9 + abs(muHat)
    TAU = 10 * tauSD
    muLo, muHi = muHat - MUW, muHat + MUW

    def npdf(x, m, s):
        z = (x - m) / s
        return np.exp(-0.5 * z * z) / (s * np.sqrt(2 * np.pi))

    # GL nodes/weights mapped onto each integration range
    def nodes(a, b):
        xm = 0.5 * (b - a) * _GL_X + 0.5 * (b + a)
        wm = 0.5 * (b - a) * _GL_W
        return xm, wm

    mu_n, mu_w = nodes(muLo, muHi)          # (G,)
    tau_n, tau_w = nodes(0.0, TAU)          # (G,)

    # log-lik on a (node, study) grid, vectorised:  L(mu, tau2) over nodes
    def loglik_vec(mus, tau2s):
        # mus, tau2s broadcast to shape S; returns sum over studies -> shape S
        e2 = v[None, :] + tau2s[:, None]            # (S, k)
        return np.sum(-0.5 * np.log(2 * np.pi * e2)
                      - (y[None, :] - mus[:, None]) ** 2 / (2 * e2), axis=1)

    mH0FE = float(np.exp(loglik_vec(np.array([0.0]), np.array([0.0]))[0]))

    # H1FE: integrate over mu at tau2=0
    Lfe = np.exp(loglik_vec(mu_n, np.zeros_like(mu_n)))      # (G,)
    pmu = npdf(mu_n, 0.0, muSD)
    mH1FE = float(np.sum(mu_w * Lfe * pmu))
    numMu = float(np.sum(mu_w * mu_n * Lfe * pmu))
    numMu2 = float(np.sum(mu_w * mu_n * mu_n * Lfe * pmu))

    # H0RE: integrate over tau at mu=0
    Lre0 = np.exp(loglik_vec(np.zeros_like(tau_n), tau_n ** 2))   # (G,)
    ptau = 2 * npdf(tau_n, 0.0, tauSD)
    mH0RE = float(np.sum(tau_w * Lre0 * ptau))

    # H1RE: double integral over (mu, tau) — full (G_tau, G_mu) grid
    e2 = v[None, None, :] + (tau_n ** 2)[:, None, None]          # (Gt, 1, k)
    quad = (y[None, None, :] - mu_n[None, :, None]) ** 2
    LL = np.sum(-0.5 * np.log(2 * np.pi * e2) - quad / (2 * e2), axis=2)   # (Gt, Gm)
    L = np.exp(LL)
    pmu_g = npdf(mu_n, 0.0, muSD)[None, :]
    ptau_g = (2 * npdf(tau_n, 0.0, tauSD))[:, None]
    base = L * pmu_g * ptau_g                                    # (Gt, Gm)
    Wt = tau_w[:, None] * mu_w[None, :]
    mH1RE = float(np.sum(Wt * base))
    numMuRE = float(np.sum(Wt * base * mu_n[None, :]))
    numMu2RE = float(np.sum(Wt * base * (mu_n ** 2)[None, :]))

    pri = np.array(priors)
    marg = np.array([mH0FE, mH1FE, mH0RE, mH1RE])
    post = marg * pri
    Z = post.sum()
    if not np.isfinite(Z) or Z <= 0:
        re = reml(y, v)
        return {**re, "method": "RoBMA", "ok": False, "fail": "quadrature"}
    post = post / Z

    emuH1FE = numMu / mH1FE if mH1FE > 0 else 0.0
    emu2H1FE = numMu2 / mH1FE if mH1FE > 0 else 0.0
    emuH1RE = numMuRE / mH1RE if mH1RE > 0 else 0.0
    emu2H1RE = numMu2RE / mH1RE if mH1RE > 0 else 0.0

    # model-averaged posterior moments (H0 models: mu=0 point mass)
    muMA = post[1] * emuH1FE + post[3] * emuH1RE
    mu2MA = post[1] * emu2H1FE + post[3] * emu2H1RE
    var = max(0.0, mu2MA - muMA * muMA)
    se = float(np.sqrt(var))
    pInclHetero = post[2] + post[3]
    # tau2 not a single number here; report posterior-mean-ish via RE inclusion x REML tau2
    tau2 = _reml_tau2(y, v) * pInclHetero
    return {"method": "RoBMA", "mu": float(muMA), "se": se,
            "ci_lo": muMA - Z975 * se, "ci_hi": muMA + Z975 * se,
            "tau2": float(tau2), "pInclEffect": float(post[1] + post[3]),
            "pInclHetero": float(pInclHetero), "ok": True}


# ===========================================================================
# 5. PET-PEESE conditional  (port of pet-peese/index.html)
# ===========================================================================

def _wls(x, y, w):
    """Weighted least squares y = b0 + b1 x. Returns b0, b1, se(b0), n."""
    sw = w.sum()
    swx = np.sum(w * x)
    swy = np.sum(w * y)
    swxx = np.sum(w * x * x)
    swxy = np.sum(w * x * y)
    denom = sw * swxx - swx * swx
    if denom == 0:
        return np.nan, np.nan, np.nan, len(x)
    b1 = (sw * swxy - swx * swy) / denom
    b0 = (swy - b1 * swx) / sw
    n = len(x)
    resid = y - (b0 + b1 * x)
    if n > 2:
        sigma2 = np.sum(w * resid ** 2) / (n - 2)
    else:
        sigma2 = np.nan
    seb0 = float(np.sqrt(sigma2 * swxx / denom)) if np.isfinite(sigma2) else np.nan
    return float(b0), float(b1), seb0, n


def pet_peese(y, v, alpha=0.10):
    """Stanley-Doucouliagos conditional PET-PEESE. Fixed-effect WLS (no tau2)."""
    se = np.sqrt(np.asarray(v, float))
    y = np.asarray(y, float)
    w = 1.0 / v
    k = len(y)
    pb0, pb1, pse, n = _wls(se, y, w)                  # PET: y ~ SE
    eb0, eb1, ese, _ = _wls(se * se, y, w)             # PEESE: y ~ SE^2
    # PET intercept one-sided p (effect direction = sign of PET intercept)
    if np.isfinite(pse) and pse > 0 and k > 2:
        t_pet = pb0 / pse
        p_one = stats.t.sf(abs(t_pet), k - 2)          # one-sided
    else:
        p_one = 1.0
    use_peese = p_one < alpha
    if use_peese and np.isfinite(eb0) and np.isfinite(ese):
        b0, seb0 = eb0, ese
        which = "PEESE"
    else:
        b0, seb0 = pb0, pse
        which = "PET"
    ok = np.isfinite(b0) and np.isfinite(seb0)
    if not ok:
        seb0 = np.nan
    tcrit = stats.t.ppf(0.975, max(1, k - 2))
    return {"method": "PET-PEESE", "mu": b0, "se": seb0,
            "ci_lo": b0 - tcrit * seb0, "ci_hi": b0 + tcrit * seb0,
            "tau2": np.nan, "which": which, "ok": bool(ok)}


# ===========================================================================
# 6. Trim-and-fill (corrected)  (port of trimfill.js, L0, DL re-pool)
# ===========================================================================

def _egger_slope(y, v):
    n = len(y)
    w = 1.0 / v
    x = np.sqrt(v)
    sw, swx, swy = w.sum(), np.sum(w * x), np.sum(w * y)
    swxx, swxy = np.sum(w * x * x), np.sum(w * x * y)
    denom = sw * swxx - swx * swx
    return 0.0 if denom == 0 else (sw * swxy - swx * swy) / denom


def _rank_abs_first(c):
    order = sorted(range(len(c)), key=lambda i: (abs(c[i]), i))
    r = np.empty(len(c), dtype=float)
    for j, i in enumerate(order):
        r[i] = j + 1
    return r


def trim_fill(y, v, method="DL", maxiter=100):
    """Duval-Tweedie L0 trim-and-fill, re-pooled with DL random effects."""
    y = np.asarray(y, float)
    v = np.asarray(v, float)
    k = len(y)
    if k < 3:
        re = dersimonian_laird(y, v)
        return {**re, "method": "TrimFill", "k0": 0, "ok": True}
    slope = _egger_slope(y, v)
    side = "right" if slope < 0 else "left"
    s = 1.0 if side == "left" else -1.0
    order = np.argsort(s * y)
    z = (s * y)[order]
    vz = v[order]
    k0, k0sav, it, betaZ = 0, -1, 0, 0.0
    while abs(k0 - k0sav) > 0 and it < maxiter:
        k0sav = k0
        it += 1
        nt = k - k0
        zt, vzt = z[:nt], vz[:nt]
        tau2t, _ = _dl_tau2(zt, vzt)
        wt = 1.0 / (vzt + tau2t)
        betaZ = float(np.sum(wt * zt) / np.sum(wt))
        ranks = _rank_abs_first(z - betaZ)
        Sr = float(np.sum(ranks[(z - betaZ) > 0]))
        L0 = (4 * Sr - k * (k + 1)) / (2 * k - 1)
        k0 = max(0, int(round(L0)))
    fillY = list(y)
    fillV = list(v)
    for t in range(k - k0, k):
        zImp = 2 * betaZ - z[t]
        fillY.append(s * zImp)
        fillV.append(vz[t])
    fillY = np.asarray(fillY)
    fillV = np.asarray(fillV)
    adj = dersimonian_laird(fillY, fillV)
    return {"method": "TrimFill", "mu": adj["mu"], "se": adj["se"],
            "ci_lo": adj["ci_lo"], "ci_hi": adj["ci_hi"], "tau2": adj["tau2"],
            "k0": k0, "side": side, "ok": True}


# ===========================================================================
# 7. GRMA wrapper (audited kernel, bootstrap percentile CI)
# ===========================================================================

def grma(y, v, B=299, seed=0):
    if _GRMA is None:
        re = reml(y, v)
        return {**re, "method": "GRMA", "ok": False, "fail": "import"}
    g = _GRMA(effect_guard=True)
    try:
        ci = g.bootstrap_ci(y, v, B=B, conf_level=0.95, bca=False, seed=seed)
    except Exception as e:
        re = reml(y, v)
        return {**re, "method": "GRMA", "ok": False, "fail": str(e)}
    mu = ci["estimate"]
    lo, hi = ci.get("ci_lo_pct", np.nan), ci.get("ci_hi_pct", np.nan)
    ok = np.isfinite(lo) and np.isfinite(hi)
    return {"method": "GRMA", "mu": float(mu), "se": float(ci.get("se", np.nan)),
            "ci_lo": float(lo), "ci_hi": float(hi), "tau2": np.nan, "ok": bool(ok)}


# ===========================================================================
# 8. SOTA competitor additions (frontier survey 2026-06-14)
# ---------------------------------------------------------------------------
# Three recognized publication-bias-robust competitors that were NOT in the
# original yardstick, added so the unified estimator is scored against them:
#
#   p-uniform*  van Aert & van Assen (2021, Psychological Methods 26:485;
#               Psychon Bull Rev 2025).  Conditional-likelihood selection
#               model: each study's normal density is divided by the
#               probability of its OWN observed significance category, which
#               makes the likelihood invariant to the publication-probability
#               ratio.  Joint ML over (mu, tau2) on truncated-normal densities;
#               profile-likelihood (LRT-inverted) CI for mu.  Significance is
#               one-sided right-tailed at alpha=0.025 (== two-sided .05), the
#               puniform-package default, with study-specific effect-scale
#               critical value y_cv,i = z_alpha * sqrt(v_i).
#
#   WLS         Stanley & Doucouliagos (2015, Stat Med 34:2116) "unrestricted
#               weighted least squares" / multiplicative-variance MA: the FE
#               (inverse-variance) point estimate with the variance multiplied
#               by phi = Q/(k-1) and a t_{k-1} critical value.  S&D argue the
#               FE/WLS point is LESS publication-bias-biased than the RE point
#               because RE up-weights small (more selected) studies.
#
#   WAAP        Stanley, Doucouliagos & Ioannidis (2017, Stat Med 36:1580)
#               "weighted average of adequately powered" studies: WLS restricted
#               to studies with SE_i <= |WLS estimate|/2.8 (>=80% power to detect
#               the WLS effect at two-sided .05); falls back to WLS if fewer than
#               two studies qualify (the WAAP-WLS hybrid).
# ===========================================================================

_PUNI_ALPHA = 0.025                                   # right-tailed (== two-sided .05)
_PUNI_ZCV = float(ndtri(1.0 - _PUNI_ALPHA))          # 1.959964...
_CHI2_1_95 = 3.841458820694124                        # qchisq(.95, df=1)


def _puni_negll(mu, tau2, y, sig, sigma, ycv):
    """Negative conditional log-likelihood for p-uniform* at (mu, tau2)."""
    if tau2 < 0:
        return 1e12
    s2 = sigma * sigma + tau2
    s = np.sqrt(s2)
    z = (y - mu) / s
    logpdf = -0.5 * np.log(2 * np.pi) - np.log(s) - 0.5 * z * z
    arg = (ycv - mu) / s
    ll = logpdf.copy()
    # P(significant) = sf(arg); P(nonsignificant) = cdf(arg).  Use log-CDF/SF
    # for numerical stability deep in the tails.
    if np.any(sig):
        ll[sig] -= stats.norm.logsf(arg[sig])
    if np.any(~sig):
        ll[~sig] -= stats.norm.logcdf(arg[~sig])
    val = -float(np.sum(ll))
    return val if np.isfinite(val) else 1e12


def _puni_t2hi(v):
    """Finite upper bound on tau2 (keeps the conditional likelihood identified)."""
    return float(max(50.0, 20.0 * np.max(v)))


def _puni_profile(mu, y, sig, sigma, ycv, t2hi):
    """Profile out tau2 in [0, t2hi] at fixed mu. Returns (tau2_hat, nll_min)."""
    f = lambda lt2: _puni_negll(mu, np.exp(lt2), y, sig, sigma, ycv)
    r = optimize.minimize_scalar(f, bounds=(np.log(1e-8), np.log(t2hi)),
                                 method="bounded", options={"xatol": 1e-8})
    nll0 = _puni_negll(mu, 0.0, y, sig, sigma, ycv)     # tau2 = 0 boundary
    if nll0 <= r.fun + 1e-12:
        return 0.0, float(nll0)
    return float(np.exp(r.x)), float(r.fun)


def p_uniform_star(y, v):
    """p-uniform* (van Aert & van Assen 2021), faithful BOUNDED ML.

    The conditional likelihood is poorly identified at small k under strong
    selection (few/no non-significant studies), so mu and tau2 are searched on
    FINITE intervals -- exactly as the `puniform` package bounds its effect-size
    search -- to avoid the documented small-k runaway.  Hitting a search bound is
    surfaced via ok=False rather than reported as a converged estimate.
    """
    y = np.asarray(y, float)
    v = np.asarray(v, float)
    sigma = np.sqrt(v)
    ycv = _PUNI_ZCV * sigma                              # study-specific cutoff
    sig = y >= ycv                                       # one-sided significant
    t2hi = _puni_t2hi(v)
    # Generous but FINITE effect-size search interval (selection biases up, so
    # the correction reaches left; allow a wide left pad).
    span = float(np.max(y) - np.min(y))
    pad = 10.0 * float(np.max(sigma)) + 2.0 * span + 1.0
    mu_lo = float(np.min(y)) - pad
    mu_hi = float(np.max(y)) + 2.0 * float(np.max(sigma)) + 1.0

    mu0 = float(np.clip(_fe_mu(y, v), mu_lo, mu_hi))
    t0 = float(np.clip(_reml_tau2(y, v), 1e-6, t2hi))
    obj = lambda p: _puni_negll(p[0], np.exp(p[1]), y, sig, sigma, ycv)
    try:
        res = optimize.minimize(obj, [mu0, np.log(t0)], method="L-BFGS-B",
                                bounds=[(mu_lo, mu_hi),
                                        (np.log(1e-8), np.log(t2hi))],
                                options={"maxiter": 500, "ftol": 1e-11})
        mu_hat = float(np.clip(res.x[0], mu_lo, mu_hi))
    except Exception:
        re = reml(y, v)
        return {**re, "method": "p-uniform*", "ok": False, "fail": "optim"}
    tau2_hat, nll_min = _puni_profile(mu_hat, y, sig, sigma, ycv, t2hi)
    at_bound = (mu_hat <= mu_lo + 1e-6) or (mu_hat >= mu_hi - 1e-6)

    # Profile-likelihood CI: solve 2*(nll(mu) - nll_min) = qchisq(.95,1),
    # clamped to the finite search interval.
    target = nll_min + 0.5 * _CHI2_1_95
    prof = lambda m: _puni_profile(m, y, sig, sigma, ycv, t2hi)[1]
    se_fe = float(np.sqrt(1.0 / np.sum(1.0 / v)))
    step = max(0.05, 2.0 * se_fe)

    def _root(direction, bound):
        m_in = mu_hat
        for _ in range(60):
            m_out = m_in + direction * step
            if (direction < 0 and m_out <= bound) or (direction > 0 and m_out >= bound):
                m_out = bound
                if prof(m_out) - target < 0:
                    return np.nan            # not bracketed within the interval
            if prof(m_out) - target >= 0:
                try:
                    return float(optimize.brentq(lambda m: prof(m) - target,
                                                 m_in, m_out, xtol=1e-6))
                except Exception:
                    return np.nan
            if m_out == bound:
                return np.nan
            m_in = m_out
        return np.nan

    ci_lo = _root(-1.0, mu_lo)
    ci_hi = _root(+1.0, mu_hi)
    ok = (np.isfinite(ci_lo) and np.isfinite(ci_hi) and not at_bound)
    if np.isfinite(ci_lo) and np.isfinite(ci_hi):
        se = float((ci_hi - ci_lo) / (2.0 * Z975))
    else:
        se = se_fe
        ci_lo, ci_hi = mu_hat - Z975 * se, mu_hat + Z975 * se
    return {"method": "p-uniform*", "mu": mu_hat, "se": se,
            "ci_lo": float(ci_lo), "ci_hi": float(ci_hi), "tau2": tau2_hat,
            "n_sig": int(sig.sum()), "ok": bool(ok)}


def wls_sd(y, v):
    """Unrestricted WLS / multiplicative-variance MA (Stanley-Doucouliagos 2015)."""
    y = np.asarray(y, float)
    v = np.asarray(v, float)
    k = len(y)
    w = 1.0 / v
    W = float(w.sum())
    beta = float(np.sum(w * y) / W)
    Q = float(np.sum(w * (y - beta) ** 2))
    phi = Q / (k - 1) if k > 1 else 1.0          # multiplicative dispersion (unfloored)
    se = float(np.sqrt(phi / W))
    tcrit = stats.t.ppf(0.975, max(1, k - 1))
    return {"method": "WLS", "mu": beta, "se": se,
            "ci_lo": beta - tcrit * se, "ci_hi": beta + tcrit * se,
            "tau2": np.nan, "phi": phi, "ok": True}


def waap(y, v):
    """Weighted average of adequately powered studies (Stanley-Doucouliagos-Ioannidis 2017)."""
    y = np.asarray(y, float)
    v = np.asarray(v, float)
    k = len(y)
    base = wls_sd(y, v)
    beta_wls = base["mu"]
    se_i = np.sqrt(v)
    if abs(beta_wls) > 0:
        powered = se_i <= (abs(beta_wls) / 2.8)        # >=80% power at two-sided .05
    else:
        powered = np.zeros(k, bool)
    npow = int(powered.sum())
    if npow >= 2:
        yp, vp = y[powered], v[powered]
        w = 1.0 / vp
        W = float(w.sum())
        beta = float(np.sum(w * yp) / W)
        Q = float(np.sum(w * (yp - beta) ** 2))
        phi = Q / (npow - 1) if npow > 1 else 1.0
        se = float(np.sqrt(phi / W))
        tcrit = stats.t.ppf(0.975, max(1, npow - 1))
        return {"method": "WAAP", "mu": beta, "se": se,
                "ci_lo": beta - tcrit * se, "ci_hi": beta + tcrit * se,
                "tau2": np.nan, "n_powered": npow, "ok": True}
    return {**base, "method": "WAAP", "n_powered": npow, "ok": True}


# ===========================================================================
# 9. Henmi-Copas robust confidence interval (port of metafor::hc.rma.uni)
# ===========================================================================

def henmi_copas(y, v, level=0.05):
    """Henmi & Copas (2010) confidence interval, robust to publication bias.

    Faithful line-by-line port of ``metafor::hc.rma.uni`` (metafor 5.0.1). The
    point estimate is the FIXED-EFFECT weighted mean (H&C's central argument:
    the FE estimator is less sensitive to small-study/publication bias than the
    random-effects estimator, because RE up-weights the small, more-selected
    studies). The interval is NOT the naive Wald interval: the distribution of
    the standardised statistic is approximated by matching the first two moments
    of the heterogeneity statistic Q to a gamma distribution (EQ/VQ below), and
    the critical value ``t0`` is obtained by a uniroot over an integral of that
    gamma CDF against the standard normal density. This widens the interval to
    restore coverage under the unknown heterogeneity/selection.

    Unit-tested for numerical agreement against ``metafor::hc()`` (see
    tests/test_henmi_copas.py + hc_reference.json). Returns the standard method
    dict; ``ok=False`` (with a DL fallback) if k<2 or the uniroot fails.
    """
    y = np.asarray(y, float)
    v = np.asarray(v, float)
    k = len(y)
    if k < 2 or np.any(v <= 0):
        re = dersimonian_laird(y, v)
        return {**re, "method": "HenmiCopas", "ok": False,
                "fail": "k<2" if k < 2 else "nonpos_var"}

    wi = 1.0 / v
    W1 = float(np.sum(wi))
    W2 = float(np.sum(wi ** 2) / W1)          # NB: metafor's W2..W4 are sum(wi^j)/W1
    W3 = float(np.sum(wi ** 3) / W1)
    W4 = float(np.sum(wi ** 4) / W1)
    beta = float(np.sum(wi * y) / W1)         # fixed-effect point estimate
    Q = float(np.sum(wi * (y - beta) ** 2))
    tau2 = max(0.0, (Q - (k - 1)) / (W1 - W2))
    vb = (tau2 * W2 + 1.0) / W1
    se = float(np.sqrt(vb))
    VR = 1.0 + tau2 * W2
    SDR = float(np.sqrt(VR))

    def EQ(r):
        return ((k - 1) + tau2 * (W1 - W2)
                + tau2 ** 2 * ((1.0 / VR ** 2) * r ** 2 - 1.0 / VR) * (W3 - W2 ** 2))

    def VQ(r):
        rsq = r * r
        recipvr2 = 1.0 / VR ** 2
        return (2 * (k - 1) + 4 * tau2 * (W1 - W2)
                + 2 * tau2 ** 2 * (W1 * W2 - 2 * W3 + W2 ** 2)
                + 4 * tau2 ** 2 * (recipvr2 * rsq - 1.0 / VR) * (W3 - W2 ** 2)
                + 4 * tau2 ** 3 * (recipvr2 * rsq - 1.0 / VR) * (W4 - 2 * W2 * W3 + W2 ** 3)
                + 2 * tau2 ** 4 * (recipvr2 - 2 * (1.0 / VR ** 3) * rsq) * (W3 - W2 ** 2) ** 2)

    def scale(r):
        return VQ(r) / EQ(r)

    def shape(r):
        return EQ(r) ** 2 / VQ(r)

    def finv(f):
        return (W1 / W2 - 1.0) * (f ** 2 - 1.0) + (k - 1)

    def eqn(x):
        def integrand(r):
            sc = scale(SDR * r)
            sh = shape(SDR * r)
            # R's pgamma(q, scale, shape) == scipy gamma.cdf(q, a=shape, scale=scale)
            return stats.gamma.cdf(finv(r / x), a=sh, scale=sc) * stats.norm.pdf(r)
        integral = integrate.quad(integrand, x, np.inf, limit=200)[0]
        return integral - level / 2.0

    # uniroot over (0, 2] as in metafor (lower bound nudged off 0 to avoid r/x->inf).
    try:
        lo, hi = 1e-8, 2.0
        flo, fhi = eqn(lo), eqn(hi)
        # metafor brackets on [0,2]; expand upper if the sign change is past 2.
        tries = 0
        while flo * fhi > 0 and hi < 16.0 and tries < 6:
            hi *= 2.0
            fhi = eqn(hi)
            tries += 1
        if flo * fhi > 0:
            raise ValueError("HC root not bracketed")
        t0 = float(optimize.brentq(eqn, lo, hi, xtol=np.finfo(float).eps ** 0.25,
                                   maxiter=1000))
    except Exception as e:
        re = dersimonian_laird(y, v)
        return {**re, "method": "HenmiCopas", "ok": False, "fail": f"uniroot:{e}"}

    u0 = SDR * t0
    ci_lo = beta - u0 * se
    ci_hi = beta + u0 * se
    return {"method": "HenmiCopas", "mu": beta, "se": se,
            "ci_lo": float(ci_lo), "ci_hi": float(ci_hi),
            "tau2": float(tau2), "hc_crit": float(u0), "ok": True}


# ===========================================================================
# Registry
# ===========================================================================

ALL_METHODS = {
    "DL": dersimonian_laird,
    "REML": reml,
    "PM": paule_mandel,
    "HKSJ": hksj,
    "VeveaHedges": vevea_hedges,
    "Copas": copas_shi,
    "RoBMA": robma,
    "PET-PEESE": pet_peese,
    "GRMA": grma,
    "TrimFill": trim_fill,
    "p-uniform*": p_uniform_star,
    "WLS": wls_sd,
    "WAAP": waap,
    "HenmiCopas": henmi_copas,
}


# ---------------------------------------------------------------------------
# Unified-estimator contributions (this branch). Registered LAST so all base
# kernels above are fully defined before sbi/robust_selection import this module
# (features.py -> methods.py would otherwise hit a partially-initialised module).
# ---------------------------------------------------------------------------
_UNIFIED_IMPORT_ERR = None
try:
    from sbi import npe as _npe
    from robust_selection import pvs as _pvs, partial_id as _partial_id
    from unified import unified as _unified
    ALL_METHODS["NPE"] = _npe
    ALL_METHODS["PVS"] = _pvs
    ALL_METHODS["PartialID"] = _partial_id
    ALL_METHODS["Unified"] = _unified
except Exception as _e:  # pragma: no cover
    _UNIFIED_IMPORT_ERR = _e


def run_all(y, v, seed=0):
    out = {}
    for name, fn in ALL_METHODS.items():
        try:
            if name == "GRMA":
                out[name] = fn(y, v, seed=seed)
            else:
                out[name] = fn(y, v)
        except Exception as e:
            out[name] = {"method": name, "mu": np.nan, "se": np.nan,
                         "ci_lo": np.nan, "ci_hi": np.nan, "tau2": np.nan,
                         "ok": False, "fail": repr(e)}
    return out
