"""
truth_recovery — packaged, importable "Unified truth-recovery (honest coverage)" engine.

This de-branches the validated estimator from `truth-recovery-bench` (origin branch
`truth-recovery-est-v3`) into a clean, importable engine usable from production tools.

The validated source modules (unified / sbi / robust_selection / methods / features /
train_sbi / dgp) and the trained artifact `sbi_model.pkl` are vendored VERBATIM under
`_vendor/`, so the packaged engine computes the EXACT numbers that were validated on the
55-cell known-truth grid (min coverage 0.927, mean 0.989, type-I <=0.054). See README.md.

Public API
----------
    from truth_recovery import estimate
    r = estimate(y, v)          # y = effect sizes, v = sampling variances
    r["point"], r["ci_lo"], r["ci_hi"]      # honest-coverage interval
    r["partial_id"]["ci_lo"], r["partial_id"]["ci_hi"]   # Manski partial-ID bounds
    r["gate_fired"]             # True when PartialID widened the NPE interval

Frozen v3 default config: mode="gated", npe_scale=1.15 (the width-minimal config that
holds >=0.90 coverage and type-I <=0.07 on every one of the 55 cells). Override via
the `mode`/`npe_scale` args or the UNIFIED_MODE / UNIFIED_NPE_SCALE env vars.

Honesty note: the NPE component is amortized on a simulation DGP (generic effect scale,
mu~0.3, tau2~0.05). On data far from that domain (e.g. log-OR / log-HR with large |effect|),
the NPE is OUT OF DISTRIBUTION; the partial-identification backstop is what keeps the
interval honest there, and `gate_fired` / `npe.ok` flag when that is happening. Treat
such results as set-identified bounds, not amortized posteriors.
"""

import os
import sys
import threading

import numpy as np

__version__ = "3.0.0"

# Frozen from the measured 55-cell grid (explore_tighten.py picks the width-minimal
# config holding min-coverage >=0.90 and type-I <=0.07). These match unified.py.
UNIFIED_MODE_DEFAULT = "gated"
UNIFIED_NPE_SCALE_DEFAULT = 1.15
COVERAGE_TARGET = 0.90

_HERE = os.path.dirname(os.path.abspath(__file__))
_VENDOR = os.path.join(_HERE, "_vendor")
_import_lock = threading.Lock()
_mods = None  # cached (unified, sbi, robust_selection, methods) handle


def _load_vendor():
    """Import the vendored validated modules exactly once.

    The vendored modules cross-import by bare top-level name (`import methods`,
    `import sbi`, ...), which is how they were validated. We make those names
    resolvable by putting `_vendor/` at the front of sys.path for the import, then
    cache the resolved module objects so callers never touch sys.path again.
    """
    global _mods
    if _mods is not None:
        return _mods
    with _import_lock:
        if _mods is not None:
            return _mods
        added = False
        if _VENDOR not in sys.path:
            sys.path.insert(0, _VENDOR)
            added = True
        try:
            import unified as _unified
            import sbi as _sbi
            import robust_selection as _rs
            import methods as _methods
        finally:
            if added:
                try:
                    sys.path.remove(_VENDOR)
                except ValueError:
                    pass
        _mods = (_unified, _sbi, _rs, _methods)
        return _mods


def model_path():
    """Absolute path of the trained NPE artifact the engine will load."""
    return os.environ.get("SBI_MODEL_PATH") or os.path.join(_VENDOR, "sbi_model.pkl")


def _as_yv(y, v=None, se=None):
    y = np.asarray(y, dtype=float).ravel()
    if v is None and se is None:
        raise ValueError("provide either v (variances) or se (standard errors)")
    if v is None:
        v = np.asarray(se, dtype=float).ravel() ** 2
    else:
        v = np.asarray(v, dtype=float).ravel()
    if y.shape != v.shape:
        raise ValueError(f"y and v/se length mismatch: {y.shape} vs {v.shape}")
    if y.size < 2:
        raise ValueError("need at least k=2 studies")
    if not np.all(np.isfinite(y)) or not np.all(np.isfinite(v)) or np.any(v <= 0):
        raise ValueError("y must be finite and v/se strictly positive")
    return y, v


def _iv(d):
    """Extract a {mu, ci_lo, ci_hi, ok} view from a method-result dict."""
    return {
        "mu": float(d.get("mu", np.nan)),
        "ci_lo": float(d.get("ci_lo", np.nan)),
        "ci_hi": float(d.get("ci_hi", np.nan)),
        "tau2": float(d.get("tau2", np.nan)),
        "ok": bool(d.get("ok", False)),
    }


def estimate(y, v=None, se=None, mode=None, npe_scale=None):
    """Unified truth-recovery estimate with an honest-coverage interval.

    Parameters
    ----------
    y : array-like
        Study effect sizes on the analysis scale. For ratio measures pass the LOG
        effect (logRR / logOR / logHR), not the ratio.
    v : array-like, optional
        Per-study sampling variances. Provide this OR `se`.
    se : array-like, optional
        Per-study standard errors (used as v = se**2 when `v` is omitted).
    mode, npe_scale : optional
        Override the frozen gated / 1.15 config (for A/B only).

    Returns
    -------
    dict with:
        point, ci_lo, ci_hi, se, tau2, ok   -- headline (identical to the validated
                                               unified.unified() output)
        partial_id : {mu, ci_lo, ci_hi, ok} -- Manski partial-identification bounds
        npe        : {mu, ci_lo, ci_hi, ok} -- amortized NPE component
        gate_fired : bool                    -- True when PartialID widened the interval
        k, engine, version, config, notes
    """
    y, v = _as_yv(y, v, se)
    unified, sbi, rs, _methods = _load_vendor()

    mode = mode or os.environ.get("UNIFIED_MODE", UNIFIED_MODE_DEFAULT)
    scale = float(npe_scale if npe_scale is not None
                  else os.environ.get("UNIFIED_NPE_SCALE", UNIFIED_NPE_SCALE_DEFAULT))

    head = unified.unified(y, v, mode=mode, npe_scale=scale)   # validated headline
    npe_r = _iv(sbi.npe(y, v))
    pid_r = _iv(rs.partial_id(y, v))

    # Replicate unified.py's gate decision for transparency (whether PartialID widened
    # the rescaled NPE interval). Only meaningful when both components are ok.
    gate_fired = False
    if npe_r["ok"] and pid_r["ok"] and np.isfinite(npe_r["mu"]):
        a_lo, a_hi = unified._scale_iv(npe_r["mu"], npe_r["ci_lo"], npe_r["ci_hi"], scale)
        gate_fired = bool((pid_r["mu"] < a_lo) or (pid_r["mu"] > a_hi))

    notes = []
    if not npe_r["ok"]:
        notes.append("NPE component unavailable/failed; headline fell back to the "
                     "partial-ID / REML path (see ok flag).")
    if gate_fired:
        notes.append("Gate fired: PartialID disagreed with NPE about location and "
                     "widened the interval (possible selection / domain shift).")

    return {
        "engine": "unified-truth-recovery",
        "version": __version__,
        "config": {"mode": mode, "npe_scale": scale,
                   "coverage_target": COVERAGE_TARGET},
        "k": int(y.size),
        "point": float(head["mu"]),
        "ci_lo": float(head["ci_lo"]),
        "ci_hi": float(head["ci_hi"]),
        "se": float(head.get("se", np.nan)),
        "tau2": float(head.get("tau2", np.nan)),
        "ok": bool(head.get("ok", False)),
        "gate_fired": gate_fired,
        "partial_id": pid_r,
        "npe": npe_r,
        "notes": notes,
    }


def info():
    """Lightweight engine descriptor (no heavy compute)."""
    return {
        "engine": "unified-truth-recovery",
        "label": "Unified truth-recovery (honest coverage)",
        "version": __version__,
        "config": {"mode": UNIFIED_MODE_DEFAULT,
                   "npe_scale": UNIFIED_NPE_SCALE_DEFAULT,
                   "coverage_target": COVERAGE_TARGET},
        "model_path": model_path(),
        "model_present": os.path.exists(model_path()),
    }
