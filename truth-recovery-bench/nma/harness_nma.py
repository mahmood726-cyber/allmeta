"""
harness_nma.py -- Known-truth NMA truth-recovery benchmark engine.

For each grid cell (geometry, T, studies_per_edge, tau2, incons, scenario,
spread) we run R seeded replications. Each replication generates one known-truth
network (dgp_nma.generate) and scores:

  COVERAGE of every true relative effect d_ab, for three frequentist intervals
    NaiveFE  -- fixed-effect CI (tau2 ignored): the LivingNMA/enma-snma bug
    RE       -- proper random-effects network CI
    NetHK    -- Hartung-Knapp-style honest-coverage CI (the truth-recovery lever)
  and (on a flagged subgrid) the Bayesian CrI.

  INCONSISTENCY test type-I / power, honest (tau2-aware) vs naive (tau2-ignoring).

  RANKING over-confidence: claimed P(best treatment) under each covariance
    source (FE sharp / RE / Calibrated), the actual rate the claimed-best IS the
    true best, the over-confidence gap, and the spurious-confident-best rate.
    Plus the Bayesian posterior P(best) on the flagged subgrid.

Per-cell results are checkpointed to <out>.partial.jsonl as they finish so a long
run is pollable (tail the file) and resumable, never idle-waited.

Seeding mirrors the pairwise bench: each replication draws from
np.random.default_rng(SeedSequence([BASE_SEED, hash(cell_id), rep])).
"""
import argparse
import hashlib
import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dgp_nma as D
import methods_nma as M
import bayes_nma as B

BASE_SEED = 20260615
Z975 = M.Z975

SPREAD = {"sep": 0.6, "tight": 0.18}     # 'tight' -> closely-spaced top treatments


def _stable_hash(s):
    return int.from_bytes(hashlib.sha256(s.encode()).digest()[:4], "big")


def _cell_id(c):
    return (f"{c['geometry']}_T{c['T']}_spe{c['spe']}_t2{c['tau2']}"
            f"_inc{c['incons']}_{c['scenario']}_{c['spread']}")


def _all_contrasts(T):
    return [(a, b) for a in range(T) for b in range(a + 1, T)]


def run_cell(cell, reps, bayes_reps=0, n_draw=1500):
    geom, T, spe = cell["geometry"], cell["T"], cell["spe"]
    tau2, incons, scen, spread = cell["tau2"], cell["incons"], cell["scenario"], cell["spread"]
    d_spread = SPREAD[spread]
    cid = _cell_id(cell)
    ss = np.random.SeedSequence([BASE_SEED, _stable_hash(cid)])
    child = ss.spawn(reps)
    contrasts = _all_contrasts(T)

    # coverage / width accumulators (over reps x contrasts)
    acc = {k: [] for k in ("cov_FE", "cov_RE", "cov_HK", "w_FE", "w_RE", "w_HK",
                            "absbias_RE")}
    # inconsistency
    inc_rej = {"honest": [], "naive": []}
    inc_testable = 0
    # ranking (per rep): claimed p_best and hit for FE/RE/Cal
    rank = {src: {"pbest": [], "hit": [], "spurious": []} for src in ("FE", "RE", "Cal")}
    # bayesian
    bay = {"cov": [], "pbest": [], "hit": []}
    n_degen = 0
    sel_fracs = []

    for rep in range(reps):
        rng = np.random.default_rng(child[rep])
        studies, tr = D.generate(geom, T, spe, tau2, incons, scen, rng,
                                  d_spread=d_spread)
        if tr["degenerate"]:
            n_degen += 1
        sel_fracs.append(tr["sel_frac"])
        true_best = tr["best"]

        fFE = M.fit_consistency(studies, T, re=False)
        fRE = M.fit_consistency(studies, T, re=True)
        hk = M.network_hk(fRE)

        for (a, b) in contrasts:
            true = tr["D"][a, b]
            e, lo, hi, se = M.contrast_ci(fFE, a, b)
            acc["cov_FE"].append(lo <= true <= hi); acc["w_FE"].append(hi - lo)
            e, lo, hi, se = M.contrast_ci(fRE, a, b)
            acc["cov_RE"].append(lo <= true <= hi); acc["w_RE"].append(hi - lo)
            acc["absbias_RE"].append(abs(e - true))
            e2, lo, hi, se = M.contrast_ci(fRE, a, b, Cov=hk["Cov"], crit=hk["crit"])
            acc["cov_HK"].append(lo <= true <= hi); acc["w_HK"].append(hi - lo)

        # inconsistency test
        th = M.inconsistency_test(studies, T, honest=True)
        tn = M.inconsistency_test(studies, T, honest=False)
        if th["testable"]:
            inc_testable += 1
            inc_rej["honest"].append(th["p_value"] < 0.05)
            inc_rej["naive"].append(tn["p_value"] < 0.05)
            incons_infl = max(1.0, th["Q"] / th["df"]) if th["df"] > 0 else 1.0
        else:
            incons_infl = 1.0

        # ranking under three covariance sources
        t_infl = (hk["crit"] / Z975) ** 2
        cal_cov = hk["Cov"] * t_infl * incons_infl
        for src, cov in (("FE", fFE["Cov"]), ("RE", fRE["Cov"]), ("Cal", cal_cov)):
            r = M.ranking(fRE["dhat"] if src != "FE" else fFE["dhat"], cov, T, rng,
                          n_draw=n_draw)
            hit = (r["best"] == true_best)
            rank[src]["pbest"].append(r["p_best_of_best"])
            rank[src]["hit"].append(hit)
            rank[src]["spurious"].append((r["p_best_of_best"] >= 0.9) and (not hit))

        if bayes_reps and rep < bayes_reps:
            res = B.gibbs_nma(studies, T, np.random.default_rng(child[rep].spawn(1)[0]))
            for (a, b) in contrasts:
                e, lo, hi = B.contrast_cri(res, a, b)
                bay["cov"].append(lo <= tr["D"][a, b] <= hi)
            bay["pbest"].append(res["p_best_of_best"])
            bay["hit"].append(res["best"] == true_best)

    def m(x):
        x = [float(v) for v in x if np.isfinite(v)]
        return float(np.mean(x)) if x else float("nan")

    out = {"cell": cell, "cell_id": cid, "reps": reps, "n_degenerate": n_degen,
           "mean_sel_frac": m(sel_fracs),
           "coverage": {"NaiveFE": m(acc["cov_FE"]), "RE": m(acc["cov_RE"]),
                        "NetHK": m(acc["cov_HK"])},
           "width": {"NaiveFE": m(acc["w_FE"]), "RE": m(acc["w_RE"]),
                     "NetHK": m(acc["w_HK"])},
           "absbias_RE": m(acc["absbias_RE"]),
           "incons": {"testable_frac": inc_testable / reps,
                      "honest_reject": m(inc_rej["honest"]),
                      "naive_reject": m(inc_rej["naive"])},
           "ranking": {}}
    for src in ("FE", "RE", "Cal"):
        pb, hit = m(rank[src]["pbest"]), m(rank[src]["hit"])
        out["ranking"][src] = {"mean_pbest": pb, "hit_rate": hit,
                               "overconfidence": pb - hit,
                               "spurious_confident": m(rank[src]["spurious"])}
    if bayes_reps:
        out["bayes"] = {"reps": min(bayes_reps, reps),
                        "cri_coverage": m(bay["cov"]),
                        "mean_pbest": m(bay["pbest"]), "hit_rate": m(bay["hit"]),
                        "overconfidence": m(bay["pbest"]) - m(bay["hit"])}
    return out


def _worker(task):
    c, reps, br, nd = task
    tt = time.perf_counter()
    r = run_cell(c, reps, bayes_reps=br, n_draw=nd)
    r["seconds"] = round(time.perf_counter() - tt, 1)
    return r


def build_grid(profile="full"):
    cells = []

    def add(geometry, T, spe, tau2, incons, scenario, spread, block):
        cells.append({"geometry": geometry, "T": T, "spe": spe, "tau2": tau2,
                      "incons": incons, "scenario": scenario, "spread": spread,
                      "block": block})

    geoms = [("loop", 3), ("ladder", 4), ("dense", 4)]
    if profile == "smoke":
        add("loop", 3, 4, 0.0, 0.0, "none", "sep", "smoke")
        add("dense", 4, 3, 0.15, 0.0, "none", "tight", "smoke")
        add("loop", 3, 4, 0.05, 0.4, "none", "sep", "smoke")
        return cells

    # BLOCK A: coverage + ranking. incons=0, scenario=none.
    for (g, T) in geoms:
        for spe in (2, 5):
            for tau2 in (0.0, 0.05, 0.15):
                for spread in ("sep", "tight"):
                    add(g, T, spe, tau2, 0.0, "none", spread, "coverage")
    # BLOCK B: inconsistency type-I (incons=0) + power (incons>0)
    for (g, T) in geoms:
        for tau2 in (0.05, 0.15):
            for incons in (0.0, 0.2, 0.5):
                add(g, T, 5, tau2, incons, "none", "sep", "inconsistency")
    # BLOCK C: small-study / selection effect on the network
    for scen in ("none", "step_strong", "copas_strong"):
        add("dense", 4, 5, 0.05, 0.0, scen, "sep", "selection")
    return cells


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="full", choices=["full", "smoke"])
    ap.add_argument("--reps", type=int, default=500)
    ap.add_argument("--bayes-reps", type=int, default=0,
                    help="run Bayesian Gibbs on this many reps per cell (0=skip)")
    ap.add_argument("--bayes-blocks", default="coverage",
                    help="comma list of blocks to also run Bayesian on")
    ap.add_argument("--n-draw", type=int, default=1500)
    ap.add_argument("--procs", type=int, default=max(1, os.cpu_count() - 1))
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    cells = build_grid(args.profile)
    here = os.path.dirname(os.path.abspath(__file__))
    out_path = args.out or os.path.join(here, f"results_nma_{args.profile}.json")
    partial = out_path + ".partial.jsonl"
    bayes_blocks = set(args.bayes_blocks.split(",")) if args.bayes_reps else set()

    tasks = []
    for c in cells:
        br = args.bayes_reps if c["block"] in bayes_blocks else 0
        tasks.append((c, args.reps, br, args.n_draw))

    print(f"[nma-harness] profile={args.profile} cells={len(cells)} reps={args.reps} "
          f"bayes_reps={args.bayes_reps} procs={args.procs}", flush=True)
    # fresh partial log
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
                cv = res["coverage"]
                print(f"  [{i}/{len(tasks)}] {res['cell_id']} ({res['seconds']}s) "
                      f"covFE={cv['NaiveFE']:.2f} RE={cv['RE']:.2f} HK={cv['NetHK']:.2f}",
                      flush=True)
    else:
        for i, task in enumerate(tasks, 1):
            res = _worker(task)
            results.append(res)
            with open(partial, "a") as f:
                f.write(json.dumps(res) + "\n")
            print(f"  [{i}/{len(tasks)}] {res['cell_id']} ({res['seconds']}s)", flush=True)

    elapsed = time.perf_counter() - t0
    payload = {"meta": {"base_seed": BASE_SEED, "profile": args.profile,
                        "reps": args.reps, "bayes_reps": args.bayes_reps,
                        "n_cells": len(cells), "elapsed_sec": round(elapsed, 1),
                        "spread_map": SPREAD, "geometries": D.GEOMETRIES,
                        "scenarios": D.SCENARIOS},
               "results": results}
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=1)
    print(f"[nma-harness] done in {elapsed:.0f}s -> {out_path}")


if __name__ == "__main__":
    main()
