"""
harness.py — Known-truth truth-recovery benchmark engine.

For each grid cell (mu, tau2, k, scenario) we run R seeded replications. Each
replication generates one published meta-analysis (dgp.generate) and scores
every method (methods.run_all) on recovery of the TRUE mu. Per-replication we
record (mu_hat, ci_lo, ci_hi, tau2_hat, ok). Aggregation computes:

  bias            mean(mu_hat) - true_mu
  mse             mean((mu_hat - true_mu)^2)            [MSE-to-true-mu]
  rmse            sqrt(mse)
  coverage        P(ci_lo <= true_mu <= ci_hi)          [target 0.95]
  mean_width      mean(ci_hi - ci_lo)
  tau2_bias       mean(tau2_hat) - true_tau2            [NaN-aware]
  reject0         P(0 outside CI)   -> type-I if mu=0, power if mu>0
  fail_rate       1 - mean(ok)
  n_ok            replications with a finite estimate

Fully seeded: each replication draws from np.random.default_rng(SeedSequence
spawned deterministically from (base_seed, cell_id, rep)). Re-running with the
same base_seed reproduces every number.
"""

import argparse
import hashlib
import json
import os
import sys
import time

import numpy as np


def _stable_hash(s):
    """Deterministic 32-bit hash (process-independent, unlike Python's hash())."""
    return int.from_bytes(hashlib.sha256(s.encode()).digest()[:4], "big")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dgp
import methods as M

BASE_SEED = 20260611
METHOD_NAMES = list(M.ALL_METHODS.keys())


def _cell_id(cell):
    return f"mu{cell['mu']}_t2{cell['tau2']}_k{cell['k']}_{cell['scenario']}"


def run_cell(cell, reps, grma_B=199, max_factor=400):
    """Run one grid cell. Returns dict: per-method aggregated metrics + meta."""
    mu_true = cell["mu"]
    tau2_true = cell["tau2"]
    k = cell["k"]
    scenario = cell["scenario"]
    cid = _cell_id(cell)
    # deterministic, independent RNG stream per (cell, rep)
    ss = np.random.SeedSequence([BASE_SEED, _stable_hash(cid), k])

    # accumulators
    est = {m: [] for m in METHOD_NAMES}
    lo = {m: [] for m in METHOD_NAMES}
    hi = {m: [] for m in METHOD_NAMES}
    t2 = {m: [] for m in METHOD_NAMES}
    okc = {m: 0 for m in METHOD_NAMES}
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
        # GRMA uses a derived integer seed for its internal bootstrap
        gseed = int(rng.integers(0, 2 ** 31 - 1))
        for name in METHOD_NAMES:
            try:
                if name == "GRMA":
                    r = M.grma(y, v, B=grma_B, seed=gseed)
                else:
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

    for name in METHOD_NAMES:
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
        # coverage of TRUE mu (only over replications with a finite interval)
        ci_finite = np.isfinite(l) & np.isfinite(h)
        covers = ((l <= mu_true) & (h >= mu_true))[ci_finite]
        coverage = float(np.mean(covers)) if ci_finite.sum() else np.nan
        width = float(np.mean((h - l)[ci_finite])) if ci_finite.sum() else np.nan
        # reject H0: 0 outside CI -> type-I (mu=0) / power (mu>0)
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
    res = run_cell(cell, reps, grma_B=grma_B, max_factor=max_factor)
    res["seconds"] = round(time.perf_counter() - t0, 1)
    return res


def build_grid(profile="full"):
    """Return the list of grid cells.

    profile='smoke' -> a tiny grid for end-to-end validation.
    """
    ks = [5, 10, 15, 25, 50]
    scen = dgp.SCENARIOS
    cells = []
    if profile == "smoke":
        for k in [10, 25]:
            for sc in ["none", "step_strong", "copas_strong"]:
                cells.append({"mu": 0.3, "tau2": 0.05, "k": k, "scenario": sc,
                              "block": "smoke"})
        return cells
    if profile == "stress":
        # Goal-3 harder scenarios: very strong / misspecified / heavy-tailed.
        # Primary effect at every k, plus a type-I (mu=0) probe at k=10,25.
        for k in ks:
            for sc in dgp.STRESS_SCENARIOS:
                cells.append({"mu": 0.3, "tau2": 0.05, "k": k, "scenario": sc,
                              "block": "stress"})
        for k in [10, 25]:
            for sc in dgp.STRESS_SCENARIOS:
                cells.append({"mu": 0.0, "tau2": 0.05, "k": k, "scenario": sc,
                              "block": "stress_typeI"})
        return cells
    # Primary leaderboard grid: moderate heterogeneity, positive effect
    for k in ks:
        for sc in scen:
            cells.append({"mu": 0.3, "tau2": 0.05, "k": k, "scenario": sc,
                          "block": "primary"})
    # Heterogeneity sweep at fixed k=15
    for t2 in [0.0, 0.02, 0.08, 0.20]:
        for sc in scen:
            cells.append({"mu": 0.3, "tau2": t2, "k": 15, "scenario": sc,
                          "block": "hetero"})
    # Type-I (mu=0) at two k
    for k in [10, 25]:
        for sc in scen:
            cells.append({"mu": 0.0, "tau2": 0.05, "k": k, "scenario": sc,
                          "block": "typeI"})
    return cells


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="full",
                    choices=["full", "smoke", "stress"])
    ap.add_argument("--reps", type=int, default=1000)
    ap.add_argument("--grma-B", type=int, default=199)
    ap.add_argument("--procs", type=int, default=max(1, os.cpu_count() - 1))
    ap.add_argument("--out", default=None)
    ap.add_argument("--max-factor", type=int, default=400)
    args = ap.parse_args()

    cells = build_grid(args.profile)
    out_path = args.out or os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        f"results_{args.profile}.json")
    tasks = [(c, args.reps, args.grma_B, args.max_factor) for c in cells]

    print(f"[harness] profile={args.profile} cells={len(cells)} reps={args.reps} "
          f"procs={args.procs} grma_B={args.grma_B}")
    t0 = time.perf_counter()
    results = []
    if args.procs > 1:
        import multiprocessing as mp
        with mp.Pool(args.procs) as pool:
            for i, res in enumerate(pool.imap_unordered(_worker, tasks), 1):
                results.append(res)
                print(f"  [{i}/{len(tasks)}] {res['cell_id']} "
                      f"({res['seconds']}s, degen={res['n_degenerate']})",
                      flush=True)
    else:
        for i, task in enumerate(tasks, 1):
            res = _worker(task)
            results.append(res)
            print(f"  [{i}/{len(tasks)}] {res['cell_id']} ({res['seconds']}s)",
                  flush=True)
    elapsed = time.perf_counter() - t0

    payload = {
        "meta": {
            "base_seed": BASE_SEED,
            "profile": args.profile,
            "reps": args.reps,
            "grma_B": args.grma_B,
            "methods": METHOD_NAMES,
            "scenarios": dgp.SCENARIOS,
            "n_cells": len(cells),
            "elapsed_sec": round(elapsed, 1),
            "step_cuts": dgp._STEP_CUTS.tolist(),
            "step_weights": {k: w.tolist() for k, w in dgp._STEP_WEIGHTS.items()},
            "copas_params": dgp._COPAS,
            "se_range": [0.10, 0.70],
        },
        "results": results,
    }
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=1)
    print(f"[harness] done in {elapsed:.0f}s -> {out_path}")


if __name__ == "__main__":
    main()
