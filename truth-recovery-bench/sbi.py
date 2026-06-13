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
"""

import os
import pickle

import numpy as np

import features as F
import methods as M
import train_sbi as T

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
