"""
dump_perrep.py — Dump PER-REPLICATION intervals for a chosen set of methods over
the full confirmation grid, seed-identical to the incumbent run (harness.py /
run_new.py). Unlike run_new.py (which stores only aggregates), this stores the
raw (lo, hi, mu, tau2, ok) for every kept replication so that ANY ensemble of
the dumped methods can be computed offline, exactly, with no re-run.

Why this exists
---------------
The unified ensemble (NPE union PartialID) is a deterministic function of the two
methods' per-rep intervals. PartialID is the expensive method (~1.2 h on 4 cores)
and is UNCHANGED by NPE retraining, so we dump it once here and reuse it forever.
NPE is fast and re-dumped after each retrain. Ensembles are then assembled
offline (ensemble_offline.py) in milliseconds.

Seed parity is byte-identical to harness.run_cell: same SeedSequence, same
dgp.generate call, same GRMA gseed draw, same degeneracy skip. The merge step
asserts mean_sel_frac and n_degenerate match the incumbent run, so a divergence
can never silently corrupt the leaderboard.

Usage
-----
  python dump_perrep.py --methods PartialID --reps 1000 --procs 4 --out perrep_partialid.json
  python dump_perrep.py --methods NPE       --reps 1000 --procs 4 --out perrep_npe.json
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

HERE = os.path.dirname(os.path.abspath(__file__))


def run_cell_dump(cell, methods, reps, max_factor=400):
    mu_true = cell["mu"]
    tau2_true = cell["tau2"]
    k = cell["k"]
    scenario = cell["scenario"]
    cid = H._cell_id(cell)
    ss = np.random.SeedSequence([H.BASE_SEED, H._stable_hash(cid), k])

    pr = {m: {"lo": [], "hi": [], "mu": [], "tau2": [], "ok": []} for m in methods}
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
        _ = int(rng.integers(0, 2 ** 31 - 1))  # GRMA gseed draw (seed parity)
        for name in methods:
            try:
                r = M.ALL_METHODS[name](y, v)
            except Exception:
                r = {"mu": np.nan, "ci_lo": np.nan, "ci_hi": np.nan,
                     "tau2": np.nan, "ok": False}
            pr[name]["lo"].append(_f(r.get("ci_lo", np.nan)))
            pr[name]["hi"].append(_f(r.get("ci_hi", np.nan)))
            pr[name]["mu"].append(_f(r.get("mu", np.nan)))
            pr[name]["tau2"].append(_f(r.get("tau2", np.nan)))
            pr[name]["ok"].append(bool(r.get("ok", False)
                                       and np.isfinite(r.get("mu", np.nan))))

    return {"cell": cell, "cell_id": cid, "reps": reps,
            "n_degenerate": n_degenerate,
            "mean_sel_frac": float(np.mean(sel_fracs)) if sel_fracs else None,
            "true_mu": mu_true, "true_tau2": tau2_true,
            "perrep": pr}


def _f(x):
    x = float(x)
    return x if np.isfinite(x) else None


def _worker(task):
    cell, methods, reps, max_factor = task
    t0 = time.perf_counter()
    res = run_cell_dump(cell, methods, reps, max_factor=max_factor)
    res["seconds"] = round(time.perf_counter() - t0, 1)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--methods", nargs="+", required=True)
    ap.add_argument("--reps", type=int, default=1000)
    ap.add_argument("--procs", type=int, default=4)
    ap.add_argument("--max-factor", type=int, default=400)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    out_path = args.out if os.path.isabs(args.out) else os.path.join(HERE, args.out)
    if M._UNIFIED_IMPORT_ERR is not None:
        print(f"[dump] FATAL: unified import: {M._UNIFIED_IMPORT_ERR}", flush=True)
        sys.exit(1)

    cells = H.build_grid("full")
    done = {}
    if os.path.exists(out_path):
        try:
            prev = json.load(open(out_path))
            if prev.get("meta", {}).get("methods") == list(args.methods) \
               and prev.get("meta", {}).get("reps") == args.reps:
                for r in prev.get("results", []):
                    done[r["cell_id"]] = r
        except Exception:
            done = {}
    todo = [c for c in cells if H._cell_id(c) not in done]
    print(f"[dump] methods={args.methods} cells={len(cells)} todo={len(todo)} "
          f"done={len(done)} reps={args.reps} procs={args.procs}", flush=True)

    results = list(done.values())

    def _flush():
        payload = {"meta": {"base_seed": H.BASE_SEED, "reps": args.reps,
                            "methods": list(args.methods), "n_cells": len(cells)},
                   "results": results}
        tmp = out_path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(payload, f)
        os.replace(tmp, out_path)

    if not todo:
        print("[dump] nothing to do.", flush=True)
        _flush()
        return

    tasks = [(c, list(args.methods), args.reps, args.max_factor) for c in todo]
    t0 = time.perf_counter()
    n = len(tasks)
    if args.procs > 1:
        import multiprocessing as mp
        with mp.Pool(args.procs) as pool:
            for i, res in enumerate(pool.imap_unordered(_worker, tasks), 1):
                results.append(res)
                _flush()
                el = time.perf_counter() - t0
                eta = el / i * (n - i)
                print(f"  [{i}/{n}] {res['cell_id']} ({res['seconds']}s, "
                      f"degen={res['n_degenerate']}) el={el:.0f}s eta={eta:.0f}s",
                      flush=True)
    else:
        for i, task in enumerate(tasks, 1):
            res = _worker(task)
            results.append(res)
            _flush()
            print(f"  [{i}/{n}] {res['cell_id']} ({res['seconds']}s)", flush=True)
    print(f"[dump] done in {time.perf_counter()-t0:.0f}s -> {out_path}", flush=True)


if __name__ == "__main__":
    main()
