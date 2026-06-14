"""
validate_ensemble.py — Honest head-to-head of the mechanism-aware ensemble (P0)
against every individual corrector, on the known-truth harness with EXACT
harness seeding (harness.BASE_SEED + per-cell SeedSequence).

Scored methods (all on identical seeds, primary + type-I + OOD-stress grid):
  DL, p-uniform*, WLS, WAAP, HenmiCopas, PartialID,
  NPE (gated, production), Unified (frozen gated x1.15),
  MechEnsemble (this P0)  -- evaluated at several OOD-trigger thresholds so the
  width/coverage trade is tuned transparently rather than hidden.

Per-rep we compute features + NPE(gated) + DL + p-uniform* + WLS + PartialID
ONCE; the ensemble at every OOD_K is then assembled from those cached pieces, so
the threshold sweep is free. The verdict explicitly checks whether MechEnsemble
Pareto-improves the (min-coverage, width) frontier vs NPE and Unified, and
prints where it does NOT. Truth-first.

  python validate_ensemble.py --reps 600
"""

import argparse
import json
import os
import time

import numpy as np

import dgp
import features as F
import harness as H
import methods as M
import train_sbi as T
import sbi as S
from robust_selection import partial_id as _partial_id

HERE = os.path.dirname(os.path.abspath(__file__))
_ART = {}
OOD_KS = [0.7, 0.9, 1.1, 1.25]
NPE_SCALE = 1.15


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
    lo = P[:, conf["lo_idx"]] - d
    hi = P[:, conf["hi_idx"]] + d
    mu = np.clip(P[:, q.index(0.5)], lo, hi)
    return mu, lo, hi


def _scale_iv_v(mu, lo, hi, s):
    return mu - s * (mu - lo), mu + s * (hi - mu)


def _metrics(mu, lo, hi, mu_true):
    mu = np.asarray(mu, float); lo = np.asarray(lo, float); hi = np.asarray(hi, float)
    fin = np.isfinite(mu); ef = mu[fin]
    if ef.size == 0:
        return {"n_ok": 0}
    cif = np.isfinite(lo) & np.isfinite(hi)
    cov = float(np.mean(((lo <= mu_true) & (hi >= mu_true))[cif])) if cif.sum() else np.nan
    wid = float(np.mean((hi - lo)[cif])) if cif.sum() else np.nan
    rej = float(np.mean(((lo > 0) | (hi < 0))[cif])) if cif.sum() else np.nan
    return {"bias": float(np.mean(ef) - mu_true),
            "rmse": float(np.sqrt(np.mean((ef - mu_true) ** 2))),
            "coverage": cov, "width": wid, "reject0": rej, "n_ok": int(fin.sum())}


def score_cell(task):
    cell, reps, art_path = task
    mu_true, tau2_true, k, sc = cell["mu"], cell["tau2"], cell["k"], cell["scenario"]
    cid = H._cell_id(cell)
    child = np.random.SeedSequence([H.BASE_SEED, H._stable_hash(cid), k]).spawn(reps)
    art = _load_art(art_path)

    # HenmiCopas is intentionally NOT scored per-rep here: at ~220 ms/call its
    # cost dominates the whole grid. It is validated separately against
    # metafor::hc() (tests/test_henmi_copas.py) and registered for the harness
    # head-to-head; its truth-recovery row is produced by validate_henmi.py.
    Xs = []
    simple = {m: {"mu": [], "lo": [], "hi": []} for m in
              ("DL", "p-uniform*", "WLS", "WAAP", "PartialID")}
    fns = {"DL": M.dersimonian_laird, "p-uniform*": M.p_uniform_star,
           "WLS": M.wls_sd, "WAAP": M.waap, "PartialID": _partial_id}
    for rep in range(reps):
        rng = np.random.default_rng(child[rep])
        y, v, info = dgp.generate(mu_true, tau2_true, k, sc, rng)
        if info["degenerate"] or len(y) < 3:
            continue
        Xs.append(F.featurize(y, v))
        for m, fn in fns.items():
            try:
                r = fn(y, v)
                simple[m]["mu"].append(r.get("mu", np.nan))
                simple[m]["lo"].append(r.get("ci_lo", np.nan))
                simple[m]["hi"].append(r.get("ci_hi", np.nan))
            except Exception:
                simple[m]["mu"].append(np.nan); simple[m]["lo"].append(np.nan); simple[m]["hi"].append(np.nan)
    n = len(Xs)
    if n == 0:
        return {"cell": cell, "cell_id": cid, "n_used": 0, "methods": {}}
    X = np.vstack(Xs)
    for m in simple:
        for kk in simple[m]:
            simple[m][kk] = np.array(simple[m][kk], float)
    sev = np.array([T._sev_proxy(X[i]) for i in range(n)])

    # gated NPE (production point) + conformal interval
    nmu_raw, nlo, nhi = npe_batch(art, X)
    g = np.array([S.severity_gate(s) for s in sev])
    dl_mu = simple["DL"]["mu"]
    nmu = np.clip(dl_mu + g * (nmu_raw - dl_mu), nlo, nhi)

    out = {}
    for m in ("DL", "p-uniform*", "WLS", "WAAP", "PartialID"):
        out[m] = _metrics(simple[m]["mu"], simple[m]["lo"], simple[m]["hi"], mu_true)
    out["NPE"] = _metrics(nmu, nlo, nhi, mu_true)

    # scaled NPE interval (matches Unified/MechEnsemble base)
    a_lo, a_hi = _scale_iv_v(nmu, nlo, nhi, NPE_SCALE)
    hw = np.maximum(1e-9, (a_hi - a_lo) / 2.0)
    pid_mu = simple["PartialID"]["mu"]; pid_lo = simple["PartialID"]["lo"]; pid_hi = simple["PartialID"]["hi"]
    pid_ok = np.isfinite(pid_mu) & np.isfinite(pid_lo) & np.isfinite(pid_hi)
    pid_disagree = pid_ok & ((pid_mu < a_lo) | (pid_mu > a_hi))

    # Unified (frozen gated): widen on PartialID disagreement only
    u_lo = np.where(pid_disagree, np.minimum(a_lo, pid_lo), a_lo)
    u_hi = np.where(pid_disagree, np.maximum(a_hi, pid_hi), a_hi)
    out["Unified"] = _metrics(np.clip(nmu, u_lo, u_hi), u_lo, u_hi, mu_true)

    # component spread -> OOD signal (gated NPE, DL, p-uniform*, WLS)
    comp = np.vstack([nmu, dl_mu, simple["p-uniform*"]["mu"], simple["WLS"]["mu"]])
    with np.errstate(invalid="ignore"):
        spread = np.nanmax(comp, axis=0) - np.nanmin(comp, axis=0)
    ood = spread / hw

    for K in OOD_KS:
        trig = pid_ok & (pid_disagree | (ood >= K))
        e_lo = np.where(trig, np.minimum(a_lo, pid_lo), a_lo)
        e_hi = np.where(trig, np.maximum(a_hi, pid_hi), a_hi)
        out[f"MechEns@{K}"] = _metrics(np.clip(nmu, e_lo, e_hi), e_lo, e_hi, mu_true)
        out[f"MechEns@{K}"]["widen_rate"] = float(np.mean(trig))

    return {"cell": cell, "cell_id": cid, "n_used": n, "methods": out}


def _per_method(results, predicate, metric, reduce="mean", absval=False):
    out = {}
    names = next(r["methods"].keys() for r in results if r["methods"])
    for name in names:
        vals = []
        for r in results:
            if not predicate(r["cell"]):
                continue
            x = r["methods"].get(name, {}).get(metric)
            if x is None or not np.isfinite(x):
                continue
            vals.append(abs(x) if absval else x)
        out[name] = (float(np.mean(vals)) if reduce == "mean" else
                     float(np.min(vals)) if reduce == "min" else
                     float(np.max(vals))) if vals else float("nan")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=600)
    ap.add_argument("--art", default=os.path.join(HERE, "sbi_model.pkl"))
    ap.add_argument("--procs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--out", default=os.path.join(HERE, "validation_ensemble.json"))
    args = ap.parse_args()

    ks = [5, 10, 15, 25, 50]
    cells = []
    for k in ks:
        for sc in dgp.SCENARIOS:
            cells.append({"mu": 0.3, "tau2": 0.05, "k": k, "scenario": sc, "block": "primary"})
    for k in [10, 25]:
        for sc in dgp.SCENARIOS:
            cells.append({"mu": 0.0, "tau2": 0.05, "k": k, "scenario": sc, "block": "typeI"})
    for k in ks:
        for sc in dgp.STRESS_SCENARIOS:
            cells.append({"mu": 0.3, "tau2": 0.05, "k": k, "scenario": sc, "block": "stress"})
    for k in [10, 25]:
        for sc in dgp.STRESS_SCENARIOS:
            cells.append({"mu": 0.0, "tau2": 0.05, "k": k, "scenario": sc, "block": "stress_typeI"})

    tasks = [(c, args.reps, args.art) for c in cells]
    print(f"[validate-ens] cells={len(cells)} reps={args.reps} procs={args.procs}", flush=True)
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

    is_primary = lambda c: c["block"] == "primary"
    is_none = lambda c: c["block"] == "primary" and c["scenario"] == "none"
    is_sel = lambda c: c["block"] == "primary" and c["scenario"] != "none"
    is_typeI = lambda c: c["block"] == "typeI"
    is_stress = lambda c: c["block"] == "stress"

    summary = {
        "clean_none": {"abs_bias": _per_method(results, is_none, "bias", "mean", True),
                       "width": _per_method(results, is_none, "width", "mean"),
                       "coverage": _per_method(results, is_none, "coverage", "mean")},
        "under_selection": {"abs_bias": _per_method(results, is_sel, "bias", "mean", True),
                            "mean_cov": _per_method(results, is_sel, "coverage", "mean"),
                            "min_cov": _per_method(results, is_sel, "coverage", "min")},
        "primary": {"abs_bias": _per_method(results, is_primary, "bias", "mean", True),
                    "mean_cov": _per_method(results, is_primary, "coverage", "mean"),
                    "min_cov": _per_method(results, is_primary, "coverage", "min"),
                    "width": _per_method(results, is_primary, "width", "mean")},
        "typeI": {"mean_reject0": _per_method(results, is_typeI, "reject0", "mean"),
                  "max_reject0": _per_method(results, is_typeI, "reject0", "max")},
        "stress": {"abs_bias": _per_method(results, is_stress, "bias", "mean", True),
                   "mean_cov": _per_method(results, is_stress, "coverage", "mean"),
                   "min_cov": _per_method(results, is_stress, "coverage", "min"),
                   "width": _per_method(results, is_stress, "width", "mean")},
    }
    payload = {"meta": {"reps": args.reps, "ood_ks": OOD_KS, "npe_scale": NPE_SCALE,
                        "n_cells": len(cells),
                        "elapsed_sec": round(time.perf_counter() - t0, 1)},
               "summary": summary, "per_cell": results}
    with open(args.out, "w") as f:
        json.dump(payload, f, indent=1)

    order = ["DL", "WLS", "WAAP", "p-uniform*", "PartialID",
             "NPE", "Unified"] + [f"MechEns@{K}" for K in OOD_KS]

    def block(title, d, keys=("abs_bias", "min_cov", "mean_cov", "width")):
        print(f"\n[{title}]")
        labels = {"abs_bias": "|bias|", "min_cov": "minCov", "mean_cov": "meanCov",
                  "width": "width", "mean_reject0": "tI_mean", "max_reject0": "tI_max",
                  "coverage": "cov"}
        for met in keys:
            if met not in d:
                continue
            row = "  " + f"{labels.get(met, met):8s}" + " ".join(
                f"{m.replace('MechEns','ME').replace('p-uniform*','puni'):>9s}={d[met].get(m, float('nan')):.3f}"
                for m in order if m in d[met])
            print(row)

    print(f"\n===== MECH-ENSEMBLE HEAD-TO-HEAD (reps={args.reps}, {time.perf_counter()-t0:.0f}s) =====")
    block("CLEAN none", summary["clean_none"], ("abs_bias", "coverage", "width"))
    block("UNDER SELECTION", summary["under_selection"], ("abs_bias", "min_cov", "mean_cov"))
    block("PRIMARY", summary["primary"])
    block("TYPE-I @ mu=0", summary["typeI"], ("mean_reject0", "max_reject0"))
    block("STRESS / OOD", summary["stress"])

    # Pareto verdict vs NPE and Unified on the stress block (where widening should pay)
    print("\n[VERDICT] MechEnsemble vs NPE / Unified (truth-first):")
    for blk, s in (("primary", summary["primary"]), ("stress", summary["stress"])):
        for K in OOD_KS:
            me = f"MechEns@{K}"
            dmin = s["min_cov"][me] - s["min_cov"]["NPE"]
            dwid_u = s["width"][me] - s["width"]["Unified"]
            print(f"  {blk:7s} {me:11s} minCov {s['min_cov'][me]:.3f} "
                  f"(vsNPE {dmin:+.3f}); width {s['width'][me]:.3f} "
                  f"(vsUnified {dwid_u:+.3f})")
    print(f"\n[validate-ens] -> {args.out}")


if __name__ == "__main__":
    main()
