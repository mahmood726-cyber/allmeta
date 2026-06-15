"""
harness_dose.py -- Known-truth dose-response truth-recovery benchmark engine.

For each grid cell (k, beta, gamma, curve, tau2, scenario) we run R seeded
replications. Each replication generates one known-truth dose-response dataset
(dgp_dose.generate) and scores:

  LINEAR-SLOPE coverage of the true beta, for four poolers of the stage-1 GLS
  slopes:
    NaiveFE   -- fixed-effect inverse-variance pool, tau2 ignored (the starkest
                 dose-response-pro failure: coverage -> ~0.07 under heterogeneity)
    DL        -- DerSimonian-Laird RE + z interval (better, but under-covers at
                 small k -- the tau2->0 / qnorm deficiency)
    REML_HK   -- REML tau2 + Knapp-Hartung t interval (the honest lever)
    OneStage  -- one-stage random-slope mixed model (REML)
  plus tau2 recovery (DL vs REML).

  CURVE coverage of the true g(d) at test doses, for a LINEAR fit (misspecified
  when the truth is quadratic) vs a QUADRATIC multivariate-RE fit -- the
  nonlinearity honest negative.

Per-cell results are checkpointed to <out>.partial.jsonl as they finish so a long
run is pollable (tail the file) and resumable, never idle-waited. Seeding mirrors
the pairwise / NMA / DTA benches: each replication draws from
np.random.default_rng(SeedSequence([BASE_SEED, hash(cell_id)]).spawn(rep)).
"""
import argparse
import hashlib
import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dgp_dose as D
import methods_dose as M

BASE_SEED = 20260615
TEST_DOSES = np.array([1.0, 3.0, 5.0])     # curve-coverage evaluation points


def _stable_hash(s):
    return int.from_bytes(hashlib.sha256(s.encode()).digest()[:4], "big")


def _cell_id(c):
    return (f"{c['curve']}_k{c['k']}_b{c['beta']}_g{c['gamma']}"
            f"_t2{c['tau2']}_{c['scenario']}")


def _true_curve(beta, gamma, curve, d):
    return beta * d if curve == "linear" else beta * d + gamma * d * d


def run_cell(cell, reps):
    k, beta, gamma = cell["k"], cell["beta"], cell["gamma"]
    curve, scen, tau2 = cell["curve"], cell["scenario"], cell["tau2"]
    cid = _cell_id(cell)
    ss = np.random.SeedSequence([BASE_SEED, _stable_hash(cid)]).spawn(reps)

    methods = ("NaiveFE", "DL", "REML_HK", "OneStage")
    cov_slope = {m: [] for m in methods}
    w_slope = {m: [] for m in methods}
    bias_slope = {m: [] for m in methods}
    t2 = {"DL": [], "REML": []}
    # curve coverage at TEST_DOSES: linear-fit vs quad-fit
    cov_curve = {"LinearFit": [], "QuadFit": []}
    sel_fracs = []
    n_degen = 0

    for rep in range(reps):
        rng = np.random.default_rng(ss[rep])
        studies, tr = D.generate(k, beta, gamma, tau2, curve, scen, rng)
        if tr["degenerate"]:
            n_degen += 1
        sel_fracs.append(tr["sel_frac"])

        betas, vars_ = [], []
        coefs, Covs = [], []
        for st in studies:
            b, v = M.stage1_linear(st)
            betas.append(b)
            vars_.append(v)
            c, Cc = M.stage1_quad(st)
            coefs.append(c)
            Covs.append(Cc)
        betas, vars_ = np.array(betas), np.array(vars_)

        fe = M.pool_fe(betas, vars_)
        dl = M.pool_dl(betas, vars_)
        re = M.pool_reml_hk(betas, vars_)
        os1 = M.one_stage_linear(studies)
        t2["DL"].append(dl["tau2"])
        t2["REML"].append(re["tau2"])

        for name, pool in (("NaiveFE", fe), ("DL", dl), ("REML_HK", re), ("OneStage", os1)):
            cov_slope[name].append(pool["lo"] <= beta <= pool["hi"])
            w_slope[name].append(pool["hi"] - pool["lo"])
            bias_slope[name].append(pool["mu"] - beta)

        # curve coverage: evaluate g(d) at TEST_DOSES.
        # LinearFit uses REML_HK slope; QuadFit uses the multivariate RE pool.
        mv = M.pool_mv_reml(coefs, Covs)
        for d in TEST_DOSES:
            true_g = _true_curve(beta, gamma, curve, d)
            _, lo, hi = M.curve_ci_linear(re, d)
            cov_curve["LinearFit"].append(lo <= true_g <= hi)
            _, lo, hi = M.curve_ci_quad(mv, d)
            cov_curve["QuadFit"].append(lo <= true_g <= hi)

    def m(x):
        x = [float(v) for v in x if np.isfinite(v)]
        return float(np.mean(x)) if x else float("nan")

    out = {"cell": cell, "cell_id": cid, "reps": reps, "n_degenerate": n_degen,
           "mean_sel_frac": m(sel_fracs),
           "coverage_slope": {mm: m(cov_slope[mm]) for mm in methods},
           "width_slope": {mm: m(w_slope[mm]) for mm in methods},
           "bias_slope": {mm: m(bias_slope[mm]) for mm in methods},
           "tau2_DL": m(t2["DL"]), "tau2_REML": m(t2["REML"]), "tau2_true": tau2,
           "coverage_curve": {"LinearFit": m(cov_curve["LinearFit"]),
                              "QuadFit": m(cov_curve["QuadFit"])}}
    return out


def _worker(task):
    c, reps = task
    tt = time.perf_counter()
    r = run_cell(c, reps)
    r["seconds"] = round(time.perf_counter() - tt, 1)
    return r


def build_grid(profile="full"):
    cells = []

    def add(k, beta, gamma, curve, tau2, scenario, block):
        cells.append({"k": k, "beta": beta, "gamma": gamma, "curve": curve,
                      "tau2": tau2, "scenario": scenario, "block": block})

    if profile == "smoke":
        add(10, 0.30, 0.0, "linear", 0.0, "none", "smoke")
        add(10, 0.30, 0.0, "linear", 0.15, "none", "smoke")
        add(12, 0.40, -0.05, "quadratic", 0.05, "none", "smoke")
        return cells

    # BLOCK A: linear slope coverage as heterogeneity rises (the FE collapse + DL gap)
    for k in (6, 10, 20):
        for tau2 in (0.0, 0.05, 0.15, 0.30):
            add(k, 0.30, 0.0, "linear", tau2, "none", "slope")
    # BLOCK B: nonlinearity -- quadratic truth, linear-fit bias vs quad-fit recovery
    for gamma in (-0.03, -0.06):
        for k in (10, 20):
            add(k, 0.45, gamma, "quadratic", 0.05, "none", "nonlinear")
    # BLOCK C: publication / small-study selection on the slope
    for scen in ("none", "step_strong", "copas_strong"):
        add(12, 0.30, 0.0, "linear", 0.10, scen, "selection")
    return cells


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="full", choices=["full", "smoke"])
    ap.add_argument("--reps", type=int, default=1000)
    ap.add_argument("--procs", type=int, default=max(1, os.cpu_count() - 1))
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    cells = build_grid(args.profile)
    here = os.path.dirname(os.path.abspath(__file__))
    out_path = args.out or os.path.join(here, f"results_dose_{args.profile}.json")
    partial = out_path + ".partial.jsonl"

    tasks = [(c, args.reps) for c in cells]
    print(f"[dose-harness] profile={args.profile} cells={len(cells)} reps={args.reps} "
          f"procs={args.procs}", flush=True)
    open(partial, "w").close()
    t0 = time.perf_counter()
    results = []

    if args.procs > 1:
        import multiprocessing as mp
        with mp.Pool(args.procs) as pool:
            for i, res in enumerate(pool.imap_unordered(_worker, tasks), 1):
                results.append(res)
                with open(partial, "a") as f:
                    f.write(json.dumps(res) + "\n")
                cs = res["coverage_slope"]
                print(f"  [{i}/{len(tasks)}] {res['cell_id']} ({res['seconds']}s) "
                      f"slope FE={cs['NaiveFE']:.2f} DL={cs['DL']:.2f} "
                      f"REML={cs['REML_HK']:.2f} 1stage={cs['OneStage']:.2f}", flush=True)
    else:
        for i, task in enumerate(tasks, 1):
            res = _worker(task)
            results.append(res)
            with open(partial, "a") as f:
                f.write(json.dumps(res) + "\n")
            print(f"  [{i}/{len(tasks)}] {res['cell_id']} ({res['seconds']}s)", flush=True)

    elapsed = time.perf_counter() - t0
    payload = {"meta": {"base_seed": BASE_SEED, "profile": args.profile,
                        "reps": args.reps, "n_cells": len(cells),
                        "elapsed_sec": round(elapsed, 1),
                        "test_doses": TEST_DOSES.tolist(),
                        "scenarios": D.SCENARIOS},
               "results": results}
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=1)
    print(f"[dose-harness] done in {elapsed:.0f}s -> {out_path}")


if __name__ == "__main__":
    main()
