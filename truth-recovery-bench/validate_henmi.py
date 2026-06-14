"""
validate_henmi.py — Truth-recovery head-to-head for the Henmi-Copas port (P1).

HenmiCopas is registered in methods.ALL_METHODS, but at ~220 ms/call it is too
slow to fold into the full-grid ensemble validation, so its head-to-head row is
measured here on a lean grid (primary μ=0.3 + type-I μ=0) against the directly
comparable bias-correction / pooling competitors (no RoBMA/Copas/GRMA/Vevea,
which the frontier survey already covers). Exact harness seeding, so the numbers
line up with the rest of the benchmark.

  python validate_henmi.py --reps 400
"""

import argparse
import json
import os
import time

import numpy as np

import dgp
import harness as H
import methods as M
import features as F
import train_sbi as T
import sbi as S

HERE = os.path.dirname(os.path.abspath(__file__))
_ART = {}
METHODS = ["DL", "REML", "PET-PEESE", "TrimFill", "HenmiCopas"]   # + NPE (gated)


def _load_art(path):
    if path not in _ART:
        import pickle
        with open(path, "rb") as f:
            _ART[path] = pickle.load(f)
    return _ART[path]


def npe_batch(art, X):
    q = art["q_grid"]; models = art["models"]; conf = art["conformal"]
    P = T.predict_grid(models, q, X)
    d = np.array([T.conformal_d(conf, X[i]) for i in range(X.shape[0])])
    lo = P[:, conf["lo_idx"]] - d; hi = P[:, conf["hi_idx"]] + d
    mu = np.clip(P[:, q.index(0.5)], lo, hi)
    return mu, lo, hi


def _metrics(mu, lo, hi, mu_true):
    mu = np.asarray(mu, float); lo = np.asarray(lo, float); hi = np.asarray(hi, float)
    fin = np.isfinite(mu); ef = mu[fin]
    if ef.size == 0:
        return {"n_ok": 0}
    cif = np.isfinite(lo) & np.isfinite(hi)
    cov = float(np.mean(((lo <= mu_true) & (hi >= mu_true))[cif])) if cif.sum() else np.nan
    wid = float(np.mean((hi - lo)[cif])) if cif.sum() else np.nan
    rej = float(np.mean(((lo > 0) | (hi < 0))[cif])) if cif.sum() else np.nan
    return {"bias": float(np.mean(ef) - mu_true), "coverage": cov,
            "width": wid, "reject0": rej, "n_ok": int(fin.sum())}


def score_cell(task):
    cell, reps, art_path = task
    mu_true, tau2_true, k, sc = cell["mu"], cell["tau2"], cell["k"], cell["scenario"]
    cid = H._cell_id(cell)
    child = np.random.SeedSequence([H.BASE_SEED, H._stable_hash(cid), k]).spawn(reps)
    art = _load_art(art_path)
    acc = {m: {"mu": [], "lo": [], "hi": []} for m in METHODS}
    Xs = []
    for rep in range(reps):
        rng = np.random.default_rng(child[rep])
        y, v, info = dgp.generate(mu_true, tau2_true, k, sc, rng)
        if info["degenerate"] or len(y) < 3:
            continue
        Xs.append(F.featurize(y, v))
        for m in METHODS:
            try:
                r = M.ALL_METHODS[m](y, v)
                acc[m]["mu"].append(r.get("mu", np.nan)); acc[m]["lo"].append(r.get("ci_lo", np.nan)); acc[m]["hi"].append(r.get("ci_hi", np.nan))
            except Exception:
                acc[m]["mu"].append(np.nan); acc[m]["lo"].append(np.nan); acc[m]["hi"].append(np.nan)
    n = len(Xs)
    out = {}
    if n == 0:
        return {"cell": cell, "cell_id": cid, "n_used": 0, "methods": {}}
    for m in METHODS:
        out[m] = _metrics(acc[m]["mu"], acc[m]["lo"], acc[m]["hi"], mu_true)
    X = np.vstack(Xs)
    nmu_raw, nlo, nhi = npe_batch(art, X)
    sev = np.array([T._sev_proxy(X[i]) for i in range(n)])
    g = np.array([S.severity_gate(s) for s in sev])
    dl_mu = np.array(acc["DL"]["mu"], float)
    nmu = np.clip(dl_mu + g * (nmu_raw - dl_mu), nlo, nhi)
    out["NPE"] = _metrics(nmu, nlo, nhi, mu_true)
    return {"cell": cell, "cell_id": cid, "n_used": n, "methods": out}


def _agg(results, pred, metric, reduce="mean", absval=False):
    o = {}
    names = next(r["methods"].keys() for r in results if r["methods"])
    for name in names:
        vals = [abs(r["methods"][name][metric]) if absval else r["methods"][name][metric]
                for r in results if pred(r["cell"]) and name in r["methods"]
                and r["methods"][name].get(metric) is not None
                and np.isfinite(r["methods"][name][metric])]
        o[name] = (np.mean(vals) if reduce == "mean" else np.min(vals) if reduce == "min"
                   else np.max(vals)) if vals else float("nan")
    return o


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=400)
    ap.add_argument("--art", default=os.path.join(HERE, "sbi_model.pkl"))
    ap.add_argument("--procs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--out", default=os.path.join(HERE, "validation_henmi.json"))
    args = ap.parse_args()

    cells = []
    for k in [5, 10, 15, 25, 50]:
        for sc in dgp.SCENARIOS:
            cells.append({"mu": 0.3, "tau2": 0.05, "k": k, "scenario": sc, "block": "primary"})
    for k in [10, 25]:
        for sc in dgp.SCENARIOS:
            cells.append({"mu": 0.0, "tau2": 0.05, "k": k, "scenario": sc, "block": "typeI"})
    tasks = [(c, args.reps, args.art) for c in cells]
    print(f"[validate-henmi] cells={len(cells)} reps={args.reps} procs={args.procs}", flush=True)
    t0 = time.perf_counter()
    results = []
    if args.procs > 1:
        import multiprocessing as mp
        with mp.Pool(args.procs) as pool:
            for i, res in enumerate(pool.imap_unordered(score_cell, tasks), 1):
                results.append(res)
                if i % 8 == 0 or i == len(tasks):
                    print(f"  [{i}/{len(tasks)}] ({time.perf_counter()-t0:.0f}s)", flush=True)
    else:
        for task in tasks:
            results.append(score_cell(task))

    is_none = lambda c: c["block"] == "primary" and c["scenario"] == "none"
    is_sel = lambda c: c["block"] == "primary" and c["scenario"] != "none"
    is_prim = lambda c: c["block"] == "primary"
    is_tI = lambda c: c["block"] == "typeI"
    summary = {
        "clean_none": {"abs_bias": _agg(results, is_none, "bias", "mean", True),
                       "coverage": _agg(results, is_none, "coverage"),
                       "width": _agg(results, is_none, "width")},
        "under_sel": {"abs_bias": _agg(results, is_sel, "bias", "mean", True),
                      "mean_cov": _agg(results, is_sel, "coverage"),
                      "min_cov": _agg(results, is_sel, "coverage", "min")},
        "primary": {"abs_bias": _agg(results, is_prim, "bias", "mean", True),
                    "mean_cov": _agg(results, is_prim, "coverage"),
                    "width": _agg(results, is_prim, "width")},
        "typeI": {"mean_reject0": _agg(results, is_tI, "reject0"),
                  "max_reject0": _agg(results, is_tI, "reject0", "max")},
    }
    with open(args.out, "w") as f:
        json.dump({"meta": {"reps": args.reps, "n_cells": len(cells)},
                   "summary": summary, "per_cell": results}, f, indent=1)

    order = METHODS + ["NPE"]
    def row(lbl, d):
        return "  " + f"{lbl:9s}" + " ".join(f"{m[:9]:>10s}={d.get(m, float('nan')):.3f}" for m in order)
    print(f"\n===== HENMI-COPAS HEAD-TO-HEAD (reps={args.reps}, {time.perf_counter()-t0:.0f}s) =====")
    print("[CLEAN none]"); print(row("|bias|", summary["clean_none"]["abs_bias"])); print(row("cov", summary["clean_none"]["coverage"]))
    print("[UNDER SELECTION]"); print(row("|bias|", summary["under_sel"]["abs_bias"])); print(row("meanCov", summary["under_sel"]["mean_cov"])); print(row("minCov", summary["under_sel"]["min_cov"]))
    print("[PRIMARY]"); print(row("|bias|", summary["primary"]["abs_bias"])); print(row("meanCov", summary["primary"]["mean_cov"])); print(row("width", summary["primary"]["width"]))
    print("[TYPE-I @ mu=0]"); print(row("tI_mean", summary["typeI"]["mean_reject0"])); print(row("tI_max", summary["typeI"]["max_reject0"]))
    print(f"\n[validate-henmi] -> {args.out}")


if __name__ == "__main__":
    main()
