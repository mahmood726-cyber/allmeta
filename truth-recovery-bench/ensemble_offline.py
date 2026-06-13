"""
ensemble_offline.py — Assemble and compare unified-ensemble variants OFFLINE
from dumped per-replication intervals (dump_perrep.py), with ZERO re-simulation.

Because every ensemble of {NPE, PartialID} is a deterministic function of the two
methods' per-rep intervals, we can design and measure any combination instantly
from the dumps. Aggregation replicates harness.run_cell EXACTLY (same bias / mse /
coverage / width / reject0 / tau2_bias / fail_rate definitions) so the numbers are
drop-in comparable with results_full.json.

Variants
--------
NPE         : NPE alone (cross-check vs results_new.json)
PartialID   : PartialID alone (cross-check)
Union       : point = NPE median; interval = NPE_CI  PartialID_CI (max-width
              union). Parameter-free partial-identification interval; coverage is
              >= max(NPE, PartialID) on every cell by construction.
LowerUnion  : point = NPE median; interval = [min(NPE_lo, PID_lo), NPE_hi]. Keeps
              NPE's (tight) upper bound — NPE's documented failure is UPWARD bias
              under step selection, so only the lower bound needs extending. This
              is the width-efficient sibling of Union.

Usage
-----
  python ensemble_offline.py --npe perrep_npe.json --pid perrep_partialid.json
  python ensemble_offline.py --npe perrep_npe.json --pid perrep_partialid.json \
        --emit Union --pvs-from results_new.json --out results_new.json
"""

import argparse
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def _arr(perrep_method, key):
    return np.array([np.nan if x is None else x for x in perrep_method[key]],
                    dtype=float)


def load_perrep(path, method):
    d = json.load(open(path))
    out = {}
    for r in d["results"]:
        pr = r["perrep"][method]
        out[r["cell_id"]] = {
            "lo": _arr(pr, "lo"), "hi": _arr(pr, "hi"),
            "mu": _arr(pr, "mu"), "tau2": _arr(pr, "tau2"),
            "ok": np.array(pr["ok"], dtype=bool),
            "cell": r["cell"], "n_degenerate": r["n_degenerate"],
            "mean_sel_frac": r["mean_sel_frac"], "true_mu": r["true_mu"],
            "true_tau2": r["true_tau2"],
        }
    return out, d["meta"].get("reps", 1000)


def _union(a, b, lower_only=False):
    """Combine two per-rep estimators into one (handles per-rep NaN gracefully)."""
    lo = np.fmin(a["lo"], b["lo"])                     # NaN-aware min
    if lower_only:
        hi = a["hi"].copy()                            # keep NPE upper bound
        # if NPE upper is NaN, fall back to PID upper
        m = ~np.isfinite(hi)
        hi[m] = b["hi"][m]
    else:
        hi = np.fmax(a["hi"], b["hi"])                 # NaN-aware max
    mu = a["mu"].copy()                                # NPE point preferred
    m = ~np.isfinite(mu)
    mu[m] = b["mu"][m]
    # clamp the point inside its own interval (monotone safety, as in sbi.py)
    fin = np.isfinite(mu) & np.isfinite(lo) & np.isfinite(hi)
    mu[fin] = np.minimum(np.maximum(mu[fin], lo[fin]), hi[fin])
    tau2 = a["tau2"].copy()
    m = ~np.isfinite(tau2)
    tau2[m] = b["tau2"][m]
    ok = a["ok"] | b["ok"]
    return {"lo": lo, "hi": hi, "mu": mu, "tau2": tau2, "ok": ok}


def aggregate(syn, true_mu, true_tau2, reps):
    """Replicate harness.run_cell aggregation exactly from per-rep arrays."""
    e, l, h, tt, ok = syn["mu"], syn["lo"], syn["hi"], syn["tau2"], syn["ok"]
    finite = np.isfinite(e)
    n_ok = int(finite.sum())
    if n_ok == 0:
        return {"n_ok": 0, "fail_rate": 1.0}
    ef = e[finite]
    bias = float(np.mean(ef) - true_mu)
    mse = float(np.mean((ef - true_mu) ** 2))
    ci_finite = np.isfinite(l) & np.isfinite(h)
    nci = int(ci_finite.sum())
    covers = ((l <= true_mu) & (h >= true_mu))[ci_finite]
    coverage = float(np.mean(covers)) if nci else float("nan")
    width = float(np.mean((h - l)[ci_finite])) if nci else float("nan")
    rej = ((l > 0) | (h < 0))[ci_finite]
    reject0 = float(np.mean(rej)) if nci else float("nan")
    t2f = tt[np.isfinite(tt)]
    tau2_bias = float(np.mean(t2f) - true_tau2) if t2f.size else float("nan")
    okc = int(ok.sum())
    return {"n_ok": n_ok, "fail_rate": float(1.0 - okc / reps),
            "bias": bias, "mse": mse, "rmse": float(np.sqrt(mse)),
            "coverage": coverage, "mean_width": width, "reject0": reject0,
            "tau2_bias": tau2_bias}


def _gated(a, b, lower_only=False):
    """Union only on replications where PartialID's point falls OUTSIDE NPE's CI.

    A parameter-free disagreement gate: when the conservative sibling agrees with
    NPE about location (its point sits inside NPE's interval), trust NPE's tight
    interval; only when they materially disagree (genuine selection ambiguity)
    widen to the partial-identification set. Recovers NPE's tightness in the easy
    cells while still fixing the step-selection cells where the two diverge.
    """
    full = _union(a, b, lower_only=lower_only)
    npe_lo, npe_hi = a["lo"], a["hi"]
    pid_pt = b["mu"]
    disagree = (pid_pt < npe_lo) | (pid_pt > npe_hi)
    disagree = disagree & np.isfinite(pid_pt) & np.isfinite(npe_lo) & np.isfinite(npe_hi)
    out = {}
    for key in ("lo", "hi", "mu", "tau2", "ok"):
        base = {"lo": a["lo"], "hi": a["hi"], "mu": a["mu"],
                "tau2": a["tau2"], "ok": a["ok"]}[key].copy()
        base[disagree] = full[key][disagree]
        out[key] = base
    return out


def build_variants(npe, pid):
    """Return {variant_name: {cell_id: synthetic per-rep dict}}."""
    cids = list(npe.keys())
    V = {"NPE": {}, "PartialID": {}, "Union": {}, "LowerUnion": {},
         "GatedUnion": {}, "GatedLower": {}}
    for cid in cids:
        a, b = npe[cid], pid[cid]
        assert len(a["mu"]) == len(b["mu"]), f"length mismatch at {cid}"
        V["NPE"][cid] = {k: a[k] for k in ("lo", "hi", "mu", "tau2", "ok")}
        V["PartialID"][cid] = {k: b[k] for k in ("lo", "hi", "mu", "tau2", "ok")}
        V["Union"][cid] = _union(a, b, lower_only=False)
        V["LowerUnion"][cid] = _union(a, b, lower_only=True)
        V["GatedUnion"][cid] = _gated(a, b, lower_only=False)
        V["GatedLower"][cid] = _gated(a, b, lower_only=True)
    return V


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--npe", required=True)
    ap.add_argument("--pid", required=True)
    ap.add_argument("--npe-method", default="NPE")
    ap.add_argument("--pid-method", default="PartialID")
    ap.add_argument("--emit", default=None,
                    help="variant name to write as a results_new-style file")
    ap.add_argument("--emit-as", default="NPE",
                    help="method name to store the emitted variant under")
    ap.add_argument("--pvs-from", default=None,
                    help="results_new.json to copy PVS + PartialID aggregates from")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    npe, reps_n = load_perrep(args.npe, args.npe_method)
    pid, reps_p = load_perrep(args.pid, args.pid_method)
    assert reps_n == reps_p, f"reps mismatch {reps_n} vs {reps_p}"
    reps = reps_n
    # parity: same cells, same n_degenerate, same sel_frac
    for cid in npe:
        assert cid in pid, f"{cid} missing from PID dump"
        assert npe[cid]["n_degenerate"] == pid[cid]["n_degenerate"], \
            f"degeneracy mismatch at {cid}"
        sf_a = npe[cid]["mean_sel_frac"] or 0.0
        sf_b = pid[cid]["mean_sel_frac"] or 0.0
        assert abs(sf_a - sf_b) < 1e-9, f"sel_frac mismatch at {cid}"

    V = build_variants(npe, pid)

    # ---- comparison summary ----
    print(f"reps={reps} cells={len(npe)}\n")
    names = ["NPE", "PartialID", "Union", "LowerUnion", "GatedUnion", "GatedLower"]
    summ = {n: {"min_cov": 1.0, "min_cov_cell": None,
                "n_below90": 0, "max_rej_typeI": 0.0, "max_rej_cell": None,
                "mean_width": [], "below90": []} for n in names}
    for cid in npe:
        cell = npe[cid]["cell"]
        tmu, tt2 = npe[cid]["true_mu"], npe[cid]["true_tau2"]
        for n in names:
            agg = aggregate(V[n][cid], tmu, tt2, reps)
            cov = agg["coverage"]
            summ[n]["mean_width"].append(agg["mean_width"])
            if cov < summ[n]["min_cov"]:
                summ[n]["min_cov"] = cov
                summ[n]["min_cov_cell"] = cid
            if cov < 0.90:
                summ[n]["n_below90"] += 1
                summ[n]["below90"].append((cid, round(cov, 3)))
            if cell["mu"] == 0.0:  # type-I block
                if agg["reject0"] > summ[n]["max_rej_typeI"]:
                    summ[n]["max_rej_typeI"] = agg["reject0"]
                    summ[n]["max_rej_cell"] = cid

    print(f"{'variant':12s} {'minCov':>7} {'#<0.90':>7} {'maxRejTypeI':>12} "
          f"{'meanWidth':>10}")
    for n in names:
        s = summ[n]
        print(f"{n:12s} {s['min_cov']:>7.3f} {s['n_below90']:>7d} "
              f"{s['max_rej_typeI']:>12.3f} {np.mean(s['mean_width']):>10.3f}")
    print()
    for n in names:
        s = summ[n]
        if s["below90"]:
            print(f"[{n}] cells < 0.90: {s['below90']}")
        else:
            print(f"[{n}] ALL 55 cells >= 0.90  (min {s['min_cov']:.3f} @ "
                  f"{s['min_cov_cell']})")
    print()
    for n in names:
        s = summ[n]
        print(f"[{n}] worst type-I reject0 = {s['max_rej_typeI']:.3f} @ "
              f"{s['max_rej_cell']}")

    # ---- emit a results_new-style file: NPE, PVS, PartialID, Unified ----
    if args.emit:
        assert args.emit in V, f"unknown variant {args.emit}"
        results = []
        pvs_map = {}
        if args.pvs_from:
            prev = json.load(open(args.pvs_from))
            pvs_map = {r["cell_id"]: r for r in prev["results"]}
        for cid in npe:
            tmu, tt2 = npe[cid]["true_mu"], npe[cid]["true_tau2"]
            cell = npe[cid]["cell"]
            methods = {
                "NPE": aggregate(V["NPE"][cid], tmu, tt2, reps),
                "PartialID": aggregate(V["PartialID"][cid], tmu, tt2, reps),
                args.emit_as: aggregate(V[args.emit][cid], tmu, tt2, reps),
            }
            if cid in pvs_map and "PVS" in pvs_map[cid]["methods"]:
                methods["PVS"] = pvs_map[cid]["methods"]["PVS"]
            results.append({
                "cell": cell, "cell_id": cid, "reps": reps,
                "n_degenerate": npe[cid]["n_degenerate"],
                "mean_sel_frac": npe[cid]["mean_sel_frac"],
                "methods": methods,
            })
        out = args.out or os.path.join(HERE, "results_new.json")
        order = ["NPE", "PVS", "PartialID", args.emit_as]
        payload = {"meta": {"reps": reps, "methods": order,
                            "n_cells": len(results),
                            "ensemble_variant": args.emit,
                            "emit_as": args.emit_as}, "results": results}
        with open(out, "w") as f:
            json.dump(payload, f, indent=1)
        print(f"\n[emit] wrote NPE,PVS,PartialID,{args.emit_as}(={args.emit}) -> {out}")


if __name__ == "__main__":
    main()
