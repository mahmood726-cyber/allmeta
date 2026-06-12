"""
run_new.py — Score ONLY the unified-estimator methods (NPE, PVS, PartialID) on
the full confirmation grid, seed-identical to the already-measured incumbents,
then write per-cell results that can be merged into results_full.json.

Why a separate runner instead of re-running harness.py with all 13 methods:
  * The incumbents (DL..TrimFill) are already measured in results_full.json from
    an 8242s run. Re-running them risks divergence and costs hours.
  * The data (y, v) per replication depends ONLY on the per-cell seed
    (BASE_SEED, cell_id, k) and dgp.generate — NOT on which methods score it.
    So scoring only the new methods over the identical seed streams yields the
    SAME data the incumbents saw. Parity is *verifiable*: mean_sel_frac and
    n_degenerate must match results_full.json per cell exactly.

  * On Windows, mp child processes re-import modules fresh, so monkeypatching
    harness.METHOD_NAMES in the parent would NOT reach workers. This module
    hardcodes NEW_METHODS so every spawned worker is consistent.

Robustness: each completed cell is checkpointed to results_new.json immediately
(imap_unordered). The run cannot stall silently — progress is on disk per cell,
and it is resumable (already-done cells are skipped on restart).
"""

import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dgp
import methods as M
import harness as H  # reuse BASE_SEED, _stable_hash, _cell_id, build_grid

NEW_METHODS = ["NPE", "PVS", "PartialID"]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(HERE, "results_new.json")


def run_cell_new(cell, reps, grma_B=199, max_factor=400):
    """Mirror of harness.run_cell but scoring only NEW_METHODS.

    The per-rep RNG stream and dgp.generate call are byte-identical to
    harness.run_cell, so (y, v) matches the incumbent run exactly. The gseed
    draw is preserved to keep rng advancement identical to the incumbent loop
    (defensive; new methods do not consume rng).
    """
    mu_true = cell["mu"]
    tau2_true = cell["tau2"]
    k = cell["k"]
    scenario = cell["scenario"]
    cid = H._cell_id(cell)
    ss = np.random.SeedSequence([H.BASE_SEED, H._stable_hash(cid), k])

    est = {m: [] for m in NEW_METHODS}
    lo = {m: [] for m in NEW_METHODS}
    hi = {m: [] for m in NEW_METHODS}
    t2 = {m: [] for m in NEW_METHODS}
    okc = {m: 0 for m in NEW_METHODS}
    n_degenerate = 0
    sel_fracs = []
    child_seeds = ss.spawn(reps)

    for rep in range(reps):
        rng = np.random.default_rng(child_seeds[rep])
        y, v, info = dgp.generate(mu_true, tau2_true, k, scenario, rng,
                                  max_factor=max_factor)
        if info["degenerate"] or len(y) < 3:
            n_degenerate += 1
            continue
        sel_fracs.append(info["sel_frac"])
        _ = int(rng.integers(0, 2 ** 31 - 1))  # GRMA gseed draw (parity)
        for name in NEW_METHODS:
            try:
                r = M.ALL_METHODS[name](y, v)
            except Exception:
                r = {"mu": np.nan, "ci_lo": np.nan, "ci_hi": np.nan,
                     "tau2": np.nan, "ok": False}
            m_hat = r.get("mu", np.nan)
            est[name].append(m_hat)
            lo[name].append(r.get("ci_lo", np.nan))
            hi[name].append(r.get("ci_hi", np.nan))
            t2[name].append(r.get("tau2", np.nan))
            if r.get("ok", False) and np.isfinite(m_hat):
                okc[name] += 1

    out = {"cell": cell, "cell_id": cid, "reps": reps,
           "n_degenerate": n_degenerate,
           "mean_sel_frac": float(np.mean(sel_fracs)) if sel_fracs else np.nan,
           "methods": {}}

    for name in NEW_METHODS:
        e = np.array(est[name], float)
        l = np.array(lo[name], float)
        h = np.array(hi[name], float)
        tt = np.array(t2[name], float)
        finite = np.isfinite(e)
        ef = e[finite]
        n_ok = int(finite.sum())
        if n_ok == 0:
            out["methods"][name] = {"n_ok": 0, "fail_rate": 1.0}
            continue
        bias = float(np.mean(ef) - mu_true)
        mse = float(np.mean((ef - mu_true) ** 2))
        ci_finite = np.isfinite(l) & np.isfinite(h)
        covers = ((l <= mu_true) & (h >= mu_true))[ci_finite]
        coverage = float(np.mean(covers)) if ci_finite.sum() else np.nan
        width = float(np.mean((h - l)[ci_finite])) if ci_finite.sum() else np.nan
        rej = ((l > 0) | (h < 0))[ci_finite]
        reject0 = float(np.mean(rej)) if ci_finite.sum() else np.nan
        t2_finite = tt[np.isfinite(tt)]
        tau2_bias = float(np.mean(t2_finite) - tau2_true) if t2_finite.size else np.nan
        out["methods"][name] = {
            "n_ok": n_ok,
            "fail_rate": float(1.0 - okc[name] / reps),
            "bias": bias,
            "mse": mse,
            "rmse": float(np.sqrt(mse)),
            "coverage": coverage,
            "mean_width": width,
            "reject0": reject0,
            "tau2_bias": tau2_bias,
        }
    return out


def _worker(task):
    cell, reps, grma_B, max_factor = task
    t0 = time.perf_counter()
    res = run_cell_new(cell, reps, grma_B=grma_B, max_factor=max_factor)
    res["seconds"] = round(time.perf_counter() - t0, 1)
    return res


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=1000)
    ap.add_argument("--procs", type=int, default=4)
    ap.add_argument("--max-factor", type=int, default=400)
    args = ap.parse_args()

    if M._UNIFIED_IMPORT_ERR is not None:
        print(f"[run_new] FATAL: unified methods failed to import: "
              f"{M._UNIFIED_IMPORT_ERR}", flush=True)
        sys.exit(1)

    cells = H.build_grid("full")
    # resume: load any already-completed cells
    done = {}
    if os.path.exists(OUT_PATH):
        try:
            prev = json.load(open(OUT_PATH))
            for r in prev.get("results", []):
                done[r["cell_id"]] = r
        except Exception:
            done = {}
    todo = [c for c in cells if H._cell_id(c) not in done]
    print(f"[run_new] methods={NEW_METHODS} cells={len(cells)} "
          f"todo={len(todo)} done={len(done)} reps={args.reps} "
          f"procs={args.procs}", flush=True)

    results = list(done.values())

    def _flush():
        payload = {"meta": {"base_seed": H.BASE_SEED, "reps": args.reps,
                            "methods": NEW_METHODS, "n_cells": len(cells)},
                   "results": results}
        tmp = OUT_PATH + ".tmp"
        with open(tmp, "w") as f:
            json.dump(payload, f, indent=1)
        os.replace(tmp, OUT_PATH)

    if not todo:
        print("[run_new] nothing to do; all cells present.", flush=True)
        _flush()
        return

    tasks = [(c, args.reps, 199, args.max_factor) for c in todo]
    t0 = time.perf_counter()
    n = len(tasks)
    if args.procs > 1:
        import multiprocessing as mp
        with mp.Pool(args.procs) as pool:
            for i, res in enumerate(pool.imap_unordered(_worker, tasks), 1):
                results.append(res)
                _flush()  # checkpoint every cell
                el = time.perf_counter() - t0
                eta = el / i * (n - i)
                print(f"  [{i}/{n}] {res['cell_id']} ({res['seconds']}s, "
                      f"degen={res['n_degenerate']}) elapsed={el:.0f}s "
                      f"eta={eta:.0f}s", flush=True)
    else:
        for i, task in enumerate(tasks, 1):
            res = _worker(task)
            results.append(res)
            _flush()
            print(f"  [{i}/{n}] {res['cell_id']} ({res['seconds']}s)", flush=True)
    print(f"[run_new] done in {time.perf_counter()-t0:.0f}s -> {OUT_PATH}",
          flush=True)


if __name__ == "__main__":
    main()
