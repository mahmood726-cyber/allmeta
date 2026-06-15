"""
harness_dta.py -- Known-truth DTA truth-recovery benchmark engine.

For each grid cell (k, se0/sp0, tau_se, tau_sp, rho, thresh, scenario) we run R
seeded replications. Each replication generates one known-truth DTA dataset
(dgp_dta.generate) and scores, for four estimators of the summary operating point:

  NaiveFE   -- independent fixed-effect pooling of logit Se / logit Sp, no tau^2,
               no Se-Sp correlation (the archaic-dta bug, reproduced)
  UnivDL    -- independent DerSimonian-Laird RE pooling (per-margin tau^2 only)
  Bivariate -- genuine bivariate random-effects MLE (Reitsma)
  BivarHK   -- bivariate + Hartung-Knapp honest-coverage widening (the lever)

Measured per estimator:
  * MARGINAL coverage of true Se and true Sp (the 1-D intervals a reviewer reads)
  * JOINT coverage of the true summary point (logitSe, logitFPR) by the 2-D region
  * interval WIDTHS
Plus, per cell: the recovered SROC AUC vs truth, the threshold-effect Spearman,
Deeks' small-study test rejection rate, and the bivariate convergence rate.

Per-cell results are checkpointed to <out>.partial.jsonl as they finish so a long
run is pollable (tail the file) and resumable, never idle-waited. Seeding mirrors
the pairwise / NMA bench: each replication draws from
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
import dgp_dta as D
import methods_dta as M

BASE_SEED = 20260615


def _stable_hash(s):
    return int.from_bytes(hashlib.sha256(s.encode()).digest()[:4], "big")


def _cell_id(c):
    return (f"k{c['k']}_se{c['se0']}_sp{c['sp0']}_tSe{c['tau_se']}_tSp{c['tau_sp']}"
            f"_rho{c['rho']}_thr{c['thresh']}_{c['scenario']}")


def run_cell(cell, reps):
    k = cell["k"]
    se0, sp0 = cell["se0"], cell["sp0"]
    cid = _cell_id(cell)
    ss = np.random.SeedSequence([BASE_SEED, _stable_hash(cid)]).spawn(reps)

    methods = ("NaiveFE", "UnivDL", "Bivariate", "BivarHK")
    cov_se = {m: [] for m in methods}
    cov_sp = {m: [] for m in methods}
    cov_joint = {m: [] for m in methods}
    w_se = {m: [] for m in methods}
    w_sp = {m: [] for m in methods}
    auc_err = []
    spearman = []
    deeks_rej = []
    conv = []
    sel_fracs = []
    n_degen = 0

    for rep in range(reps):
        rng = np.random.default_rng(ss[rep])
        rows, tr = D.generate(k, se0, sp0, cell["tau_se"], cell["tau_sp"],
                              cell["rho"], cell["thresh"], cell["scenario"], rng)
        if tr["degenerate"]:
            n_degen += 1
        sel_fracs.append(tr["sel_frac"])
        mu_true = np.array([tr["mu"][0], tr["mu_logit_fpr"]])
        true_se, true_sp = tr["se0"], tr["sp0"]

        fe = M.pool_univariate_fe(rows)
        dl = M.pool_univariate_dl(rows)
        bv = M.fit_bivariate(rows)
        hk = M.bivariate_hk(bv)
        conv.append(bv["converged"])

        # NaiveFE / UnivDL marginal intervals (z critical)
        for name, fit in (("NaiveFE", fe), ("UnivDL", dl)):
            lo, hi = M.margin_ci(fit["mu"][0], fit["se"][0] ** 2)
            cov_se[name].append(lo <= true_se <= hi); w_se[name].append(hi - lo)
            flo, fhi = M.margin_ci(fit["mu"][1], fit["se"][1] ** 2)
            sp_lo, sp_hi = 1 - fhi, 1 - flo
            cov_sp[name].append(sp_lo <= true_sp <= sp_hi); w_sp[name].append(sp_hi - sp_lo)
            covMu = np.diag(fit["se"] ** 2)
            cov_joint[name].append(M.covers_point_joint(fit["mu"], covMu, mu_true))

        # Bivariate (z + chi2_2 region)
        lo, hi = M.margin_ci(bv["mu"][0], bv["covMu"][0, 0])
        cov_se["Bivariate"].append(lo <= true_se <= hi); w_se["Bivariate"].append(hi - lo)
        flo, fhi = M.margin_ci(bv["mu"][1], bv["covMu"][1, 1])
        cov_sp["Bivariate"].append((1 - fhi) <= true_sp <= (1 - flo))
        w_sp["Bivariate"].append((1 - flo) - (1 - fhi))
        cov_joint["Bivariate"].append(M.covers_point_joint(bv["mu"], bv["covMu"], mu_true))

        # BivarHK (t + Hotelling region)
        lo, hi = M.margin_ci(bv["mu"][0], hk["covMu"][0, 0], crit=hk["crit"])
        cov_se["BivarHK"].append(lo <= true_se <= hi); w_se["BivarHK"].append(hi - lo)
        flo, fhi = M.margin_ci(bv["mu"][1], hk["covMu"][1, 1], crit=hk["crit"])
        cov_sp["BivarHK"].append((1 - fhi) <= true_sp <= (1 - flo))
        w_sp["BivarHK"].append((1 - flo) - (1 - fhi))
        cov_joint["BivarHK"].append(
            M.covers_point_joint(bv["mu"], hk["covMu"], mu_true, r2=hk["r2_joint"]))

        # SROC AUC recovery (true AUC from the generating SROC)
        true_fit = {"sroc_slope": tr["sroc_slope"],
                    "sroc_intercept": tr["mu"][0] - tr["sroc_slope"] * tr["mu_logit_fpr"]}
        auc_err.append(abs(M.hsroc_auc(bv) - M.hsroc_auc(true_fit)))
        spearman.append(M.threshold_spearman(rows))
        dk = M.deeks_test(rows)
        if np.isfinite(dk["p"]):
            deeks_rej.append(dk["p"] < 0.10)

    def m(x):
        x = [float(v) for v in x if np.isfinite(v)]
        return float(np.mean(x)) if x else float("nan")

    out = {"cell": cell, "cell_id": cid, "reps": reps, "n_degenerate": n_degen,
           "mean_sel_frac": m(sel_fracs), "conv_frac": m(conv),
           "coverage_se": {mm: m(cov_se[mm]) for mm in methods},
           "coverage_sp": {mm: m(cov_sp[mm]) for mm in methods},
           "coverage_joint": {mm: m(cov_joint[mm]) for mm in methods},
           "width_se": {mm: m(w_se[mm]) for mm in methods},
           "width_sp": {mm: m(w_sp[mm]) for mm in methods},
           "auc_abs_err": m(auc_err), "mean_spearman": m(spearman),
           "deeks_reject": m(deeks_rej)}
    return out


def _worker(task):
    c, reps = task
    tt = time.perf_counter()
    r = run_cell(c, reps)
    r["seconds"] = round(time.perf_counter() - tt, 1)
    return r


def build_grid(profile="full"):
    cells = []

    def add(k, tau_se, tau_sp, rho, thresh, scenario, block, se0=0.85, sp0=0.80):
        cells.append({"k": k, "se0": se0, "sp0": sp0, "tau_se": tau_se,
                      "tau_sp": tau_sp, "rho": rho, "thresh": thresh,
                      "scenario": scenario, "block": block})

    if profile == "smoke":
        add(15, 0.0, 0.0, 0.0, 0.0, "none", "smoke")
        add(15, 0.5, 0.5, -0.4, 0.3, "none", "smoke")
        add(10, 0.5, 0.5, -0.4, 0.6, "step_strong", "smoke")
        return cells

    # BLOCK A: coverage as heterogeneity rises (the archaic-dta under-coverage curve)
    for k in (8, 20):
        for (ts, tp) in ((0.0, 0.0), (0.25, 0.25), (0.5, 0.5), (0.8, 0.8)):
            add(k, ts, tp, -0.3, 0.0, "none", "coverage")
    # BLOCK B: threshold variation (the Se-Sp negative correlation / SROC spread)
    for thresh in (0.0, 0.3, 0.6, 1.0):
        add(15, 0.3, 0.3, -0.3, thresh, "none", "threshold")
    # BLOCK C: few-studies regime (bivariate convergence / small-k behaviour)
    for k in (4, 5, 6, 10):
        add(k, 0.5, 0.5, -0.3, 0.4, "none", "fewstudies")
    # BLOCK D: publication / small-study selection
    for scen in ("none", "step_strong", "copas_strong"):
        add(15, 0.4, 0.4, -0.3, 0.3, scen, "selection")
    return cells


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="full", choices=["full", "smoke"])
    ap.add_argument("--reps", type=int, default=800)
    ap.add_argument("--procs", type=int, default=max(1, os.cpu_count() - 1))
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    cells = build_grid(args.profile)
    here = os.path.dirname(os.path.abspath(__file__))
    out_path = args.out or os.path.join(here, f"results_dta_{args.profile}.json")
    partial = out_path + ".partial.jsonl"

    tasks = [(c, args.reps) for c in cells]
    print(f"[dta-harness] profile={args.profile} cells={len(cells)} reps={args.reps} "
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
                cse = res["coverage_se"]
                print(f"  [{i}/{len(tasks)}] {res['cell_id']} ({res['seconds']}s) "
                      f"covSe FE={cse['NaiveFE']:.2f} DL={cse['UnivDL']:.2f} "
                      f"BV={cse['Bivariate']:.2f} HK={cse['BivarHK']:.2f}", flush=True)
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
                        "scenarios": D.SCENARIOS},
               "results": results}
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=1)
    print(f"[dta-harness] done in {elapsed:.0f}s -> {out_path}")


if __name__ == "__main__":
    main()
