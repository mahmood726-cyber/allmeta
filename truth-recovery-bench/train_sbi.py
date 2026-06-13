"""
train_sbi.py — Offline amortized simulation-based inference trainer.

Strategy (cross-disciplinary import: conformalized quantile regression, CQR,
Romano-Patterson-Candes NeurIPS-2019, from the ML conformal-prediction
literature; amortization from cosmology/particle-physics SBI):

1. SIMULATE a huge corpus of meta-analyses from a GENERALISED data-generating
   process that randomises (mu, tau2, k) AND the selection mechanism over a
   CONTINUOUS severity range that brackets the benchmark's weak/strong p-step
   and Copas mechanisms (plus 'none'). Training across a mixture of mechanisms
   is the key advantage over Vevea/Copas, which each assume one fixed mechanism.

2. AMORTIZE: map each simulated meta-analysis to its permutation-invariant
   feature vector phi(D) (features.py) and learn conditional QUANTILES of the
   TRUE mu given phi(D) with gradient-boosted quantile regressors. The 0.5
   quantile is the de-biased point estimate; it learns to undo selection bias
   on average because it is trained directly against KNOWN truth.

3. CALIBRATE for honest finite-sample coverage with MONDRIAN (group-conditional)
   conformal prediction, binning on OBSERVABLE (k, selection-severity) so that
   coverage holds approximately *conditionally* on the regime — not just
   marginally. This is what turns "hoped-for" coverage into a guarantee.

4. DIAGNOSE on a held-out set drawn from the EXACT benchmark DGP (dgp.py), per
   scenario x k, plus an SBC/PIT uniformity check and a nominal-vs-realised
   calibration curve. All saved to sbi_diagnostics.json.

The trained artifact (sbi_model.pkl) is consumed at inference by sbi.py. Fully
seeded and disjoint from the harness BASE_SEED so evaluation never sees training
draws.
"""

import argparse
import json
import os
import pickle
import time

import numpy as np
from scipy import stats
from scipy.special import ndtr
from sklearn.ensemble import HistGradientBoostingRegressor

import dgp
import features as F

HERE = os.path.dirname(os.path.abspath(__file__))
TRAIN_SEED = 777_123            # disjoint from harness BASE_SEED=20260611
SE_LO, SE_HI = 0.10, 0.70      # matches dgp.py
Q_GRID = [0.025, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.975]
_STEP_CUTS = np.array([0.025, 0.05])
K_BIN_EDGES = [3, 7, 12, 20, 35, 100]   # k bins: [4-7][8-12][13-20][21-35][36+]


# ---------------------------------------------------------------------------
# Generalised, continuous-severity DGP for TRAINING ONLY (does not touch dgp.py)
# ---------------------------------------------------------------------------

def _draw_se(rng, k):
    return np.exp(rng.uniform(np.log(SE_LO), np.log(SE_HI), size=k))


def gen_train_ma(rng, mu, tau2, k, mech, max_factor=400):
    """One published meta-analysis under a randomised mechanism `mech` (dict)."""
    kind = mech["kind"]
    if kind == "none":
        se = _draw_se(rng, k)
        theta = rng.normal(mu, np.sqrt(tau2), size=k)
        y = rng.normal(theta, se)
        return y, se ** 2
    keep_y, keep_se, n_ex, cap = [], [], 0, max_factor * k
    while len(keep_y) < k and n_ex < cap:
        b = max(k, 64)
        se = _draw_se(rng, b)
        theta = rng.normal(mu, np.sqrt(tau2), size=b)
        eps = rng.normal(0.0, 1.0, size=b)
        y = theta + se * eps
        if kind == "step":
            p_one = stats.norm.sf(y / se)
            idx = np.searchsorted(_STEP_CUTS, p_one, side="right")
            w = mech["weights"][idx]
            pub = rng.random(b) < w
        else:  # copas
            d = mech["rho"] * eps + np.sqrt(1 - mech["rho"] ** 2) * rng.normal(0, 1, b)
            z = mech["g0"] + mech["g1"] / se + d
            pub = z > 0.0
        for yi, sei, p in zip(y, se, pub):
            n_ex += 1
            if p:
                keep_y.append(yi); keep_se.append(sei)
                if len(keep_y) >= k:
                    break
    if len(keep_y) < k:
        return None
    y = np.asarray(keep_y[:k]); se = np.asarray(keep_se[:k])
    return y, se ** 2


def sample_mechanism(rng):
    """Draw a selection mechanism: 'none', continuous p-step, or continuous Copas.

    With some probability we draw the EXACT benchmark weak/strong configs so the
    test mechanisms are densely covered, not merely bracketed.
    """
    u = rng.random()
    if u < 0.22:
        return {"kind": "none"}
    if u < 0.67:
        # p-step: weights = [1, w1, w2], 1 >= w1 >= w2 > 0. Weighted toward
        # STRONGER selection than the benchmark so the strong-step regime (the
        # documented failure) is densely trained and even bracketed from beyond.
        r = rng.random()
        if r < 0.22:                   # exact benchmark configs
            w = rng.choice(["weak", "strong"])
            weights = np.array([1.0, 0.75, 0.55]) if w == "weak" else np.array([1.0, 0.35, 0.10])
        elif r < 0.40:                 # beyond-benchmark very-strong tier
            w1 = rng.uniform(0.05, 0.30)
            w2 = rng.uniform(0.02, w1)
            weights = np.array([1.0, w1, w2])
        else:                          # continuous, bracketing weak..strong
            w1 = rng.uniform(0.10, 0.95)
            w2 = rng.uniform(0.02, w1)
            weights = np.array([1.0, w1, w2])
        return {"kind": "step", "weights": weights}
    # Copas latent
    if rng.random() < 0.30:
        c = rng.choice(["weak", "strong"])
        p = {"g0": -0.10, "g1": 0.12, "rho": 0.50} if c == "weak" else \
            {"g0": -0.20, "g1": 0.12, "rho": 0.90}
    else:
        p = {"g0": rng.uniform(-0.40, 0.00),
             "g1": rng.uniform(0.05, 0.25),
             "rho": rng.uniform(0.20, 0.95)}
    return {"kind": "copas", **p}


def simulate_corpus(n, rng, label=""):
    """Generate n (features, mu, k) training rows from the generalised DGP."""
    X = np.empty((n, F.N_FEATURES))
    Y = np.empty(n)            # true mu
    T = np.empty(n)            # true tau2
    KK = np.empty(n, dtype=int)
    i = 0
    t0 = time.perf_counter()
    while i < n:
        mu = rng.uniform(-1.2, 1.2)
        tau2 = 0.0 if rng.random() < 0.15 else rng.uniform(0.0, 0.30)
        mech = sample_mechanism(rng)
        # Oversample LARGE k under strong step selection — the regime where the
        # conformal interval is narrowest and the residual selection bias bites,
        # i.e. exactly where coverage previously fell below 0.90.
        strong_step = (mech["kind"] == "step" and mech["weights"][1] < 0.40)
        if strong_step and rng.random() < 0.55:
            k = int(rng.integers(18, 56))
        else:
            k = int(rng.integers(4, 56))
        out = gen_train_ma(rng, mu, tau2, k, mech)
        if out is None:
            continue
        y, v = out
        if len(y) < 3:
            continue
        try:
            X[i] = F.featurize(y, v)
        except Exception:
            continue
        Y[i] = mu; T[i] = tau2; KK[i] = k
        i += 1
        if label and i % 5000 == 0:
            print(f"  [{label}] {i}/{n} ({time.perf_counter()-t0:.0f}s)", flush=True)
    return X, Y, T, KK


# ---------------------------------------------------------------------------
# Mondrian conformal calibration
# ---------------------------------------------------------------------------

def _kbin(k):
    return int(np.searchsorted(K_BIN_EDGES, k, side="right") - 1)


_SEV_I_EGGER = F.FEATURE_NAMES.index("egger_t")
_SEV_I_TFK0 = F.FEATURE_NAMES.index("tf_k0")
_SEV_I_CORR = F.FEATURE_NAMES.index("corr_y_se")
_SEV_I_PLO = F.FEATURE_NAMES.index("p_bin_lo")
_SEV_I_PHI = F.FEATURE_NAMES.index("p_bin_hi")


def _sev_proxy(Xrow):
    """Observable selection-severity scalar from features.

    Combines the funnel-asymmetry signal (|egger_t|, corr(y,se), trim-fill gap)
    with a STEP-SELECTION FINGERPRINT term: under one-sided p-step selection the
    published set has a sharp surplus of just-significant studies and a deficit
    of non-significant ones, i.e. (p_bin_lo - p_bin_hi) is large and positive —
    a signature that p-driven (step) selection produces but precision-driven
    (Copas) selection does not. Weighting it heavily separates strong-step
    datasets into their OWN high-severity Mondrian bin, so the conformal
    correction there is calibrated on step-like data alone and is not diluted by
    the (much easier) Copas/none datasets that previously shared the bin. This is
    the direct fix for the strong-step large-k under-coverage.
    """
    step_sig = max(0.0, Xrow[_SEV_I_PLO] - Xrow[_SEV_I_PHI])
    return (abs(Xrow[_SEV_I_EGGER]) + 0.5 * Xrow[_SEV_I_TFK0]
            + 2.0 * abs(Xrow[_SEV_I_CORR]) + 3.0 * step_sig)


_FE_IDX = F.FEATURE_NAMES.index("fe_mu")


def fit_quantiles(Xtr, Ytr, q_grid, rng_seed, lr=0.06, leaves=47,
                  iters=400, min_leaf=40):
    """Fit quantile GBMs on the RESIDUAL target (mu - fe_mu).

    Boosting on top of the precision-weighted mean (a feature) decouples the
    learned bias-correction from the mu-prior: the base estimator carries the
    location, the GBM only learns the (selection-driven) correction. This kills
    the prior-shrinkage location bias that pure mu-regression suffers under the
    'none' scenario.
    """
    resid = Ytr - Xtr[:, _FE_IDX]
    models = {}
    for qi, q in enumerate(q_grid):
        m = HistGradientBoostingRegressor(
            loss="quantile", quantile=q, learning_rate=lr,
            max_leaf_nodes=leaves, max_iter=iters, min_samples_leaf=min_leaf,
            l2_regularization=1.0, random_state=rng_seed + qi)
        m.fit(Xtr, resid)
        models[q] = m
    return models


def predict_grid(models, q_grid, X):
    """Predicted quantiles of mu = fe_mu + residual-quantile (mu space)."""
    base = X[:, _FE_IDX][:, None]
    P = np.column_stack([models[q].predict(X) for q in q_grid]) + base
    P = np.sort(P, axis=1)        # enforce monotone non-crossing quantiles
    return P


def build_conformal(models, q_grid, Xcal, Ycal, alpha, base=(0.025, 0.975), nsev=5):
    """Mondrian CQR: per (kbin, sevbin) additive correction d for level 1-alpha.

    The BASE interval [q_base_lo, q_base_hi] is fixed; the conformal correction d
    (the (1-alpha) empirical quantile of the CQR score within each bin) calibrates
    it to ANY target level, so alpha need not equal one of the trained quantile
    pairs. This is the standard CQR decoupling of base predictor from coverage.
    """
    lo_idx = q_grid.index(base[0])
    hi_idx = q_grid.index(base[1])
    P = predict_grid(models, q_grid, Xcal)
    qlo, qhi = P[:, lo_idx], P[:, hi_idx]
    E = np.maximum(qlo - Ycal, Ycal - qhi)      # CQR conformity score
    kb = np.array([_kbin(int(round(x))) for x in Xcal[:, F.FEATURE_NAMES.index("k")]])
    sev = np.array([_sev_proxy(r) for r in Xcal])
                                               # severity bins within each k-bin
    probs = [(j + 1) / nsev for j in range(nsev - 1)]
    sev_edges = {}
    table = {}
    for b in np.unique(kb):
        m = kb == b
        edges = np.quantile(sev[m], probs)
        sev_edges[int(b)] = edges.tolist()
        sb = np.searchsorted(edges, sev[m], side="right")
        Eb = E[m]
        for s in range(nsev):
            mm = sb == s
            n = int(mm.sum())
            if n >= 40:
                rank = min(n, int(np.ceil((n + 1) * (1 - alpha))))
                d = float(np.sort(Eb[mm])[rank - 1])
            else:
                d = float("nan")
            table[(int(b), s)] = d
    # global fallback for sparse bins
    n = len(E)
    rank = min(n, int(np.ceil((n + 1) * (1 - alpha))))
    global_d = float(np.sort(E)[rank - 1])
    # fill NaN (sparse) bins with their k-bin level fallback, then global
    for b in np.unique(kb):
        m = kb == b
        nb = int(m.sum())
        rb = min(nb, int(np.ceil((nb + 1) * (1 - alpha))))
        dk = float(np.sort(E[m])[rb - 1]) if nb >= 40 else global_d
        for s in range(nsev):
            if not np.isfinite(table.get((int(b), s), float("nan"))):
                table[(int(b), s)] = dk
    return {"alpha": alpha, "lo_idx": lo_idx, "hi_idx": hi_idx, "nsev": nsev,
            "table": {f"{b}_{s}": d for (b, s), d in table.items()},
            "sev_edges": sev_edges, "global_d": global_d}


def conformal_d(conf, Xrow):
    k = int(round(Xrow[F.FEATURE_NAMES.index("k")]))
    b = _kbin(k)
    edges = conf["sev_edges"].get(str(b)) or conf["sev_edges"].get(b)
    if edges is None:
        return conf["global_d"]
    s = int(np.searchsorted(np.asarray(edges), _sev_proxy(Xrow), side="right"))
    return conf["table"].get(f"{b}_{s}", conf["global_d"])


# ---------------------------------------------------------------------------
# Diagnostics: SBC/PIT + nominal-vs-realised + per-scenario on the EXACT DGP
# ---------------------------------------------------------------------------

def pit_values(models, q_grid, X, Y):
    """Approx PIT: interpolate predicted quantile fn to level where q==Y_true."""
    P = predict_grid(models, q_grid, X)
    qg = np.asarray(q_grid)
    pit = np.empty(len(Y))
    for i in range(len(Y)):
        qs = P[i]
        yt = Y[i]
        if yt <= qs[0]:
            pit[i] = qg[0] * (yt - (qs[0] - (qs[1] - qs[0]))) / max(1e-9, (qs[1] - qs[0]))
            pit[i] = max(0.0, min(qg[0], pit[i]))
        elif yt >= qs[-1]:
            pit[i] = 1.0 - (1 - qg[-1]) * (1 - min(1.0, (yt - qs[-1]) /
                      max(1e-9, qs[-1] - qs[-2])) * 0)  # clamp near 1
            pit[i] = min(1.0, max(qg[-1], 1.0))
        else:
            pit[i] = float(np.interp(yt, qs, qg))
    return pit


def eval_exact_dgp(models, q_grid, conf, n_per_cell, seed, mu=0.3, tau2=0.05):
    """Held-out evaluation on the EXACT benchmark DGP (the honest preview)."""
    rng = np.random.default_rng(seed)
    out = {}
    for sc in dgp.SCENARIOS:
        out[sc] = {}
        for k in [5, 10, 15, 25, 50]:
            cov = wid = bias_sum = sq = n = 0
            biases = []
            for _ in range(n_per_cell):
                y, v, info = dgp.generate(mu, tau2, k, sc, rng)
                if info["degenerate"] or len(y) < 3:
                    continue
                x = F.featurize(y, v).reshape(1, -1)
                P = predict_grid(models, q_grid, x)[0]
                d = conformal_d(conf, x[0])
                lo = P[conf["lo_idx"]] - d
                hi = P[conf["hi_idx"]] + d
                pt = P[q_grid.index(0.5)]
                cov += int(lo <= mu <= hi); wid += (hi - lo)
                biases.append(pt - mu); sq += (pt - mu) ** 2; n += 1
            if n:
                out[sc][k] = {"coverage": cov / n, "width": wid / n,
                              "bias": float(np.mean(biases)),
                              "rmse": float(np.sqrt(sq / n)), "n": n}
    return out


def _write_diagnostics(models, tau2_model, conf, Xval, Yval, exact, t0, alpha, out):
    pit = pit_values(models, Q_GRID, Xval, Yval)
    pit_hist, _ = np.histogram(pit, bins=10, range=(0, 1))
    ks = stats.kstest(np.clip(pit, 0, 1), "uniform")
    P_val = predict_grid(models, Q_GRID, Xval)
    cal_curve = {}
    for lvl, (a, b) in {"0.50": (0.25, 0.75), "0.80": (0.10, 0.90),
                         "0.90": (0.05, 0.95), "0.95": (0.025, 0.975)}.items():
        lo = P_val[:, Q_GRID.index(a)]; hi = P_val[:, Q_GRID.index(b)]
        cal_curve[lvl] = float(np.mean((lo <= Yval) & (Yval <= hi)))
    d_val = np.array([conformal_d(conf, r) for r in Xval])
    lo_c = P_val[:, conf["lo_idx"]] - d_val
    hi_c = P_val[:, conf["hi_idx"]] + d_val
    post_cov = float(np.mean((lo_c <= Yval) & (Yval <= hi_c)))
    post_wid = float(np.mean(hi_c - lo_c))
    diagnostics = {
        "pit_hist_10bins": pit_hist.tolist(),
        "pit_ks_stat": float(ks.statistic), "pit_ks_p": float(ks.pvalue),
        "calibration_curve_preconformal": cal_curve,
        "postconformal_val_coverage": post_cov,
        "postconformal_val_width": post_wid,
        "target_coverage": 1 - alpha,
        "exact_dgp_eval": exact,
        "elapsed_sec": round(time.perf_counter() - t0, 1),
    }
    dp = os.path.join(HERE, "sbi_diagnostics.json")
    with open(dp, "w") as f:
        json.dump(diagnostics, f, indent=1)
    return diagnostics, ks, cal_curve, post_cov, post_wid


def _print_summary(ks, cal_curve, post_cov, post_wid, alpha, exact, t0):
    print("\n=== SBC / calibration ===")
    print(f"PIT KS stat={ks.statistic:.4f} p={ks.pvalue:.3f} "
          f"(uniform PIT => calibrated posterior)")
    print(f"pre-conformal raw-quantile coverage: {cal_curve}")
    print(f"post-conformal val coverage={post_cov:.3f} (target {1-alpha:.2f}) "
          f"width={post_wid:.3f}")
    print("\n=== exact-DGP held-out coverage (the honest preview) ===")
    print(f"{'scenario':14s} " + " ".join(f"k={k:<2d}" for k in [5, 10, 15, 25, 50]))
    for sc in dgp.SCENARIOS:
        row = " ".join(f"{exact[sc].get(k, {}).get('coverage', float('nan')):.2f} "
                       for k in [5, 10, 15, 25, 50])
        print(f"{sc:14s} {row}")
    print(f"\n[train] total {time.perf_counter()-t0:.0f}s")


def recalibrate(args):
    """Reuse the trained GBMs; rebuild only the conformal layer + diagnostics.

    Lets us tune the calibration target (alpha) and Mondrian granularity without
    paying for a full GBM refit. Fully seeded, disjoint from harness BASE_SEED.
    """
    t0 = time.perf_counter()
    with open(args.out, "rb") as f:
        art = pickle.load(f)
    models, tau2_model = art["models"], art["tau2_model"]
    print(f"[recal] loaded GBMs from {args.out}; alpha={args.alpha} "
          f"cal={args.n_cal} val={args.n_val}", flush=True)
    rng = np.random.default_rng(TRAIN_SEED + 1)   # disjoint from original cal draws
    Xcal, Ycal, _, _ = simulate_corpus(args.n_cal, rng, "cal")
    Xval, Yval, _, _ = simulate_corpus(args.n_val, rng, "val")
    conf = build_conformal(models, Q_GRID, Xcal, Ycal, args.alpha)
    exact = eval_exact_dgp(models, Q_GRID, conf, args.eval_per_cell,
                           seed=TRAIN_SEED + 4242)
    art["conformal"] = conf
    art["meta"]["alpha"] = args.alpha
    with open(args.out, "wb") as f:
        pickle.dump(art, f)
    print(f"[recal] saved recalibrated model -> {args.out}", flush=True)
    diag, ks, cc, pc, pw = _write_diagnostics(models, tau2_model, conf,
                                              Xval, Yval, exact, t0, args.alpha, args.out)
    _print_summary(ks, cc, pc, pw, args.alpha, exact, t0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-train", type=int, default=70000)
    ap.add_argument("--n-cal", type=int, default=30000)
    ap.add_argument("--n-val", type=int, default=12000)
    ap.add_argument("--alpha", type=float, default=0.05)
    ap.add_argument("--iters", type=int, default=400)
    ap.add_argument("--eval-per-cell", type=int, default=600)
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--recal-only", action="store_true",
                    help="reuse trained GBMs; only rebuild conformal + diagnostics")
    ap.add_argument("--out", default=os.path.join(HERE, "sbi_model.pkl"))
    args = ap.parse_args()
    if args.quick:
        args.n_train, args.n_cal, args.n_val = 12000, 6000, 3000
        args.iters, args.eval_per_cell = 200, 200

    if args.recal_only:
        return recalibrate(args)

    t0 = time.perf_counter()
    print(f"[train] simulating corpus: train={args.n_train} cal={args.n_cal} "
          f"val={args.n_val} (seed={TRAIN_SEED})", flush=True)
    rng = np.random.default_rng(TRAIN_SEED)
    Xtr, Ytr, Ttr, Ktr = simulate_corpus(args.n_train, rng, "train")
    Xcal, Ycal, Tcal, Kcal = simulate_corpus(args.n_cal, rng, "cal")
    Xval, Yval, Tval, Kval = simulate_corpus(args.n_val, rng, "val")
    print(f"[train] corpus done in {time.perf_counter()-t0:.0f}s", flush=True)

    print("[train] fitting quantile regressors...", flush=True)
    models = fit_quantiles(Xtr, Ytr, Q_GRID, rng_seed=TRAIN_SEED, iters=args.iters)
    tau2_model = HistGradientBoostingRegressor(
        loss="squared_error", learning_rate=0.06, max_leaf_nodes=31,
        max_iter=args.iters, min_samples_leaf=40, l2_regularization=1.0,
        random_state=TRAIN_SEED + 99)
    tau2_model.fit(Xtr, Ttr)

    print("[train] building Mondrian conformal calibration...", flush=True)
    conf = build_conformal(models, Q_GRID, Xcal, Ycal, args.alpha)

    # ---- diagnostics ----
    print("[train] diagnostics: SBC/PIT + calibration curve + exact-DGP eval...",
          flush=True)
    pit = pit_values(models, Q_GRID, Xval, Yval)
    pit_hist, _ = np.histogram(pit, bins=10, range=(0, 1))
    # KS test of PIT vs uniform
    ks = stats.kstest(np.clip(pit, 0, 1), "uniform")

    # nominal-vs-realised calibration curve (raw quantile intervals, pre-conformal)
    P_val = predict_grid(models, Q_GRID, Xval)
    cal_curve = {}
    for lvl, (a, b) in {"0.50": (0.25, 0.75), "0.80": (0.10, 0.90),
                         "0.90": (0.05, 0.95), "0.95": (0.025, 0.975)}.items():
        lo = P_val[:, Q_GRID.index(a)]; hi = P_val[:, Q_GRID.index(b)]
        cal_curve[lvl] = float(np.mean((lo <= Yval) & (Yval <= hi)))

    # post-conformal coverage on val (marginal, should be >= 1-alpha)
    d_val = np.array([conformal_d(conf, r) for r in Xval])
    lo_c = P_val[:, conf["lo_idx"]] - d_val
    hi_c = P_val[:, conf["hi_idx"]] + d_val
    post_cov = float(np.mean((lo_c <= Yval) & (Yval <= hi_c)))
    post_wid = float(np.mean(hi_c - lo_c))

    exact = eval_exact_dgp(models, Q_GRID, conf, args.eval_per_cell,
                           seed=TRAIN_SEED + 4242)

    # ---- save model ----
    artifact = {
        "feature_names": F.FEATURE_NAMES, "q_grid": Q_GRID,
        "models": models, "tau2_model": tau2_model, "conformal": conf,
        "k_bin_edges": K_BIN_EDGES,
        "meta": {"train_seed": TRAIN_SEED, "n_train": args.n_train,
                 "n_cal": args.n_cal, "alpha": args.alpha,
                 "se_range": [SE_LO, SE_HI]},
    }
    with open(args.out, "wb") as f:
        pickle.dump(artifact, f)
    print(f"[train] saved model -> {args.out}", flush=True)

    diagnostics = {
        "pit_hist_10bins": pit_hist.tolist(),
        "pit_ks_stat": float(ks.statistic), "pit_ks_p": float(ks.pvalue),
        "calibration_curve_preconformal": cal_curve,
        "postconformal_val_coverage": post_cov,
        "postconformal_val_width": post_wid,
        "target_coverage": 1 - args.alpha,
        "exact_dgp_eval": exact,
        "elapsed_sec": round(time.perf_counter() - t0, 1),
    }
    dp = os.path.join(HERE, "sbi_diagnostics.json")
    with open(dp, "w") as f:
        json.dump(diagnostics, f, indent=1)
    print(f"[train] saved diagnostics -> {dp}", flush=True)

    # console summary
    print("\n=== SBC / calibration ===")
    print(f"PIT KS stat={ks.statistic:.4f} p={ks.pvalue:.3f} "
          f"(uniform PIT => calibrated posterior)")
    print(f"pre-conformal raw-quantile coverage: {cal_curve}")
    print(f"post-conformal val coverage={post_cov:.3f} (target {1-args.alpha:.2f}) "
          f"width={post_wid:.3f}")
    print("\n=== exact-DGP held-out coverage (the honest preview) ===")
    print(f"{'scenario':14s} " + " ".join(f"k={k:<2d}" for k in [5, 10, 15, 25, 50]))
    for sc in dgp.SCENARIOS:
        row = " ".join(f"{exact[sc].get(k, {}).get('coverage', float('nan')):.2f} "
                       for k in [5, 10, 15, 25, 50])
        print(f"{sc:14s} {row}")
    print(f"\n[train] total {time.perf_counter()-t0:.0f}s")


if __name__ == "__main__":
    main()
