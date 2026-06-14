"""
robust_selection.py — Track 2: incremental robust selection models.

Two estimators that attack the benchmark's two documented selection-model
failures directly:

1. PVS — Penalized, model-averaged Vevea-Hedges.
   Fixes Vevea's k<=10 blow-up (delta/tau2 non-identification -> runaway optima,
   |mu_hat|>400) with three standard small-sample devices:
     * a weakly-informative ridge prior on log-delta (shrinks the selection
       weights toward 1 = mild selection) — a Firth/bias-reduction-style
       penalty that regularises the near-flat likelihood at small k;
     * hard BOUNDS on (mu, tau2, delta) via L-BFGS-B so no excursion can run
       away to the degenerate normaliser;
     * model-averaging across candidate p-value step structures {(.025),
       (.025,.05), (.05)} weighted by penalised BIC, so the result is robust to
       the unknown cut geometry. The averaged variance adds within- + between-
       model uncertainty.

2. PartialID — Manski-style partial-identification bounds.
   When the selection mechanism/severity is UNKNOWN, the pooled mu is only
   set-identified. PartialID fits the step model with delta FIXED at a ladder of
   plausible severities (none -> severe), and reports the UNION of the resulting
   confidence intervals as an honest bound, with the penalised-likelihood-
   weighted average as the point. An honest wide interval beats a falsely-precise
   point — exactly the brief's partial-identification fallback.

Both reuse the audited Vevea negative-log-likelihood kernel in methods.py so the
likelihood is identical to the validated port.
"""

import numpy as np
from scipy import optimize, stats

import methods as M

Z975 = stats.norm.ppf(0.975)
_STEP_CONFIGS = [(0.025,), (0.025, 0.05), (0.05,)]
# Severity ladder for the (0.025, 0.05) step structure: delta = [1, w1, w2].
_SEVERITY_LADDER = {
    "none":     [1.0, 1.0, 1.0],
    "mild":     [1.0, 0.80, 0.60],
    "moderate": [1.0, 0.50, 0.30],
    "strong":   [1.0, 0.30, 0.12],
    "severe":   [1.0, 0.15, 0.05],
}


def _build_ctx(y, v, steps):
    steps_arr = np.asarray(sorted(steps), float)
    sv = np.sqrt(v)
    zc = M.ndtri(1.0 - steps_arr)
    p_one = 1.0 - M.ndtr(y / sv)
    jidx = np.searchsorted(steps_arr, p_one, side="right")
    return {"sv": sv, "zc": zc, "jidx": jidx}, steps_arr


def _penalized_fit(y, v, steps, lam=0.5):
    """Penalised Vevea fit for one step config. Returns dict or None."""
    ctx, steps_arr = _build_ctx(y, v, steps)
    nDelta = len(steps)
    mu0, t20, _ = M._unadjusted_ml(y, v)
    t20 = max(1e-6, t20)

    def obj(x):
        mu = x[0]
        tau2 = np.exp(x[1])
        logd = x[2:]
        delta = [1.0] + [np.exp(z) for z in logd]
        nll = M._selmodel_negll(y, v, steps, mu, tau2, delta, ctx)
        pen = lam * float(np.sum(logd ** 2))      # ridge toward delta=1
        return nll + pen

    bounds = [(mu0 - 3.0, mu0 + 3.0), (np.log(1e-6), np.log(10.0))] \
        + [(-2.5, 2.5)] * nDelta
    best = None
    for d0 in (0.0, -0.9, -1.6):                  # multi-start on log-delta
        x0 = np.array([mu0, np.log(t20)] + [d0] * nDelta)
        try:
            r = optimize.minimize(obj, x0, method="L-BFGS-B", bounds=bounds,
                                  options={"maxiter": 500, "ftol": 1e-11})
        except Exception:
            continue
        if np.isfinite(r.fun) and (best is None or r.fun < best.fun - 1e-9):
            best = r
    if best is None:
        return None
    mu = float(best.x[0])
    tau2 = float(np.exp(best.x[1]))
    delta = [1.0] + [float(np.exp(z)) for z in best.x[2:]]
    npar = 2 + nDelta
    # penalised BIC (use unpenalised nll for the fit term)
    nll_unpen = M._selmodel_negll(y, v, steps, mu, tau2, delta, ctx)
    bic = 2 * nll_unpen + npar * np.log(len(y))
    # Wald SE for mu from the numerical Hessian of the (penalised) objective
    se = np.nan
    try:
        H = M._num_hessian(obj, best.x, rel=1e-3, absmin=1e-4)
        cov = np.linalg.inv(H)
        if cov[0, 0] > 0 and np.isfinite(cov[0, 0]):
            se = float(np.sqrt(cov[0, 0]))
    except Exception:
        se = np.nan
    if not np.isfinite(se):
        se = float(np.sqrt(1.0 / np.sum(1.0 / (v + tau2))))
    return {"mu": mu, "tau2": tau2, "se": se, "bic": float(bic), "nll": nll_unpen}


def pvs(y, v):
    """Penalised, model-averaged Vevea-Hedges (Track 2)."""
    y = np.asarray(y, float)
    v = np.asarray(v, float)
    fits = []
    for steps in _STEP_CONFIGS:
        f = _penalized_fit(y, v, steps)
        if f is not None and np.isfinite(f["mu"]):
            fits.append(f)
    if not fits:
        re = M.reml(y, v)
        return {**re, "method": "PVS", "ok": False, "fail": "no_fit"}
    bics = np.array([f["bic"] for f in fits])
    w = np.exp(-0.5 * (bics - bics.min()))
    w = w / w.sum()
    mus = np.array([f["mu"] for f in fits])
    ses = np.array([f["se"] for f in fits])
    mu_ma = float(np.sum(w * mus))
    # model-averaged variance: within + between (Burnham-Anderson)
    var_ma = float(np.sum(w * (ses ** 2 + (mus - mu_ma) ** 2)))
    se_ma = np.sqrt(var_ma)
    tau2_ma = float(np.sum(w * np.array([f["tau2"] for f in fits])))
    ok = np.isfinite(se_ma) and se_ma > 0
    return {"method": "PVS", "mu": mu_ma, "se": se_ma,
            "ci_lo": mu_ma - Z975 * se_ma, "ci_hi": mu_ma + Z975 * se_ma,
            "tau2": tau2_ma, "ok": bool(ok)}


def _fixed_delta_fit(y, v, steps, delta):
    """Fit (mu, tau2) with delta FIXED. Returns (mu, se, nll) or None."""
    ctx, _ = _build_ctx(y, v, steps)
    mu0, t20, _ = M._unadjusted_ml(y, v)
    t20 = max(1e-6, t20)

    def obj(x):
        return M._selmodel_negll(y, v, steps, x[0], np.exp(x[1]), delta, ctx)

    bounds = [(mu0 - 3.0, mu0 + 3.0), (np.log(1e-6), np.log(10.0))]
    try:
        r = optimize.minimize(obj, [mu0, np.log(t20)], method="L-BFGS-B",
                              bounds=bounds, options={"maxiter": 400, "ftol": 1e-11})
    except Exception:
        return None
    if not np.isfinite(r.fun):
        return None
    mu = float(r.x[0]); tau2 = float(np.exp(r.x[1]))
    se = np.nan
    try:
        H = M._num_hessian(obj, r.x, rel=1e-3, absmin=1e-4)
        cov = np.linalg.inv(H)
        if cov[0, 0] > 0 and np.isfinite(cov[0, 0]):
            se = float(np.sqrt(cov[0, 0]))
    except Exception:
        se = np.nan
    if not np.isfinite(se):
        se = float(np.sqrt(1.0 / np.sum(1.0 / (v + tau2))))
    return {"mu": mu, "tau2": tau2, "se": se, "nll": float(r.fun)}


def partial_id(y, v):
    """Manski-style partial-identification bounds over a severity ladder."""
    y = np.asarray(y, float)
    v = np.asarray(v, float)
    steps = (0.025, 0.05)
    fits = []
    for name, delta in _SEVERITY_LADDER.items():
        f = _fixed_delta_fit(y, v, steps, delta)
        if f is not None and np.isfinite(f["mu"]) and np.isfinite(f["se"]):
            f["sev"] = name
            fits.append(f)
    if not fits:
        re = M.reml(y, v)
        return {**re, "method": "PartialID", "ok": False, "fail": "no_fit"}
    # union of per-severity CIs = honest identified-set bound
    lo = min(f["mu"] - Z975 * f["se"] for f in fits)
    hi = max(f["mu"] + Z975 * f["se"] for f in fits)
    # point = likelihood-weighted average across the severity ladder
    nlls = np.array([f["nll"] for f in fits])
    w = np.exp(-(nlls - nlls.min()))
    w = w / w.sum()
    mu_pt = float(np.sum(w * np.array([f["mu"] for f in fits])))
    tau2 = float(np.sum(w * np.array([f["tau2"] for f in fits])))
    return {"method": "PartialID", "mu": mu_pt, "se": (hi - lo) / (2 * Z975),
            "ci_lo": float(lo), "ci_hi": float(hi), "tau2": tau2, "ok": True}


if __name__ == "__main__":
    import dgp
    rng = np.random.default_rng(7)
    for sc in dgp.SCENARIOS:
        for k in (5, 15):
            y, v, _ = dgp.generate(0.3, 0.05, k, sc, rng)
            p = pvs(y, v); q = partial_id(y, v)
            print(f"{sc:13s} k={k:2d}  PVS mu={p['mu']:+.3f} "
                  f"ci=[{p['ci_lo']:+.3f},{p['ci_hi']:+.3f}]  "
                  f"PartialID mu={q['mu']:+.3f} ci=[{q['ci_lo']:+.3f},{q['ci_hi']:+.3f}]")
