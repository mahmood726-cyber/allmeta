"""
explore_tighten.py — Offline width/coverage frontier search for goal 1.

From the per-rep dumps (perrep_npe.json, perrep_partialid.json) we can measure
ANY deterministic ensemble of the two base intervals instantly, with no
re-simulation. This sweeps two knobs:

  1. NPE base-interval SHRINK factor s in (0,1]:  a transparent surrogate for
     recalibrating the conformal layer to a looser target level. The NPE
     interval [lo, hi] is shrunk toward its own point mu:
         lo' = mu - s*(mu - lo),   hi' = mu + s*(hi - mu).
     s=1 is the current alpha=0.05 calibration; s<1 mimics a higher alpha
     (narrower base). The chosen s is later CONFIRMED by a real recalibration
     + re-dump, so this is only the search step, not the reported result.

  2. Combination rule with PartialID:
       union  : [min(lo), max(hi)]              (current frozen mode)
       lower  : [min(lo), npe_hi']              (extend lower bound only)
       gated  : union only on reps where PartialID's point is OUTSIDE NPE's
                (shrunk) interval; else keep NPE's shrunk interval.
       gatedL : gated + lower-only widening.

We report, per (rule, s): min coverage over all 55 cells, #cells < 0.90, worst
type-I (reject0 at mu=0), and mean interval width. The objective is the minimum
mean-width config that keeps min-coverage >= 0.90 AND worst type-I <= 0.07.
"""
import argparse
import json
import os

import numpy as np

from ensemble_offline import load_perrep, aggregate

HERE = os.path.dirname(os.path.abspath(__file__))


def shrink_npe(a, s):
    """Return a copy of NPE per-rep dict with interval shrunk toward its point."""
    mu, lo, hi = a["mu"], a["lo"], a["hi"]
    lo2 = mu - s * (mu - lo)
    hi2 = mu + s * (hi - mu)
    return {"lo": lo2, "hi": hi2, "mu": mu.copy(),
            "tau2": a["tau2"].copy(), "ok": a["ok"].copy()}


def combine(a, b, rule):
    """a = (possibly shrunk) NPE, b = PartialID. Return per-rep ensemble dict."""
    npe_lo, npe_hi, mu = a["lo"], a["hi"], a["mu"]
    pid_lo, pid_hi, pid_pt = b["lo"], b["hi"], b["mu"]
    if rule in ("union", "lower"):
        lo = np.fmin(npe_lo, pid_lo)
        hi = npe_hi.copy() if rule == "lower" else np.fmax(npe_hi, pid_hi)
    else:  # gated / gatedL: widen only where PartialID disagrees with NPE
        disagree = (pid_pt < npe_lo) | (pid_pt > npe_hi)
        disagree &= np.isfinite(pid_pt) & np.isfinite(npe_lo) & np.isfinite(npe_hi)
        lo = npe_lo.copy()
        hi = npe_hi.copy()
        full_lo = np.fmin(npe_lo, pid_lo)
        full_hi = npe_hi if rule == "gatedL" else np.fmax(npe_hi, pid_hi)
        lo[disagree] = full_lo[disagree]
        hi[disagree] = np.asarray(full_hi)[disagree]
    # point: NPE, clamped into the interval
    out_mu = mu.copy()
    m = ~np.isfinite(out_mu)
    out_mu[m] = pid_pt[m]
    fin = np.isfinite(out_mu) & np.isfinite(lo) & np.isfinite(hi)
    out_mu[fin] = np.minimum(np.maximum(out_mu[fin], lo[fin]), hi[fin])
    tau2 = a["tau2"].copy()
    m = ~np.isfinite(tau2); tau2[m] = b["tau2"][m]
    ok = a["ok"] | b["ok"]
    return {"lo": lo, "hi": hi, "mu": out_mu, "tau2": tau2, "ok": ok}


def evaluate(npe, pid, rule, s, reps):
    mincov, n_below, worst_typeI, widths = 1.0, 0, 0.0, []
    mincell = worstcell = None
    below = []
    for cid in npe:
        a = shrink_npe(npe[cid], s)
        syn = combine(a, pid[cid], rule)
        tmu, tt2 = npe[cid]["true_mu"], npe[cid]["true_tau2"]
        agg = aggregate(syn, tmu, tt2, reps)
        cov = agg["coverage"]
        widths.append(agg["mean_width"])
        if cov < mincov:
            mincov, mincell = cov, cid
        if cov < 0.90:
            n_below += 1; below.append((cid, round(cov, 3)))
        if npe[cid]["cell"]["mu"] == 0.0 and agg["reject0"] > worst_typeI:
            worst_typeI, worstcell = agg["reject0"], cid
    return {"rule": rule, "s": s, "min_cov": mincov, "min_cell": mincell,
            "n_below90": n_below, "below": below, "worst_typeI": worst_typeI,
            "worst_typeI_cell": worstcell, "mean_width": float(np.mean(widths))}


def emit_variant(npe, pid, rule, s, reps, pvs_from, out):
    """Write a results_new-style file with Unified = (rule, scale) applied.

    PVS aggregates are copied from an existing results file (results_merged.json
    or results_new.json) so the merged leaderboard keeps all four new methods.
    NPE and PartialID aggregates are recomputed from the dumps (unshrunk).
    """
    pvs_map = {}
    if pvs_from and os.path.exists(pvs_from):
        prev = json.load(open(pvs_from))
        for r in prev["results"]:
            pvs_map[r["cell_id"]] = r.get("methods", {}).get("PVS")
    results = []
    for cid in npe:
        tmu, tt2 = npe[cid]["true_mu"], npe[cid]["true_tau2"]
        a = shrink_npe(npe[cid], s)
        uni = combine(a, pid[cid], rule)
        npe_raw = {k: npe[cid][k] for k in ("lo", "hi", "mu", "tau2", "ok")}
        pid_raw = {k: pid[cid][k] for k in ("lo", "hi", "mu", "tau2", "ok")}
        methods = {
            "NPE": aggregate(npe_raw, tmu, tt2, reps),
            "PartialID": aggregate(pid_raw, tmu, tt2, reps),
            "Unified": aggregate(uni, tmu, tt2, reps),
        }
        if pvs_map.get(cid):
            methods["PVS"] = pvs_map[cid]
        results.append({"cell": npe[cid]["cell"], "cell_id": cid, "reps": reps,
                        "n_degenerate": npe[cid]["n_degenerate"],
                        "mean_sel_frac": npe[cid]["mean_sel_frac"],
                        "methods": methods})
    payload = {"meta": {"reps": reps, "methods": ["NPE", "PVS", "PartialID", "Unified"],
                        "n_cells": len(results),
                        "unified_rule": rule, "unified_npe_scale": s},
               "results": results}
    with open(out, "w") as f:
        json.dump(payload, f, indent=1)
    print(f"[emit] Unified=({rule}, scale={s}) -> {out}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--npe", default=os.path.join(HERE, "perrep_npe.json"))
    ap.add_argument("--pid", default=os.path.join(HERE, "perrep_partialid.json"))
    ap.add_argument("--emit-rule", default=None,
                    help="if set, skip the sweep and emit this rule as Unified")
    ap.add_argument("--emit-scale", type=float, default=1.0)
    ap.add_argument("--pvs-from", default=os.path.join(HERE, "results_merged.json"))
    ap.add_argument("--out", default=os.path.join(HERE, "results_new.json"))
    args = ap.parse_args()
    npe, rn = load_perrep(args.npe, "NPE")
    pid, rp = load_perrep(args.pid, "PartialID")
    assert rn == rp, f"reps mismatch {rn} vs {rp}"
    reps = rn
    if args.emit_rule:
        emit_variant(npe, pid, args.emit_rule, args.emit_scale, reps,
                     args.pvs_from, args.out)
        return
    print(f"reps={reps} cells={len(npe)}\n")
    rules = ["union", "lower", "gated", "gatedL"]
    s_grid = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5]
    print(f"{'rule':8s} {'s':>4} {'minCov':>7} {'#<.90':>6} {'wTypeI':>7} "
          f"{'meanW':>7}  feasible(min>=.90 & typeI<=.07)")
    best = None
    for rule in rules:
        for s in s_grid:
            r = evaluate(npe, pid, rule, s, reps)
            feasible = r["min_cov"] >= 0.90 and r["worst_typeI"] <= 0.07
            flag = "OK" if feasible else ""
            print(f"{rule:8s} {s:>4.1f} {r['min_cov']:>7.3f} {r['n_below90']:>6d} "
                  f"{r['worst_typeI']:>7.3f} {r['mean_width']:>7.3f}  {flag}")
            if feasible and (best is None or r["mean_width"] < best["mean_width"]):
                best = r
    print()
    # reference: current frozen Union at s=1
    base = evaluate(npe, pid, "union", 1.0, reps)
    print(f"[reference] current Union (s=1): min_cov={base['min_cov']:.3f} "
          f"mean_width={base['mean_width']:.3f}")
    if best:
        red = 100 * (1 - best["mean_width"] / base["mean_width"])
        print(f"[best feasible] rule={best['rule']} s={best['s']} "
              f"min_cov={best['min_cov']:.3f} worst_typeI={best['worst_typeI']:.3f} "
              f"mean_width={best['mean_width']:.3f}  ({red:+.1f}% width vs Union)")
        print(f"               min-cov cell: {best['min_cell']}")
    else:
        print("[best feasible] none met the constraints")


if __name__ == "__main__":
    main()
