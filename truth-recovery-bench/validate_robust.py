"""
validate_robust.py — Old-vs-new A/B of the robust-SBI retrain on the known-truth
harness.

Scores, on the EXACT harness seeding (harness.BASE_SEED + per-cell SeedSequence,
so every number is directly comparable to the committed head-to-head):

  NPE_old      : sbi_model.pkl            (committed estimator)
  NPE_new      : sbi_model_robust.pkl     (this P1 retrain)
  Unified_old  : NPE_old  ⊕ PartialID     (gated, scale 1.15 — frozen config)
  Unified_new  : NPE_new  ⊕ PartialID     (same combiner, new NPE)
  DL           : DerSimonian-Laird        (clean-data reference for the tax)

across the primary grid (μ=0.3, τ²=0.05), the type-I probe (μ=0), and the four
OOD stress scenarios. Reports bias / RMSE / coverage / mean width / type-I and
the targeted cuts: clean-data tax, under-selection min-coverage, stress
min-coverage, interval-width premium. Truth-first: prints regressions too.

  python validate_robust.py --reps 800
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
from robust_selection import partial_id as _partial_id

HERE = os.path.dirname(os.path.abspath(__file__))
_ART = {}          # path -> artifact (per-process cache)


def _load_art(path):
    if path not in _ART:
        import pickle
        with open(path, "rb") as f:
            _ART[path] = pickle.load(f)
    return _ART[path]


def npe_with(art, y, v):
    """sbi.npe replicated, parameterised by a given artifact (train/infer parity
    via train_sbi.predict_grid / conformal_d). Scalar path (kept for parity/tests)."""
    y = np.asarray(y, float); v = np.asarray(v, float)
    try:
        x = F.featurize(y, v).reshape(1, -1)
    except Exception:
        re = M.reml(y, v); return {**re, "ok": False}
    q_grid = art["q_grid"]; models = art["models"]; conf = art["conformal"]
    P = T.predict_grid(models, q_grid, x)[0]
    d = T.conformal_d(conf, x[0])
    lo = float(P[conf["lo_idx"]] - d); hi = float(P[conf["hi_idx"]] + d)
    mu = float(P[q_grid.index(0.5)]); mu = min(max(mu, lo), hi)
    tau2 = max(0.0, float(art["tau2_model"].predict(x)[0]))
    return {"mu": mu, "ci_lo": lo, "ci_hi": hi, "tau2": tau2, "ok": True}


def npe_batch(art, X):
    """Vectorised NPE over a feature matrix X (N x n_features). One predict_grid
    call (9 GBM predicts on N rows) instead of N x 9 single-row predicts — the
    ~500x speedup that makes the A/B feasible. Returns (mu, lo, hi) arrays."""
    q_grid = art["q_grid"]; models = art["models"]; conf = art["conformal"]
    P = T.predict_grid(models, q_grid, X)            # (N, 9), already mu-space
    d = np.array([T.conformal_d(conf, X[i]) for i in range(X.shape[0])])
    lo = P[:, conf["lo_idx"]] - d
    hi = P[:, conf["hi_idx"]] + d
    mu = np.clip(P[:, q_grid.index(0.5)], lo, hi)
    return mu, lo, hi


def unified_from(npe_mu, npe_lo, npe_hi, pid_mu, pid_lo, pid_hi, s=1.15):
    """unified.unified (gated, scale s) from precomputed NPE + PartialID scalars."""
    if not (np.isfinite(npe_mu) and np.isfinite(npe_lo) and np.isfinite(npe_hi)):
        return pid_mu, pid_lo, pid_hi               # NPE failed -> PartialID
    a_lo, a_hi = _scale_iv(npe_mu, npe_lo, npe_hi, s)
    if not (np.isfinite(pid_mu) and np.isfinite(pid_lo)):
        return float(np.clip(npe_mu, a_lo, a_hi)), a_lo, a_hi
    disagree = (pid_mu < a_lo) or (pid_mu > a_hi)
    if disagree:
        lo = min(a_lo, pid_lo); hi = max(a_hi, pid_hi)
    else:
        lo, hi = a_lo, a_hi
    return float(np.clip(npe_mu, lo, hi)), float(lo), float(hi)


def _scale_iv(mu, lo, hi, s):
    if s == 1.0 or not (np.isfinite(lo) and np.isfinite(hi) and np.isfinite(mu)):
        return lo, hi
    return mu - s * (mu - lo), mu + s * (hi - mu)


def unified_with(art, y, v, mode="gated", s=1.15):
    """unified.unified replicated with the NPE bound to `art` (frozen gated config)."""
    a = npe_with(art, y, v); b = _partial_id(y, v)
    a_ok = a.get("ok") and np.isfinite(a.get("mu", np.nan))
    b_ok = b.get("ok") and np.isfinite(b.get("mu", np.nan))
    if not a_ok and not b_ok:
        re = M.reml(y, v); return {**re, "ok": False}
    if not a_ok:
        return {**b, "ok": True}
    if not b_ok:
        return {**a, "ok": True}
    a_lo, a_hi = _scale_iv(a["mu"], a["ci_lo"], a["ci_hi"], s)
    disagree = (b["mu"] < a_lo) or (b["mu"] > a_hi)
    if disagree:
        lo = min(a_lo, b["ci_lo"]); hi = max(a_hi, b["ci_hi"])
    else:
        lo, hi = a_lo, a_hi
    mu = float(min(max(a["mu"], lo), hi))
    return {"mu": mu, "ci_lo": float(lo), "ci_hi": float(hi),
            "tau2": a.get("tau2", np.nan), "ok": True}


def _metrics(mu, lo, hi, mu_true):
    """Per-method aggregate from estimate/interval arrays."""
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
    """Score one grid cell. NPE is batched across reps; PartialID is computed
    once per rep and SHARED by both Unified variants (model-independent)."""
    cell, reps, old_path, new_path = task
    mu_true, tau2_true, k, sc = cell["mu"], cell["tau2"], cell["k"], cell["scenario"]
    cid = H._cell_id(cell)
    ss = np.random.SeedSequence([H.BASE_SEED, H._stable_hash(cid), k])
    child = ss.spawn(reps)
    old = _load_art(old_path); new = _load_art(new_path)

    Xs = []
    dl_mu, dl_lo, dl_hi = [], [], []
    pid_mu, pid_lo, pid_hi = [], [], []
    for rep in range(reps):
        rng = np.random.default_rng(child[rep])
        y, v, info = dgp.generate(mu_true, tau2_true, k, sc, rng)
        if info["degenerate"] or len(y) < 3:
            continue
        Xs.append(F.featurize(y, v))
        d = M.dersimonian_laird(y, v)
        dl_mu.append(d.get("mu", np.nan)); dl_lo.append(d.get("ci_lo", np.nan)); dl_hi.append(d.get("ci_hi", np.nan))
        try:
            p = _partial_id(y, v)
            pid_mu.append(p.get("mu", np.nan)); pid_lo.append(p.get("ci_lo", np.nan)); pid_hi.append(p.get("ci_hi", np.nan))
        except Exception:
            pid_mu.append(np.nan); pid_lo.append(np.nan); pid_hi.append(np.nan)
    n_used = len(Xs)
    out = {}
    if n_used == 0:
        return {"cell": cell, "cell_id": cid, "n_used": 0, "methods": {}}
    X = np.vstack(Xs)
    pid_mu = np.array(pid_mu); pid_lo = np.array(pid_lo); pid_hi = np.array(pid_hi)

    for tag, art in (("old", old), ("new", new)):
        nmu, nlo, nhi = npe_batch(art, X)
        out[f"NPE_{tag}"] = _metrics(nmu, nlo, nhi, mu_true)
        umu = np.empty(n_used); ulo = np.empty(n_used); uhi = np.empty(n_used)
        for i in range(n_used):
            umu[i], ulo[i], uhi[i] = unified_from(nmu[i], nlo[i], nhi[i],
                                                  pid_mu[i], pid_lo[i], pid_hi[i])
        out[f"Unified_{tag}"] = _metrics(umu, ulo, uhi, mu_true)
    out["DL"] = _metrics(dl_mu, dl_lo, dl_hi, mu_true)
    return {"cell": cell, "cell_id": cid, "n_used": n_used, "methods": out}


def build_grid():
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
    return cells


def _per_method(results, predicate, metric, reduce="mean", absval=False):
    """Aggregate `metric` over cells matching predicate, per method."""
    out = {}
    names = results[0]["methods"].keys()
    for name in names:
        vals = []
        for r in results:
            if not predicate(r["cell"]):
                continue
            md = r["methods"].get(name, {})
            x = md.get(metric)
            if x is None or not np.isfinite(x):
                continue
            vals.append(abs(x) if absval else x)
        if not vals:
            out[name] = float("nan")
        elif reduce == "mean":
            out[name] = float(np.mean(vals))
        elif reduce == "min":
            out[name] = float(np.min(vals))
        elif reduce == "max":
            out[name] = float(np.max(vals))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=800)
    ap.add_argument("--old", default=os.path.join(HERE, "sbi_model.pkl"))
    ap.add_argument("--new", default=os.path.join(HERE, "sbi_model_robust.pkl"))
    ap.add_argument("--procs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--out", default=os.path.join(HERE, "validation_robust.json"))
    args = ap.parse_args()

    cells = build_grid()
    tasks = [(c, args.reps, args.old, args.new) for c in cells]
    print(f"[validate] cells={len(cells)} reps={args.reps} procs={args.procs}", flush=True)
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
        for i, task in enumerate(tasks, 1):
            results.append(score_cell(task))

    # ---- aggregates ----
    is_primary = lambda c: c["block"] == "primary"
    is_none = lambda c: c["block"] == "primary" and c["scenario"] == "none"
    is_sel = lambda c: c["block"] == "primary" and c["scenario"] != "none"
    is_typeI = lambda c: c["block"] == "typeI"
    is_stress = lambda c: c["block"] == "stress"

    summary = {
        "clean_data_none": {
            "mean_abs_bias": _per_method(results, is_none, "bias", "mean", absval=True),
            "mean_width": _per_method(results, is_none, "width", "mean"),
            "mean_coverage": _per_method(results, is_none, "coverage", "mean"),
        },
        "under_selection": {
            "mean_abs_bias": _per_method(results, is_sel, "bias", "mean", absval=True),
            "mean_coverage": _per_method(results, is_sel, "coverage", "mean"),
            "min_coverage": _per_method(results, is_sel, "coverage", "min"),
        },
        "primary_overall": {
            "mean_abs_bias": _per_method(results, is_primary, "bias", "mean", absval=True),
            "mean_rmse": _per_method(results, is_primary, "rmse", "mean"),
            "mean_coverage": _per_method(results, is_primary, "coverage", "mean"),
            "min_coverage": _per_method(results, is_primary, "coverage", "min"),
            "mean_width": _per_method(results, is_primary, "width", "mean"),
        },
        "typeI": {
            "mean_reject0": _per_method(results, is_typeI, "reject0", "mean"),
            "max_reject0": _per_method(results, is_typeI, "reject0", "max"),
        },
        "stress_ood": {
            "mean_abs_bias": _per_method(results, is_stress, "bias", "mean", absval=True),
            "mean_coverage": _per_method(results, is_stress, "coverage", "mean"),
            "min_coverage": _per_method(results, is_stress, "coverage", "min"),
            "mean_width": _per_method(results, is_stress, "width", "mean"),
        },
    }

    payload = {
        "meta": {"reps": args.reps, "old": os.path.basename(args.old),
                 "new": os.path.basename(args.new), "n_cells": len(cells),
                 "elapsed_sec": round(time.perf_counter() - t0, 1)},
        "summary": summary,
        "per_cell": results,
    }
    with open(args.out, "w") as f:
        json.dump(payload, f, indent=1)

    # ---- console before/after ----
    def row(label, d, keys=("NPE_old", "NPE_new", "Unified_old", "Unified_new", "DL")):
        return f"  {label:30s} " + " ".join(f"{k.split('_')[0][:3]+('N' if 'new' in k else 'O' if 'old' in k else ''):>7}={d.get(k, float('nan')):.3f}" for k in keys)

    print(f"\n========== ROBUST-SBI A/B  (reps={args.reps}, {time.perf_counter()-t0:.0f}s) ==========")
    print("[CLEAN-DATA TAX]  (scenario=none, mu=0.3)  -- want NPE_new |bias| & width DOWN toward DL")
    print(row("|bias|", summary["clean_data_none"]["mean_abs_bias"]))
    print(row("width", summary["clean_data_none"]["mean_width"]))
    print("[UNDER SELECTION]  -- want coverage advantage HELD")
    print(row("mean |bias|", summary["under_selection"]["mean_abs_bias"]))
    print(row("mean coverage", summary["under_selection"]["mean_coverage"]))
    print(row("min coverage", summary["under_selection"]["min_coverage"]))
    print("[PRIMARY OVERALL]")
    print(row("mean coverage", summary["primary_overall"]["mean_coverage"]))
    print(row("min coverage", summary["primary_overall"]["min_coverage"]))
    print(row("mean width", summary["primary_overall"]["mean_width"]))
    print("[TYPE-I @ mu=0]  -- want stays controlled (<=~0.05-0.07)")
    print(row("mean reject0", summary["typeI"]["mean_reject0"]))
    print("[STRESS / OOD]  (mixed_strong, heavy_tail, *_vstrong)")
    print(row("mean coverage", summary["stress_ood"]["mean_coverage"]))
    print(row("min coverage", summary["stress_ood"]["min_coverage"]))
    print(f"\n[validate] -> {args.out}")


if __name__ == "__main__":
    main()
