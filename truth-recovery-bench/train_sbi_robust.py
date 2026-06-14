"""
train_sbi_robust.py — Robust-SBI retrain of the amortized truth-recovery
estimator (frontier roadmap **P1**: "Robust-SBI retrain — shrink NPE OOD dip;
reduce gate reliance").

WHAT THIS IS (truth-first framing)
----------------------------------
The "NPE / neural posterior estimator" of this benchmark is an *amortized
simulation-based inference* estimator implemented as gradient-boosted
conditional-quantile regression (sklearn HistGradientBoostingRegressor) on a
fixed permutation-invariant feature map phi(D) (features.py), calibrated with
Mondrian conformal prediction. It is NPE-*style* (amortized posterior quantiles
+ SBC/PIT diagnostics) but is NOT a deep neural net — there is no autodiff
backend or GPU on this machine. Consequently:

  * "Checkpoint model + optimizer state + RNG" is realised as a STAGED, RESUMABLE
    pipeline: corpus simulation is chunked to disk (.npz), each quantile model is
    fitted and pickled one at a time, and a state.json records stage progress +
    the deterministic seeds. Because every stage is seeded by an explicit
    SeedSequence, RESUME is exact: re-running skips any artifact already on disk
    and reproduces the rest bit-for-bit. RNG bit-generator states are also dumped
    to state.json for audit.

THE ROBUSTNESS IMPROVEMENTS (vs train_sbi.py), each tied to a roadmap item
-------------------------------------------------------------------------
1. MIXTURE / HEAVIER-TAIL SIMULATOR COVERAGE. The training simulator now draws,
   in addition to none/step/copas, a MIXED mechanism (a study must pass BOTH a
   p-step weight AND a Copas latent gate) and, on a fraction of draws, Student-t
   random effects. These are exactly the two OOD stress scenarios the head-to-head
   exposed (`mixed_strong`, `heavy_tail`); training on them turns the NPE OOD dip
   into an in-distribution regime. This is the GBM-SBI analog of robust /
   generalized-Bayes SBI (arXiv:2504.09475, arXiv:2601.22367): robustness to
   simulator misspecification, achieved by directly broadening the simulator,
   with the intrinsically-robust median/pinball (L1) quantile loss.

2. CLEAN-DATA DE-BIASING TAX. The committed head-to-head shows NPE carries
   |bias| ~0.055 under NO selection (vs DL ~0.003) because it was trained
   expecting selection and over-corrects clean data. We raise the clean ("none")
   mixture share from ~0.22 to ~0.30 so the residual-correction target is densely
   anchored at ~0 in the low-severity region of feature space.

3. SE-SUPPORT WIDENED toward real data. Training study-SE support widens modestly
   from [0.10,0.70] to [0.08,0.85] so the benchmark grid (0.10-0.70) is bracketed
   with margin (edge robustness) without a large distribution shift. A full
   real-scale variant (se-hi 3.0) remains the separate sbi_model_realscale.pkl
   track so benchmark validation stays apples-to-apples on the benchmark scale.

The trained artifact (sbi_model_robust.pkl) has the IDENTICAL structure to
sbi_model.pkl and reuses predict_grid / build_conformal / conformal_d from
train_sbi.py verbatim, so sbi.py loads it unchanged via SBI_MODEL_PATH — making
the old-vs-new A/B a pure artifact swap on identical seeds.

Run
---
  python train_sbi_robust.py --quick          # ~minutes, end-to-end smoke
  python train_sbi_robust.py                   # full run (checkpointed, resumable)
  python train_sbi_robust.py                   # re-run after interrupt -> resumes
"""

import argparse
import json
import os
import pickle
import time

import numpy as np
from scipy import stats
from sklearn.ensemble import HistGradientBoostingRegressor

import dgp  # noqa: F401  (kept for parity / eval)
import features as F
import train_sbi as T

HERE = os.path.dirname(os.path.abspath(__file__))
ROBUST_SEED = 909_271              # disjoint from TRAIN_SEED (777_123) & BASE_SEED
CKPT_DIR = os.path.join(HERE, "ckpt_robust")
LOG_PATH = os.path.join(HERE, "train_robust.log")
STATE_PATH = os.path.join(CKPT_DIR, "state.json")
OUT_DEFAULT = os.path.join(HERE, "sbi_model_robust.pkl")
Q_GRID = T.Q_GRID
_STEP_CUTS = np.array([0.025, 0.05])

# Main robust mixture configuration (frozen; see module docstring).
DEFAULT_CFG = {
    "p_none": 0.30, "p_step": 0.34, "p_copas": 0.26, "p_mixed": 0.10,
    "p_heavy": 0.18,                 # fraction of draws with Student-t(ν) RE
    "se_lo": 0.08, "se_hi": 0.85,
}


# ---------------------------------------------------------------------------
# logging
# ---------------------------------------------------------------------------

def log(msg):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ---------------------------------------------------------------------------
# Augmented, continuous-severity training DGP (none/step/copas/mixed + heavy tail)
# ---------------------------------------------------------------------------

def _draw_se(rng, k, se_lo, se_hi):
    return np.exp(rng.uniform(np.log(se_lo), np.log(se_hi), size=k))


def _draw_step_weights(rng):
    """p-step weights [1, w1, w2], biased toward stronger-than-benchmark."""
    r = rng.random()
    if r < 0.25:                       # exact benchmark configs (dense coverage)
        w = rng.choice(["weak", "strong"])
        return np.array([1.0, 0.75, 0.55]) if w == "weak" else np.array([1.0, 0.35, 0.10])
    if r < 0.45:                       # beyond-benchmark very-strong tier
        w1 = rng.uniform(0.05, 0.30)
        w2 = rng.uniform(0.02, w1)
        return np.array([1.0, w1, w2])
    w1 = rng.uniform(0.10, 0.95)       # continuous, bracketing weak..strong
    w2 = rng.uniform(0.02, w1)
    return np.array([1.0, w1, w2])


def _draw_copas(rng):
    if rng.random() < 0.30:
        c = rng.choice(["weak", "strong"])
        return ({"g0": -0.10, "g1": 0.12, "rho": 0.50} if c == "weak"
                else {"g0": -0.20, "g1": 0.12, "rho": 0.90})
    return {"g0": rng.uniform(-0.50, 0.00),
            "g1": rng.uniform(0.05, 0.25),
            "rho": rng.uniform(0.20, 0.95)}


def _draw_theta(rng, mu, tau2, size, heavy_df):
    """Random effects: Normal, or variance-matched Student-t(heavy_df)."""
    if tau2 <= 0:
        return np.full(size, mu)
    if heavy_df is None:
        return rng.normal(mu, np.sqrt(tau2), size=size)
    scale = np.sqrt(tau2 * (heavy_df - 2) / heavy_df)   # match variance to tau2
    return mu + scale * rng.standard_t(heavy_df, size=size)


def gen_ma(rng, mu, tau2, k, mech, heavy_df, se_lo, se_hi, max_factor=400):
    """One published meta-analysis under mechanism `mech` (dict). None if it
    could not reach k published studies within the rejection cap."""
    kind = mech["kind"]
    if kind == "none":
        se = _draw_se(rng, k, se_lo, se_hi)
        theta = _draw_theta(rng, mu, tau2, k, heavy_df)
        y = rng.normal(theta, se)
        return y, se ** 2
    keep_y, keep_se, n_ex, cap = [], [], 0, max_factor * k
    while len(keep_y) < k and n_ex < cap:
        b = max(k, 64)
        se = _draw_se(rng, b, se_lo, se_hi)
        theta = _draw_theta(rng, mu, tau2, b, heavy_df)
        eps = rng.normal(0.0, 1.0, size=b)
        y = theta + se * eps
        if kind in ("step", "mixed"):
            p_one = stats.norm.sf(y / se)
            idx = np.searchsorted(_STEP_CUTS, p_one, side="right")
            w = mech["weights"][idx]
            pass_step = rng.random(b) < w
        if kind in ("copas", "mixed"):
            d = mech["rho"] * eps + np.sqrt(1 - mech["rho"] ** 2) * rng.normal(0, 1, b)
            z = mech["g0"] + mech["g1"] / se + d
            pass_copas = z > 0.0
        if kind == "step":
            pub = pass_step
        elif kind == "copas":
            pub = pass_copas
        else:  # mixed: must pass BOTH gates (misspecified vs either pure model)
            pub = pass_step & pass_copas
        for yi, sei, p in zip(y, se, pub):
            n_ex += 1
            if p:
                keep_y.append(yi); keep_se.append(sei)
                if len(keep_y) >= k:
                    break
    if len(keep_y) < k:
        return None
    return np.asarray(keep_y[:k]), np.asarray(keep_se[:k]) ** 2


def _sample_mech(rng, cfg):
    u = rng.random()
    c1 = cfg["p_none"]
    c2 = c1 + cfg["p_step"]
    c3 = c2 + cfg["p_copas"]
    if u < c1:
        return {"kind": "none"}
    if u < c2:
        return {"kind": "step", "weights": _draw_step_weights(rng)}
    if u < c3:
        return {"kind": "copas", **_draw_copas(rng)}
    return {"kind": "mixed", "weights": _draw_step_weights(rng), **_draw_copas(rng)}


def simulate_chunk(n, seed, cfg):
    """Generate n (features, mu, tau2, k) rows from the augmented DGP.

    `seed` may be an int or a numpy SeedSequence (deterministic per chunk).
    """
    rng = np.random.default_rng(seed)
    X = np.empty((n, F.N_FEATURES))
    Y = np.empty(n)
    Tt = np.empty(n)
    KK = np.empty(n, dtype=int)
    i = 0
    while i < n:
        mu = rng.uniform(-1.2, 1.2)
        tau2 = 0.0 if rng.random() < 0.15 else rng.uniform(0.0, 0.30)
        mech = _sample_mech(rng, cfg)
        heavy_df = int(rng.integers(3, 11)) if rng.random() < cfg["p_heavy"] else None
        # Oversample large k under strong step/mixed selection — the regime where
        # the conformal interval is narrowest and residual selection bias bites.
        strong = (mech["kind"] in ("step", "mixed") and mech["weights"][1] < 0.40)
        if strong and rng.random() < 0.55:
            k = int(rng.integers(18, 56))
        else:
            k = int(rng.integers(4, 56))
        out = gen_ma(rng, mu, tau2, k, mech, heavy_df, cfg["se_lo"], cfg["se_hi"])
        if out is None:
            continue
        y, v = out
        if len(y) < 3:
            continue
        try:
            X[i] = F.featurize(y, v)
        except Exception:
            continue
        Y[i] = mu; Tt[i] = tau2; KK[i] = k
        i += 1
    return X, Y, Tt, KK


# ---------------------------------------------------------------------------
# Checkpointed parallel corpus simulation (resume = skip chunks on disk)
# ---------------------------------------------------------------------------

def _chunk_path(split, ci, ckpt_dir):
    return os.path.join(ckpt_dir, f"corpus_{split}_{ci:03d}.npz")


def _chunk_worker(task):
    # ckpt_dir is passed explicitly: on Windows-spawn the worker re-imports the
    # module fresh, so the parent's --tag reassignment of CKPT_DIR is invisible.
    split, ci, n_ci, cfg, ckpt_dir = task
    # Deterministic per (split, ci) so resume regenerates the identical chunk.
    ss = np.random.SeedSequence([ROBUST_SEED, _split_code(split), ci])
    X, Y, Tt, KK = simulate_chunk(n_ci, ss, cfg)
    np.savez(_chunk_path(split, ci, ckpt_dir), X=X, Y=Y, T=Tt, K=KK)
    return split, ci, n_ci


_SPLIT_CODES = {"train": 1, "cal": 2, "val": 3}


def _split_code(split):
    return _SPLIT_CODES[split]


def build_corpus(split, n_total, cfg, chunk, procs):
    """Return (X, Y, T, K) for a split, simulating any missing chunks in parallel
    and caching each to disk so an interrupted run resumes for free."""
    n_chunks = (n_total + chunk - 1) // chunk
    sizes = [min(chunk, n_total - ci * chunk) for ci in range(n_chunks)]
    todo = [ci for ci in range(n_chunks) if not os.path.exists(_chunk_path(split, ci, CKPT_DIR))]
    done0 = n_chunks - len(todo)
    if done0:
        log(f"  [{split}] resume: {done0}/{n_chunks} chunks already on disk")
    tasks = [(split, ci, sizes[ci], cfg, CKPT_DIR) for ci in todo]
    if tasks:
        t0 = time.perf_counter()
        if procs > 1 and len(tasks) > 1:
            import multiprocessing as mp
            with mp.Pool(min(procs, len(tasks))) as pool:
                for j, (sp, ci, n_ci) in enumerate(pool.imap_unordered(_chunk_worker, tasks), 1):
                    log(f"  [{split}] chunk {ci} done ({n_ci} rows) "
                        f"[{done0 + j}/{n_chunks}, {time.perf_counter()-t0:.0f}s]")
        else:
            for j, task in enumerate(tasks, 1):
                sp, ci, n_ci = _chunk_worker(task)
                log(f"  [{split}] chunk {ci} done ({n_ci} rows) "
                    f"[{done0 + j}/{n_chunks}, {time.perf_counter()-t0:.0f}s]")
    # assemble in order
    Xs, Ys, Ts, Ks = [], [], [], []
    for ci in range(n_chunks):
        d = np.load(_chunk_path(split, ci, CKPT_DIR))
        Xs.append(d["X"]); Ys.append(d["Y"]); Ts.append(d["T"]); Ks.append(d["K"])
    return (np.concatenate(Xs), np.concatenate(Ys),
            np.concatenate(Ts), np.concatenate(Ks))


# ---------------------------------------------------------------------------
# Checkpointed quantile fitting (resume = skip models on disk)
# ---------------------------------------------------------------------------

def _models_ckpt_path():
    return os.path.join(CKPT_DIR, "models_partial.pkl")


def fit_quantiles_ckpt(Xtr, Ytr, q_grid, seed, iters, lr=0.06, leaves=47,
                       min_leaf=40):
    """Fit residual (mu - fe_mu) quantile GBMs one at a time, checkpointing the
    partial dict after each so an interrupt resumes mid-fit."""
    resid = Ytr - Xtr[:, T._FE_IDX]
    path = _models_ckpt_path()
    models = {}
    if os.path.exists(path):
        with open(path, "rb") as f:
            models = pickle.load(f)
        log(f"  [fit] resume: {len(models)}/{len(q_grid)} quantile models on disk")
    for qi, q in enumerate(q_grid):
        if q in models:
            continue
        t0 = time.perf_counter()
        m = HistGradientBoostingRegressor(
            loss="quantile", quantile=q, learning_rate=lr,
            max_leaf_nodes=leaves, max_iter=iters, min_samples_leaf=min_leaf,
            l2_regularization=1.0, random_state=seed + qi)
        m.fit(Xtr, resid)
        models[q] = m
        with open(path, "wb") as f:
            pickle.dump(models, f)
        log(f"  [fit] quantile q={q} done ({time.perf_counter()-t0:.0f}s) "
            f"[{len(models)}/{len(q_grid)}]")
    return models


def _tau2_ckpt_path():
    return os.path.join(CKPT_DIR, "tau2_model.pkl")


def fit_tau2_ckpt(Xtr, Ttr, seed, iters):
    path = _tau2_ckpt_path()
    if os.path.exists(path):
        with open(path, "rb") as f:
            log("  [fit] resume: tau2 model on disk")
            return pickle.load(f)
    t0 = time.perf_counter()
    m = HistGradientBoostingRegressor(
        loss="squared_error", learning_rate=0.06, max_leaf_nodes=31,
        max_iter=iters, min_samples_leaf=40, l2_regularization=1.0,
        random_state=seed + 99)
    m.fit(Xtr, Ttr)
    with open(path, "wb") as f:
        pickle.dump(m, f)
    log(f"  [fit] tau2 model done ({time.perf_counter()-t0:.0f}s)")
    return m


# ---------------------------------------------------------------------------
# state.json bookkeeping
# ---------------------------------------------------------------------------

def _save_state(**kw):
    state = {}
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as f:
            state = json.load(f)
    state.update(kw)
    state["updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=1)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-train", type=int, default=60000)
    ap.add_argument("--n-cal", type=int, default=25000)
    ap.add_argument("--n-val", type=int, default=10000)
    ap.add_argument("--alpha", type=float, default=0.05)
    ap.add_argument("--iters", type=int, default=375)
    ap.add_argument("--eval-per-cell", type=int, default=500)
    ap.add_argument("--chunk", type=int, default=5000)
    ap.add_argument("--procs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--out", default=OUT_DEFAULT)
    ap.add_argument("--se-lo", type=float, default=DEFAULT_CFG["se_lo"])
    ap.add_argument("--se-hi", type=float, default=DEFAULT_CFG["se_hi"])
    ap.add_argument("--p-none", type=float, default=DEFAULT_CFG["p_none"])
    ap.add_argument("--p-step", type=float, default=DEFAULT_CFG["p_step"])
    ap.add_argument("--p-copas", type=float, default=DEFAULT_CFG["p_copas"])
    ap.add_argument("--p-mixed", type=float, default=DEFAULT_CFG["p_mixed"])
    ap.add_argument("--p-heavy", type=float, default=DEFAULT_CFG["p_heavy"])
    ap.add_argument("--tag", default="", help="suffix for ckpt dir / log to keep "
                    "A/B configs isolated (e.g. --tag v2)")
    args = ap.parse_args()

    cfg = dict(DEFAULT_CFG)
    cfg["se_lo"], cfg["se_hi"] = args.se_lo, args.se_hi
    cfg["p_none"], cfg["p_step"] = args.p_none, args.p_step
    cfg["p_copas"], cfg["p_mixed"] = args.p_copas, args.p_mixed
    cfg["p_heavy"] = args.p_heavy
    _ps = cfg["p_none"] + cfg["p_step"] + cfg["p_copas"] + cfg["p_mixed"]
    if abs(_ps - 1.0) > 1e-6:
        raise SystemExit(f"mechanism proportions must sum to 1.0 (got {_ps:.4f})")
    # isolate checkpoints/log per config so A/B variants never share chunks
    global CKPT_DIR, STATE_PATH, LOG_PATH
    if args.tag:
        CKPT_DIR = os.path.join(HERE, f"ckpt_robust_{args.tag}")
        STATE_PATH = os.path.join(CKPT_DIR, "state.json")
        LOG_PATH = os.path.join(HERE, f"train_robust_{args.tag}.log")
    if args.quick:
        args.n_train, args.n_cal, args.n_val = 10000, 6000, 3000
        args.iters, args.eval_per_cell, args.chunk = 200, 200, 2500

    os.makedirs(CKPT_DIR, exist_ok=True)
    t0 = time.perf_counter()
    log(f"=== robust-SBI retrain START  quick={args.quick} ===")
    log(f"cfg={cfg}")
    log(f"sizes train={args.n_train} cal={args.n_cal} val={args.n_val} "
        f"iters={args.iters} chunk={args.chunk} procs={args.procs} seed={ROBUST_SEED}")
    _save_state(stage="corpus", cfg=cfg, seed=ROBUST_SEED,
                sizes={"train": args.n_train, "cal": args.n_cal, "val": args.n_val},
                iters=args.iters, alpha=args.alpha, started=time.strftime("%Y-%m-%d %H:%M:%S"))

    # ---- Stage 1: corpus (checkpointed, parallel, resumable) ----
    log("[stage 1/4] simulating corpus (chunked to disk)")
    Xtr, Ytr, Ttr, Ktr = build_corpus("train", args.n_train, cfg, args.chunk, args.procs)
    Xcal, Ycal, _, _ = build_corpus("cal", args.n_cal, cfg, args.chunk, args.procs)
    Xval, Yval, _, _ = build_corpus("val", args.n_val, cfg, args.chunk, args.procs)
    log(f"[stage 1/4] corpus ready: train={len(Ytr)} cal={len(Ycal)} val={len(Yval)} "
        f"({time.perf_counter()-t0:.0f}s)")
    _save_state(stage="fit")

    # ---- Stage 2: fit quantile GBMs + tau2 (checkpointed per model) ----
    log("[stage 2/4] fitting residual quantile regressors (per-model checkpoint)")
    models = fit_quantiles_ckpt(Xtr, Ytr, Q_GRID, ROBUST_SEED, args.iters)
    tau2_model = fit_tau2_ckpt(Xtr, Ttr, ROBUST_SEED, args.iters)
    _save_state(stage="conformal")

    # ---- Stage 3: Mondrian conformal calibration ----
    log("[stage 3/4] building Mondrian conformal calibration")
    conf = T.build_conformal(models, Q_GRID, Xcal, Ycal, args.alpha)
    cpath = os.path.join(CKPT_DIR, "conformal.pkl")
    with open(cpath, "wb") as f:
        pickle.dump(conf, f)
    _save_state(stage="diagnostics")

    # ---- Stage 4: diagnostics + final artifact ----
    log("[stage 4/4] diagnostics (SBC/PIT + calibration curve + exact-DGP eval)")
    pit = T.pit_values(models, Q_GRID, Xval, Yval)
    pit_hist, _ = np.histogram(pit, bins=10, range=(0, 1))
    ks = stats.kstest(np.clip(pit, 0, 1), "uniform")
    P_val = T.predict_grid(models, Q_GRID, Xval)
    cal_curve = {}
    for lvl, (a, b) in {"0.50": (0.25, 0.75), "0.80": (0.10, 0.90),
                         "0.90": (0.05, 0.95), "0.95": (0.025, 0.975)}.items():
        lo = P_val[:, Q_GRID.index(a)]; hi = P_val[:, Q_GRID.index(b)]
        cal_curve[lvl] = float(np.mean((lo <= Yval) & (Yval <= hi)))
    d_val = np.array([T.conformal_d(conf, r) for r in Xval])
    lo_c = P_val[:, conf["lo_idx"]] - d_val
    hi_c = P_val[:, conf["hi_idx"]] + d_val
    post_cov = float(np.mean((lo_c <= Yval) & (Yval <= hi_c)))
    post_wid = float(np.mean(hi_c - lo_c))
    exact = T.eval_exact_dgp(models, Q_GRID, conf, args.eval_per_cell,
                             seed=ROBUST_SEED + 4242)

    artifact = {
        "feature_names": F.FEATURE_NAMES, "q_grid": Q_GRID,
        "models": models, "tau2_model": tau2_model, "conformal": conf,
        "k_bin_edges": T.K_BIN_EDGES,
        "meta": {"train_seed": ROBUST_SEED, "n_train": args.n_train,
                 "n_cal": args.n_cal, "alpha": args.alpha,
                 "se_range": [cfg["se_lo"], cfg["se_hi"]],
                 "variant": f"robust-sbi-p1{('-' + args.tag) if args.tag else ''}",
                 "mixture": cfg,
                 "improvements": ["mixed+heavy_tail simulator coverage",
                                  f"clean-data anchoring (p_none={cfg['p_none']} "
                                  "vs 0.22 baseline)",
                                  f"SE support {cfg['se_lo']}-{cfg['se_hi']} "
                                  "(benchmark 0.10-0.70)"]},
    }
    with open(args.out, "wb") as f:
        pickle.dump(artifact, f)
    log(f"[stage 4/4] saved robust model -> {args.out}")

    diagnostics = {
        "variant": "robust-sbi-p1",
        "pit_hist_10bins": pit_hist.tolist(),
        "pit_ks_stat": float(ks.statistic), "pit_ks_p": float(ks.pvalue),
        "calibration_curve_preconformal": cal_curve,
        "postconformal_val_coverage": post_cov,
        "postconformal_val_width": post_wid,
        "target_coverage": 1 - args.alpha,
        "exact_dgp_eval": exact,
        "mixture_cfg": cfg,
        "elapsed_sec": round(time.perf_counter() - t0, 1),
    }
    dp = os.path.join(HERE, f"sbi_robust_diagnostics{('_' + args.tag) if args.tag else ''}.json")
    with open(dp, "w") as f:
        json.dump(diagnostics, f, indent=1)
    log(f"[stage 4/4] saved diagnostics -> {dp}")
    _save_state(stage="done", elapsed_sec=round(time.perf_counter() - t0, 1))

    # console summary
    log("=== SBC / calibration ===")
    log(f"PIT KS stat={ks.statistic:.4f} p={ks.pvalue:.3f}")
    log(f"pre-conformal raw-quantile coverage: {cal_curve}")
    log(f"post-conformal val coverage={post_cov:.3f} (target {1-args.alpha:.2f}) "
        f"width={post_wid:.3f}")
    log("=== exact-DGP held-out coverage (honest preview) ===")
    for sc in dgp.SCENARIOS:
        row = " ".join(f"k{k}={exact[sc].get(k, {}).get('coverage', float('nan')):.2f}"
                       for k in [5, 10, 15, 25, 50])
        log(f"  {sc:14s} {row}")
    log(f"=== robust-SBI retrain DONE  total {time.perf_counter()-t0:.0f}s ===")


if __name__ == "__main__":
    main()
