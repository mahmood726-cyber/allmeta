"""
mech_ensemble.py — Mechanism-aware ensemble corrector (frontier roadmap P0).

The head-to-head (frontier_survey.md §4) showed the corrector families have
DISJOINT winning regions *by bias*:

  * clean data (no selection)  -> small-study / FE family (DL, WLS, p-uniform*)
                                  are unbiased; NPE pays a de-biasing "tax".
  * any selection (step/copas) -> NPE is the bias winner AND has by far the best
                                  coverage / type-I; the small-study methods'
                                  type-I explodes (0.15-0.28).

So a *point* router can only help on clean data — and the severity gate in
sbi.py already does exactly that (route the point toward DL when severity is
low). The genuine remaining opportunity is on the INTERVAL: NPE alone has
coverage dips under strong/OOD selection, while the always-union Unified buys
coverage everywhere at a permanent width premium. A mechanism-aware ensemble can
try to Pareto-improve that frontier: keep NPE's tight interval on easy cells and
widen (union with the Manski partial-identification bound) ONLY where a
selection mechanism or out-of-distribution signature is actually detected.

This module builds that ensemble explicitly and is scored honestly against every
individual method (validate_ensemble.py). It REUSES the production gated NPE
(sbi.npe) so its point inherits the P1.1 clean-data fix.

Components
----------
  detect_mechanism(feats) -> soft weights over {clean, step, copas} + an OOD /
      disagreement score, all from the permutation-invariant features.
  mech_ensemble(y, v)     -> drop-in harness method.

Determinism / permutation-invariance are inherited from the base methods (all
deterministic functions of the unordered (y, v) set).
"""

import os

import numpy as np

import features as F
import methods as M
import train_sbi as T
from sbi import npe as _npe, severity_gate as _gate
from robust_selection import partial_id as _partial_id

_I = {n: i for i, n in enumerate(F.FEATURE_NAMES)}

# Interval-widen trigger config (frozen from validate_ensemble.py on the grid).
#   _OOD_K   : component-disagreement (max-min point spread) / NPE half-width
#              above which we treat the cell as OOD/uncertain and widen.
#   _NPE_SCALE: NPE interval scale before combining (matches Unified's frozen 1.15
#              calibration so the comparison is apples-to-apples).
_OOD_K = float(os.environ.get("MECH_OOD_K", "1.25"))
_NPE_SCALE = float(os.environ.get("MECH_NPE_SCALE", "1.15"))
_WIDEN = os.environ.get("MECH_WIDEN", "1") != "0"


def detect_mechanism(feats):
    """Soft mechanism signature from features. Returns a dict of interpretable
    scores in roughly [0, 1+]; not a hard label (kept soft for the ensemble)."""
    sev = T._sev_proxy(feats)
    step_fp = max(0.0, feats[_I["p_bin_lo"]] - feats[_I["p_bin_hi"]]) \
        + max(0.0, -feats[_I["resid_skew"]])           # p-step surplus + left-skew
    copas_fp = abs(feats[_I["corr_y_se"]]) + abs(feats[_I["ptl_se_signal"]])
    clean_w = 1.0 - _gate(sev)                          # 1 on clean, 0 under selection
    tot = step_fp + copas_fp + 1e-9
    return {"sev": float(sev), "step": float(step_fp), "copas": float(copas_fp),
            "clean_w": float(clean_w),
            "step_w": float(step_fp / tot * (1 - clean_w)),
            "copas_w": float(copas_fp / tot * (1 - clean_w))}


def _scale_iv(mu, lo, hi, s):
    if s == 1.0 or not (np.isfinite(lo) and np.isfinite(hi) and np.isfinite(mu)):
        return lo, hi
    return mu - s * (mu - lo), mu + s * (hi - mu)


def mech_ensemble(y, v, widen=None, ood_k=None, npe_scale=None):
    """Mechanism-aware ensemble: production gated-NPE point + selectively-widened
    interval. Drop-in (y, v) -> method dict."""
    widen = _WIDEN if widen is None else widen
    ood_k = _OOD_K if ood_k is None else ood_k
    s = _NPE_SCALE if npe_scale is None else npe_scale
    y = np.asarray(y, float)
    v = np.asarray(v, float)

    a = _npe(y, v)                                       # gated NPE (point + conformal CI)
    if not (a.get("ok") and np.isfinite(a.get("mu", np.nan))):
        re = M.reml(y, v)
        return {**re, "method": "MechEnsemble", "ok": False, "fail": "npe_failed"}

    mu = a["mu"]
    a_lo, a_hi = _scale_iv(mu, a["ci_lo"], a["ci_hi"], s)
    hw = max(1e-9, (a_hi - a_lo) / 2.0)

    # Component point spread -> model-agnostic uncertainty / OOD signal.
    feats = F.featurize(y, v)
    mech = detect_mechanism(feats)
    pts = [mu, float(M.dersimonian_laird(y, v)["mu"]), float(M.wls_sd(y, v)["mu"])]
    try:
        # p-uniform* POINT only (selection-model corner of the disagreement signal);
        # ci=False skips the expensive profile CI -> ~6x faster, point unchanged.
        rp = M.p_uniform_star(y, v, ci=False)
        if np.isfinite(rp.get("mu", np.nan)):
            pts.append(float(rp["mu"]))
    except Exception:
        pass
    spread = (max(pts) - min(pts)) if len(pts) > 1 else 0.0
    ood = spread / hw

    b = _partial_id(y, v)
    b_ok = b.get("ok") and np.isfinite(b.get("mu", np.nan))
    pid_disagree = b_ok and ((b["mu"] < a_lo) or (b["mu"] > a_hi))

    lo, hi = a_lo, a_hi
    triggered = bool(widen and b_ok and (pid_disagree or ood >= ood_k))
    if triggered:
        lo = min(a_lo, b["ci_lo"])
        hi = max(a_hi, b["ci_hi"])
    mu = float(min(max(mu, lo), hi))
    se = (hi - lo) / (2 * 1.959963985)
    return {"method": "MechEnsemble", "mu": mu, "se": se,
            "ci_lo": float(lo), "ci_hi": float(hi),
            "tau2": float(a.get("tau2", np.nan)),
            "widened": triggered, "ood": float(ood),
            "mech": mech, "ok": True}


if __name__ == "__main__":
    import dgp
    rng = np.random.default_rng(4)
    for sc in dgp.SCENARIOS + dgp.STRESS_SCENARIOS:
        for k in (5, 25):
            y, v, _ = dgp.generate(0.3, 0.05, k, sc, rng)
            r = mech_ensemble(y, v)
            print(f"{sc:13s} k={k:2d} mu={r['mu']:+.3f} "
                  f"ci=[{r['ci_lo']:+.3f},{r['ci_hi']:+.3f}] "
                  f"widen={int(r['widened'])} ood={r['ood']:.2f}")
