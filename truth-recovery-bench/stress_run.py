"""
stress_run.py — Focused goal-3 stress runner.

Scores a REPRESENTATIVE method subset (not all 14) on the harder-scenario grid
(harness `stress` profile), in the same per-cell/per-method format the report
tooling expects. The full 14-method harness is dominated by GRMA's per-rep
bootstrap and RoBMA, which are not needed to answer goal 3's question — does the
unified estimator's coverage hold on out-of-distribution mechanisms, and how do
the key competitors fare? We keep the naive-RE baseline (REML, HKSJ), the two
strongest selection-aware competitors (VeveaHedges, PET-PEESE), and the unified
trio (NPE, PartialID, Unified=frozen gated×1.15).

Seed-identical to harness.run_cell (same SeedSequence, dgp.generate, GRMA gseed
draw for rng parity), so the data each method sees is byte-identical to a full
harness run on the same cells.

Usage: python stress_run.py --reps 500 --procs 4
"""
import argparse
import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dgp
import methods as M
import harness as H

FOCUS = ["DL", "REML", "HKSJ", "VeveaHedges", "PET-PEESE", "NPE", "PartialID",
         "Unified"]
HERE = os.path.dirname(os.path.abspath(__file__))


def run_cell(cell, reps, max_factor=400):
    mu_true, tau2_true = cell["mu"], cell["tau2"]
    k, scenario = cell["k"], cell["scenario"]
    cid = H._cell_id(cell)
    ss = np.random.SeedSequence([H.BASE_SEED, H._stable_hash(cid), k])
    est = {m: [] for m in FOCUS}; lo = {m: [] for m in FOCUS}
    hi = {m: [] for m in FOCUS}; t2 = {m: [] for m in FOCUS}
    okc = {m: 0 for m in FOCUS}
    n_degenerate = 0; sel_fracs = []
    child_seeds = ss.spawn(reps)
    for rep in range(reps):
        rng = np.random.default_rng(child_seeds[rep])
        y, v, info = dgp.generate(mu_true, tau2_true, k, scenario, rng,
                                  max_factor=max_factor)
        if info["degenerate"] or len(y) < 3:
            n_degenerate += 1
            continue
        sel_fracs.append(info["sel_frac"])
        _ = int(rng.integers(0, 2 ** 31 - 1))     # GRMA gseed draw (rng parity)
        for name in FOCUS:
            try:
                r = M.ALL_METHODS[name](y, v)
            except Exception:
                r = {"mu": np.nan, "ci_lo": np.nan, "ci_hi": np.nan,
                     "tau2": np.nan, "ok": False}
            est[name].append(r.get("mu", np.nan))
            lo[name].append(r.get("ci_lo", np.nan))
            hi[name].append(r.get("ci_hi", np.nan))
            t2[name].append(r.get("tau2", np.nan))
            if r.get("ok", False) and np.isfinite(r.get("mu", np.nan)):
                okc[name] += 1
    out = {"cell": cell, "cell_id": cid, "reps": reps,
           "n_degenerate": n_degenerate,
           "mean_sel_frac": float(np.mean(sel_fracs)) if sel_fracs else np.nan,
           "methods": {}}
    for name in FOCUS:
        e = np.array(est[name], float); l = np.array(lo[name], float)
        h = np.array(hi[name], float); tt = np.array(t2[name], float)
        finite = np.isfinite(e); ef = e[finite]; n_ok = int(finite.sum())
        if n_ok == 0:
            out["methods"][name] = {"n_ok": 0, "fail_rate": 1.0}
            continue
        ci_finite = np.isfinite(l) & np.isfinite(h)
        covers = ((l <= mu_true) & (h >= mu_true))[ci_finite]
        rej = ((l > 0) | (h < 0))[ci_finite]
        t2f = tt[np.isfinite(tt)]
        out["methods"][name] = {
            "n_ok": n_ok, "fail_rate": float(1.0 - okc[name] / reps),
            "bias": float(np.mean(ef) - mu_true),
            "mse": float(np.mean((ef - mu_true) ** 2)),
            "rmse": float(np.sqrt(np.mean((ef - mu_true) ** 2))),
            "coverage": float(np.mean(covers)) if ci_finite.sum() else np.nan,
            "mean_width": float(np.mean((h - l)[ci_finite])) if ci_finite.sum() else np.nan,
            "reject0": float(np.mean(rej)) if ci_finite.sum() else np.nan,
            "tau2_bias": float(np.mean(t2f) - tau2_true) if t2f.size else np.nan,
        }
    return out


def _worker(task):
    cell, reps, mf = task
    t0 = time.perf_counter()
    res = run_cell(cell, reps, max_factor=mf)
    res["seconds"] = round(time.perf_counter() - t0, 1)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=500)
    ap.add_argument("--procs", type=int, default=4)
    ap.add_argument("--max-factor", type=int, default=400)
    ap.add_argument("--out", default=os.path.join(HERE, "results_stress.json"))
    args = ap.parse_args()
    if M._UNIFIED_IMPORT_ERR is not None:
        print(f"FATAL: unified import failed: {M._UNIFIED_IMPORT_ERR}")
        sys.exit(1)
    cells = H.build_grid("stress")
    tasks = [(c, args.reps, args.max_factor) for c in cells]
    print(f"[stress] methods={FOCUS} cells={len(cells)} reps={args.reps} "
          f"procs={args.procs}", flush=True)
    t0 = time.perf_counter(); results = []
    import multiprocessing as mp
    with mp.Pool(args.procs) as pool:
        for i, res in enumerate(pool.imap_unordered(_worker, tasks), 1):
            results.append(res)
            el = time.perf_counter() - t0
            print(f"  [{i}/{len(tasks)}] {res['cell_id']} ({res['seconds']}s, "
                  f"degen={res['n_degenerate']}) eta={el/i*(len(tasks)-i):.0f}s",
                  flush=True)
    payload = {"meta": {"base_seed": H.BASE_SEED, "reps": args.reps,
                        "methods": FOCUS, "n_cells": len(cells),
                        "profile": "stress",
                        "elapsed_sec": round(time.perf_counter() - t0, 1)},
               "results": results}
    with open(args.out, "w") as f:
        json.dump(payload, f, indent=1)
    print(f"[stress] done in {time.perf_counter()-t0:.0f}s -> {args.out}",
          flush=True)


if __name__ == "__main__":
    main()
