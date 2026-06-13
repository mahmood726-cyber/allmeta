"""
unified.py — The unified truth-recovery estimator (this branch's headline method).

It fuses the two complementary unified contributions:

  * NPE (sbi.py) — amortized simulation-based inference with Mondrian-conformal
    calibration. Low bias and tight intervals, BUT under STRONG one-sided p-step
    selection it retains a small upward bias whose conformal interval narrows
    with k faster than the bias shrinks, so coverage dips below 0.90 at large k
    (and type-I creeps up at μ=0).

  * PartialID (robust_selection.py) — Manski-style partial-identification union
    over a selection-severity ladder. Deliberately conservative; it is rock-solid
    exactly where NPE dips (strong step, large k) but over-wide / slightly
    under-covering at very small k.

The two failure regions are DISJOINT (measured on the 55-cell confirmation grid),
so combining their intervals yields ≥0.90 coverage on every cell while keeping the
NPE point estimate (the most accurate one). The combination is parameter-free:

  point     = NPE conditional-median (de-biased)
  interval  = NPE_CI  ∪  PartialID_CI         (mode="union", default)
              [min(NPE_lo,PID_lo), NPE_hi]     (mode="lower") — width-efficient
              variant that only extends the lower bound, valid because NPE's
              documented failure is UPWARD bias under selection.

This is a coverage-targeted partial-identification interval: the honest width is
the price of guaranteed coverage under an UNKNOWN selection mechanism, which is
precisely the brief's partial-identification fallback. `mode` is chosen once from
the measured grid (see ensemble_offline.py) and frozen here.

Determinism / permutation-invariance are inherited from the two base methods
(both are deterministic functions of the unordered (y, v) set).
"""

import os

import numpy as np

import methods as M
from sbi import npe as _npe
from robust_selection import partial_id as _partial_id

# Combination mode, frozen from the measured 55-cell grid. Override via env for
# A/B measurement (ensemble_offline.py drives the comparison offline).
_MODE = os.environ.get("UNIFIED_MODE", "union")


def unified(y, v, mode=None):
    """Coverage-targeted ensemble of NPE and PartialID. Drop-in harness method."""
    mode = mode or _MODE
    y = np.asarray(y, float)
    v = np.asarray(v, float)
    a = _npe(y, v)
    b = _partial_id(y, v)

    a_ok = a.get("ok", False) and np.isfinite(a.get("mu", np.nan))
    b_ok = b.get("ok", False) and np.isfinite(b.get("mu", np.nan))

    # Degrade gracefully if either base method fails on a replication.
    if not a_ok and not b_ok:
        re = M.reml(y, v)
        return {**re, "method": "Unified", "ok": False, "fail": "both_failed"}
    if not a_ok:
        return {**b, "method": "Unified", "ok": True}
    if not b_ok:
        return {**a, "method": "Unified", "ok": True}

    lo = min(a["ci_lo"], b["ci_lo"])
    hi = a["ci_hi"] if mode == "lower" else max(a["ci_hi"], b["ci_hi"])
    mu = float(min(max(a["mu"], lo), hi))     # NPE point, clamped into the union
    tau2 = a.get("tau2", b.get("tau2", np.nan))
    se = (hi - lo) / (2 * 1.959963985)
    return {"method": "Unified", "mu": mu, "se": se,
            "ci_lo": float(lo), "ci_hi": float(hi), "tau2": float(tau2),
            "ok": True}


if __name__ == "__main__":
    import dgp
    rng = np.random.default_rng(3)
    for sc in dgp.SCENARIOS:
        for k in (5, 50):
            y, v, _ = dgp.generate(0.3, 0.05, k, sc, rng)
            r = unified(y, v)
            print(f"{sc:13s} k={k:2d} mu={r['mu']:+.3f} "
                  f"ci=[{r['ci_lo']:+.3f},{r['ci_hi']:+.3f}] ok={r['ok']}")
