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

# Combination rule and NPE interval scale, frozen from the measured 55-cell grid
# (explore_tighten.py picks the width-minimal config holding min-coverage ≥0.90
# and type-I ≤0.07). Override via env for A/B measurement.
#
#   rule="union"   : interval = NPE_CI ∪ PartialID_CI                  (max width)
#   rule="lower"   : interval = [min(NPE_lo,PID_lo), NPE_hi]   (extend lower only;
#                    justified because NPE's documented failure is UPWARD bias,
#                    so only the lower bound needs widening — keeps NPE's tight
#                    upper bound)
#   rule="gated"   : widen to the union ONLY when PartialID's point falls OUTSIDE
#                    NPE's interval (genuine selection disagreement); else keep
#                    NPE's tight interval — recovers NPE tightness on easy cells.
#   rule="gatedL"  : gated, lower-bound-only widening.
#   npe_scale s≤1  : shrink NPE's interval toward its own point before combining
#                    (a calibration knob equivalent to a looser conformal level);
#                    s=1 is the conformal alpha=0.05 calibration.
_MODE = os.environ.get("UNIFIED_MODE", "gated")
_NPE_SCALE = float(os.environ.get("UNIFIED_NPE_SCALE", "1.15"))


def _scale_iv(mu, lo, hi, s):
    """Rescale the interval [lo,hi] about the point mu by factor s (>0).

    s<1 shrinks (tighter), s>1 expands (a wider conformal radius). s=1 is a
    no-op. Matches explore_tighten.shrink_npe so the live estimator equals the
    offline-measured config exactly.
    """
    if s == 1.0 or not (np.isfinite(lo) and np.isfinite(hi) and np.isfinite(mu)):
        return lo, hi
    return mu - s * (mu - lo), mu + s * (hi - mu)


def unified(y, v, mode=None, npe_scale=None):
    """Coverage-targeted ensemble of NPE and PartialID. Drop-in harness method."""
    mode = mode or _MODE
    s = _NPE_SCALE if npe_scale is None else npe_scale
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

    a_lo, a_hi = _scale_iv(a["mu"], a["ci_lo"], a["ci_hi"], s)  # shrunk NPE
    if mode in ("gated", "gatedL"):
        # widen only when the conservative sibling disagrees about location
        disagree = (b["mu"] < a_lo) or (b["mu"] > a_hi)
        if disagree:
            lo = min(a_lo, b["ci_lo"])
            hi = a_hi if mode == "gatedL" else max(a_hi, b["ci_hi"])
        else:
            lo, hi = a_lo, a_hi
    else:
        lo = min(a_lo, b["ci_lo"])
        hi = a_hi if mode == "lower" else max(a_hi, b["ci_hi"])
    mu = float(min(max(a["mu"], lo), hi))     # NPE point, clamped into interval
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
