"""
validate_gate.py — Old-vs-gated A/B of the P1.1 severity-gated correction on the
known-truth harness, exact harness seeding (harness.BASE_SEED + per-cell
SeedSequence), so every number is directly comparable to the committed
head-to-head and to validate_robust.py.

The gate is a POINT-ONLY transform of the SAME committed artifact (sbi_model.pkl):

    NPE_old      : ungated conditional-median point + conformal interval
    NPE_gated    : DL_mu + g(sev)*(NPE_mu - DL_mu)  point; SAME conformal interval
    Unified_old  : NPE_old   ⊕ PartialID  (gated combiner, scale 1.15 — frozen)
    Unified_gated: NPE_gated ⊕ PartialID  (same combiner, gated NPE point)
    DL           : DerSimonian-Laird      (clean-data reference for the tax)

Because the gate touches only the point, NPE_gated's interval == NPE_old's
interval on every replication; coverage / width / type-I differ ONLY through
Monte-Carlo-identical arithmetic, i.e. they are IDENTICAL. The bias columns are
the only ones that move. This script verifies that invariant numerically and
quantifies the clean-data-tax cut and its honest cost (under-selection point
bias). Truth-first: prints regressions too.

  python validate_gate.py --reps 800
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


def _load_art(path):
    if path not in _ART:
        import pickle
        with open(path, "rb") as f:
            _ART[path] = pickle.load(f)
    return _ART[path]


def npe_batch(art, X):
    """Vectorised ungated NPE over a feature matrix X. Returns (mu, lo, hi)."""
    q_grid = art["q_grid"]; models = art["models"]; conf = art["conformal"]
    P = T.predict_grid(models, q_grid, X)
    d = np.array([T.conformal_d(conf, X[i]) for i in range(X.shape[0])])
    lo = P[:, conf["lo_idx"]] - d
    hi = P[:, conf["hi_idx"]] + d
    mu = np.clip(P[:, q_grid.index(0.5)], lo, hi)
    return mu, lo, hi


def gate_points(npe_mu, npe_lo, npe_hi, dl_mu, sev, s0, s1):
    """Apply the severity gate to NPE points (vectorised), interval untouched.
    Matches sbi.npe exactly: clamp gated point into [lo, hi]."""
    g = np.array([S.severity_gate(s, s0, s1) for s in sev])
    mug = dl_mu + g * (npe_mu - dl_mu)
    return np.clip(mug, npe_lo, npe_hi)


def _scale_iv(mu, lo, hi, s):
    if s == 1.0 or not (np.isfinite(lo) and np.isfinite(hi) and np.isfinite(mu)):
        return lo, hi
    return mu - s * (mu - lo), mu + s * (hi - mu)


def unified_from(npe_mu, npe_lo, npe_hi, pid_mu, pid_lo, pid_hi, s=1.15):
    """unified.unified (gated, scale s) from precomputed NPE + PartialID scalars."""
    if not (np.isfinite(npe_mu) and np.isfinite(npe_lo) and np.isfinite(npe_hi)):
        return pid_mu, pid_lo, pid_hi
    a_lo, a_hi = _scale_iv(npe_mu, npe_lo, npe_hi, s)
    if not (np.isfinite(pid_mu) and np.isfinite(pid_lo)):
        return float(np.clip(npe_mu, a_lo, a_hi)), a_lo, a_hi
    disagree = (pid_mu < a_lo) or (pid_mu > a_hi)
    if disagree:
        lo = min(a_lo, pid_lo); hi = max(a_hi, pid_hi)
    else:
        lo, hi = a_lo, a_hi
    return float(np.clip(npe_mu, lo, hi)), float(lo), float(hi)


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
    cell, reps, art_path, s0, s1 = task
    mu_true, tau2_true, k, sc = cell["mu"], cell["tau2"], cell["k"], cell["scenario"]
    cid = H._cell_id(cell)
    ss = np.random.SeedSequence([H.BASE_SEED, H._stable_hash(cid), k])
    child = ss.spawn(reps)
    art = _load_art(art_path)

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
    if n_used == 0:
        return {"cell": cell, "cell_id": cid, "n_used": 0, "methods": {}}
    X = np.vstack(Xs)
    dl_mu = np.array(dl_mu)
    pid_mu = np.array(pid_mu); pid_lo = np.array(pid_lo); pid_hi = np.array(pid_hi)
    sev = np.array([T._sev_proxy(X[i]) for i in range(n_used)])

    nmu, nlo, nhi = npe_batch(art, X)
    gmu = gate_points(nmu, nlo, nhi, dl_mu, sev, s0, s1)

    out = {}
    out["NPE_old"] = _metrics(nmu, nlo, nhi, mu_true)
    out["NPE_gated"] = _metrics(gmu, nlo, nhi, mu_true)   # SAME interval
    # Unified, old vs gated NPE point (PartialID shared)
    for tag, pts in (("old", nmu), ("gated", gmu)):
        umu = np.empty(n_used); ulo = np.empty(n_used); uhi = np.empty(n_used)
        for i in range(n_used):
            umu[i], ulo[i], uhi[i] = unified_from(pts[i], nlo[i], nhi[i],
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
    out = {}
    names = next(r["methods"].keys() for r in results if r["methods"])
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
    ap.add_argument("--art", default=os.path.join(HERE, "sbi_model.pkl"))
    ap.add_argument("--s0", type=float, default=S._GATE_S0)
    ap.add_argument("--s1", type=float, default=S._GATE_S1)
    ap.add_argument("--procs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--out", default=os.path.join(HERE, "validation_gate.json"))
    args = ap.parse_args()

    cells = build_grid()
    tasks = [(c, args.reps, args.art, args.s0, args.s1) for c in cells]
    print(f"[validate-gate] cells={len(cells)} reps={args.reps} procs={args.procs} "
          f"gate=({args.s0},{args.s1})", flush=True)
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
        "meta": {"reps": args.reps, "art": os.path.basename(args.art),
                 "gate_s0": args.s0, "gate_s1": args.s1, "n_cells": len(cells),
                 "elapsed_sec": round(time.perf_counter() - t0, 1)},
        "summary": summary,
        "per_cell": results,
    }
    with open(args.out, "w") as f:
        json.dump(payload, f, indent=1)

    def row(label, d, keys=("NPE_old", "NPE_gated", "Unified_old", "Unified_gated", "DL")):
        def tag(k):
            base = k.split("_")[0][:3]
            suf = "G" if "gated" in k else ("O" if "old" in k else "")
            return base + suf
        return f"  {label:24s} " + " ".join(f"{tag(k):>7}={d.get(k, float('nan')):.3f}" for k in keys)

    print(f"\n===== SEVERITY-GATE A/B  (reps={args.reps}, gate=({args.s0},{args.s1}), "
          f"{time.perf_counter()-t0:.0f}s) =====")
    print("[CLEAN-DATA TAX]  (scenario=none, mu=0.3) -- want NPE_gated |bias| DOWN toward DL")
    print(row("|bias|", summary["clean_data_none"]["mean_abs_bias"]))
    print(row("width  (MUST be unchanged)", summary["clean_data_none"]["mean_width"]))
    print(row("coverage (unchanged)", summary["clean_data_none"]["mean_coverage"]))
    print("[UNDER SELECTION]  -- coverage MUST be unchanged; point |bias| is the honest cost")
    print(row("mean |bias|", summary["under_selection"]["mean_abs_bias"]))
    print(row("mean coverage", summary["under_selection"]["mean_coverage"]))
    print(row("min coverage", summary["under_selection"]["min_coverage"]))
    print("[PRIMARY OVERALL]")
    print(row("mean coverage", summary["primary_overall"]["mean_coverage"]))
    print(row("min coverage", summary["primary_overall"]["min_coverage"]))
    print(row("mean width", summary["primary_overall"]["mean_width"]))
    print("[TYPE-I @ mu=0]  -- MUST be unchanged (interval untouched)")
    print(row("mean reject0", summary["typeI"]["mean_reject0"]))
    print(row("max reject0", summary["typeI"]["max_reject0"]))
    print("[STRESS / OOD]")
    print(row("mean coverage", summary["stress_ood"]["mean_coverage"]))
    print(row("min coverage", summary["stress_ood"]["min_coverage"]))
    print(f"\n[validate-gate] -> {args.out}")


if __name__ == "__main__":
    main()
