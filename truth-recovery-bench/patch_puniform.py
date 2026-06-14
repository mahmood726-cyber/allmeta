"""
patch_puniform.py — recompute ONLY the p-uniform* column of results_compare.json
on the IDENTICAL harness seeds, after the bounded-ML fix to methods.p_uniform_star.

The harness scores all methods together per rep on a shared per-cell RNG stream,
so regenerating the same (y, v) per rep and running only the fixed p_uniform_star
yields a column that is perfectly comparable to the other 16 methods already in
the file. The per-cell aggregation below mirrors harness.run_cell exactly.
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dgp
import methods as M
from harness import BASE_SEED, _stable_hash, _cell_id


def recompute_cell(cell, reps, max_factor=400):
    mu_true = cell["mu"]
    tau2_true = cell["tau2"]
    k = cell["k"]
    scenario = cell["scenario"]
    cid = _cell_id(cell)
    ss = np.random.SeedSequence([BASE_SEED, _stable_hash(cid), k])
    child_seeds = ss.spawn(reps)

    est, lo, hi, t2 = [], [], [], []
    okc = 0
    for rep in range(reps):
        rng = np.random.default_rng(child_seeds[rep])
        y, v, info = dgp.generate(mu_true, tau2_true, k, scenario, rng,
                                  max_factor=max_factor)
        if info["degenerate"] or len(y) < 3:
            continue
        # NB: harness draws gseed = rng.integers(...) here for GRMA. It does not
        # affect (y, v) of any rep (those come from child_seeds), nor the
        # deterministic p_uniform_star, so it is safely omitted.
        try:
            r = M.p_uniform_star(y, v)
        except Exception:
            r = {"mu": np.nan, "ci_lo": np.nan, "ci_hi": np.nan,
                 "tau2": np.nan, "ok": False}
        m_hat = r.get("mu", np.nan)
        est.append(m_hat)
        lo.append(r.get("ci_lo", np.nan))
        hi.append(r.get("ci_hi", np.nan))
        t2.append(r.get("tau2", np.nan))
        if r.get("ok", False) and np.isfinite(m_hat):
            okc += 1

    e = np.array(est, float); l = np.array(lo, float)
    h = np.array(hi, float); tt = np.array(t2, float)
    finite = np.isfinite(e)
    n_ok = int(finite.sum())
    if n_ok == 0:
        return {"n_ok": 0, "fail_rate": 1.0}
    ef = e[finite]
    bias = float(np.mean(ef) - mu_true)
    mse = float(np.mean((ef - mu_true) ** 2))
    ci_finite = np.isfinite(l) & np.isfinite(h)
    covers = ((l <= mu_true) & (h >= mu_true))[ci_finite]
    coverage = float(np.mean(covers)) if ci_finite.sum() else float("nan")
    width = float(np.mean((h - l)[ci_finite])) if ci_finite.sum() else float("nan")
    rej = ((l > 0) | (h < 0))[ci_finite]
    reject0 = float(np.mean(rej)) if ci_finite.sum() else float("nan")
    t2f = tt[np.isfinite(tt)]
    tau2_bias = float(np.mean(t2f) - tau2_true) if t2f.size else float("nan")
    return {"n_ok": n_ok, "fail_rate": float(1.0 - okc / reps),
            "bias": bias, "mse": mse, "rmse": float(np.sqrt(mse)),
            "coverage": coverage, "mean_width": width,
            "reject0": reject0, "tau2_bias": tau2_bias}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", default=os.path.join(HERE, "results_compare.json"))
    ap.add_argument("--max-factor", type=int, default=400)
    args = ap.parse_args()
    with open(args.results) as f:
        data = json.load(f)
    reps = data["meta"]["reps"]
    n = 0
    for c in data["results"]:
        new = recompute_cell(c["cell"], reps, max_factor=args.max_factor)
        c["methods"]["p-uniform*"] = new
        n += 1
        print(f"  [{n}/{len(data['results'])}] {c['cell_id']} "
              f"bias={new.get('bias', float('nan')):+.3f} "
              f"cov={new.get('coverage', float('nan')):.3f}", flush=True)
    with open(args.results, "w") as f:
        json.dump(data, f, indent=1)
    print(f"[patched p-uniform* in {n} cells -> {args.results}]")


if __name__ == "__main__":
    main()
