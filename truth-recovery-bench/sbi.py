"""
sbi.py — Online amortized estimator (Track 1): NPE-style + conformal.

Loads the offline-trained artifact (sbi_model.pkl) and exposes `npe(y, v)`, a
drop-in method for the truth-recovery harness. The point estimate is the
de-biased conditional median; the interval is the Mondrian-conformalised
quantile interval (honest finite-sample coverage). Inference reuses the EXACT
predict/conformal code paths from train_sbi.py so train/infer parity is
structural, not just intended.

If the artifact is missing the method degrades gracefully (REML fallback,
ok=False) so the harness never crashes — but a real run requires training first
(`python train_sbi.py`).

Severity-gated correction (P1.1, this branch)
---------------------------------------------
The trained NPE applies a learned downward de-biasing residual even when the
data shows NO observable selection. On clean (`none`) data that residual is a
pure tax: |bias| ~0.055 vs DerSimonian-Laird's ~0.004 (DL is unbiased with no
selection). A global retrain could not remove this tax without collapsing
coverage under strong selection (see ROBUST_RETRAIN.md) — the two objectives
are in direct tension under any fixed training mixture.

The fix is an INFERENCE-TIME gate, not a retrain. We reuse the selection-
severity score the estimator already computes for its Mondrian conformal bins
(`train_sbi._sev_proxy`) and dial the NPE point estimate back toward the
unbiased DL estimate when that severity is low:

    g       = smoothstep((sev - S0) / (S1 - S0))   in [0, 1]
    mu_gate = DL_mu + g * (NPE_mu - DL_mu)          (clamped into the interval)

g -> 0 on clean data (recover DL's near-zero bias); g -> 1 under strong
selection (keep the full NPE correction). Crucially the gate touches ONLY the
point estimate — the conformal INTERVAL, tau2 and SE are returned verbatim — so
coverage, interval width and type-I error are mathematically IDENTICAL to the
ungated NPE on every cell. The only price is a modest rise in the point bias
under selection (still far below DL's), which is reported honestly. The gate is
on by default and fully reproducible/disable-able via env vars (SBI_GATE=0
recovers the exact ungated estimator for A/B).
"""

import os
import pickle

import numpy as np

import features as F
import methods as M
import train_sbi as T

# --- Severity gate config (inference-time; no retrain) ---------------------
# S0: severity at/below which the NPE correction is fully dialled back to DL
#     (gate g=0). S1: severity at/above which the full NPE correction is kept
#     (gate g=1). Chosen on the known-truth grid (explore_gate*.py) to push the
#     clean-data bias toward DL's ~0.004 while leaving the under-selection
#     coverage advantage untouched. _sev_proxy is the exact score the conformal
#     calibrator already bins on, so no new signal is introduced.
_GATE_ON = os.environ.get("SBI_GATE", "1") != "0"
_GATE_S0 = float(os.environ.get("SBI_GATE_S0", "2.0"))
_GATE_S1 = float(os.environ.get("SBI_GATE_S1", "6.0"))


def _smoothstep(g):
    """Hermite smoothstep on a value already clamped to [0, 1]."""
    g = min(1.0, max(0.0, g))
    return g * g * (3.0 - 2.0 * g)


def severity_gate(sev, s0=None, s1=None):
    """Gate weight g(sev) in [0, 1]: 0 = no selection signal (use DL point),
    1 = strong selection (keep full NPE correction)."""
    s0 = _GATE_S0 if s0 is None else s0
    s1 = _GATE_S1 if s1 is None else s1
    if s1 <= s0:
        return 1.0
    return _smoothstep((sev - s0) / (s1 - s0))

HERE = os.path.dirname(os.path.abspath(__file__))
# Allow an explicit override (used to A/B trained artifacts on identical seeds)
# without editing code; defaults to the canonical artifact.
_MODEL_PATH = os.environ.get("SBI_MODEL_PATH") or os.path.join(HERE, "sbi_model.pkl")
_ART = None
_LOAD_ERR = None


def _load():
    global _ART, _LOAD_ERR
    if _ART is not None or _LOAD_ERR is not None:
        return _ART
    try:
        with open(_MODEL_PATH, "rb") as f:
            _ART = pickle.load(f)
        # parity guard: feature spec must match the live featurizer
        if _ART["feature_names"] != F.FEATURE_NAMES:
            raise ValueError("feature spec drift between model and features.py")
    except Exception as e:
        _LOAD_ERR = e
        _ART = None
    return _ART


def npe(y, v):
    """Amortized neural-posterior-style estimator with conformal calibration."""
    art = _load()
    if art is None:
        re = M.reml(y, v)
        return {**re, "method": "NPE", "ok": False, "fail": f"no_model:{_LOAD_ERR}"}
    y = np.asarray(y, float)
    v = np.asarray(v, float)
    try:
        x = F.featurize(y, v).reshape(1, -1)
    except Exception as e:
        re = M.reml(y, v)
        return {**re, "method": "NPE", "ok": False, "fail": f"feat:{e}"}
    q_grid = art["q_grid"]
    models = art["models"]
    conf = art["conformal"]
    P = T.predict_grid(models, q_grid, x)[0]          # mu-space quantiles
    d = T.conformal_d(conf, x[0])
    lo = float(P[conf["lo_idx"]] - d)
    hi = float(P[conf["hi_idx"]] + d)
    mu = float(P[q_grid.index(0.5)])
    # Severity-gated point correction: dial the NPE estimate back toward the
    # unbiased DL estimate when the observable selection severity is low. Only
    # the POINT moves; the conformal interval below is left untouched, so
    # coverage / width / type-I are identical to the ungated NPE.
    if _GATE_ON:
        sev = T._sev_proxy(x[0])
        g = severity_gate(sev)
        if g < 1.0:
            dl_mu = float(M.dersimonian_laird(y, v)["mu"])   # unbiased anchor on clean data
            mu = dl_mu + g * (mu - dl_mu)
    # clamp point inside its own interval (monotone safety)
    mu = min(max(mu, lo), hi)
    tau2 = float(art["tau2_model"].predict(x)[0])
    tau2 = max(0.0, tau2)
    se = (hi - lo) / (2 * 1.959963985)                 # nominal Wald-equivalent SE
    return {"method": "NPE", "mu": mu, "se": se,
            "ci_lo": lo, "ci_hi": hi, "tau2": tau2, "ok": True}


if __name__ == "__main__":
    import dgp
    rng = np.random.default_rng(11)
    for sc in dgp.SCENARIOS:
        y, v, _ = dgp.generate(0.3, 0.05, 15, sc, rng)
        r = npe(y, v)
        print(f"{sc:14s} mu={r['mu']:+.3f} ci=[{r['ci_lo']:+.3f},{r['ci_hi']:+.3f}] "
              f"tau2={r['tau2']:.3f} ok={r['ok']}")
