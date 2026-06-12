"""
features.py — Permutation-invariant summary statistics of a meta-analysis.

A meta-analysis is an UNORDERED set of (y_i, SE_i) pairs. Any amortized
estimator that consumes it must be invariant to study order. Rather than learn
a DeepSets embedding end-to-end (no autodiff backend is available here), we use
a *fixed, hand-designed* permutation-invariant feature map φ — exactly the
DeepSets construction with a fixed per-element encoder followed by symmetric
pooling. The features deliberately encode the FUNNEL/SELECTION geometry (Egger,
PET/PEESE intercepts, corr(y, SE), one-sided p-value bin masses, trim-fill gap)
because that geometry is the only observable signal of publication selection.

IMPORTANT: this module is the single source of truth for the feature vector.
Both the offline trainer (train_sbi.py) and the online estimator (sbi.py) import
FEATURE_NAMES / featurize from here so train/infer parity is guaranteed.
"""

import numpy as np
from scipy import stats
from scipy.special import ndtr

# Reuse the audited cheap kernels (DL pooling, trim-and-fill). These are fast;
# we deliberately avoid the expensive Vevea/Copas optimisers in the hot path.
import methods as M

FEATURE_NAMES = [
    "k", "sqrt_k", "inv_k",
    "fe_mu", "dl_mu", "dl_tau2", "i2", "Q_over_df",
    "mean_y", "median_y", "std_y", "iqr_y",
    "min_se", "max_se", "mean_se", "median_se", "std_se",
    "mean_log_se", "se_ratio", "weight_dominance",
    "egger_b0", "egger_t", "egger_slope",
    "pet_b0", "peese_b0",
    "corr_y_se", "corr_y_prec",
    "p_bin_lo", "p_bin_mid", "p_bin_hi", "frac_pos",
    "tf_k0", "tf_mu", "tf_gap",
    "resid_skew",
    "ptl_se_signal",
]

N_FEATURES = len(FEATURE_NAMES)


def _safe_corr(a, b):
    if len(a) < 3:
        return 0.0
    sa, sb = np.std(a), np.std(b)
    if sa < 1e-12 or sb < 1e-12:
        return 0.0
    c = np.corrcoef(a, b)[0, 1]
    return float(c) if np.isfinite(c) else 0.0


def featurize(y, v):
    """Return a length-N_FEATURES float vector of permutation-invariant stats.

    Robust to k as small as 3; never raises (returns finite numbers, with
    sensible neutral fallbacks for degenerate inputs).
    """
    y = np.asarray(y, float)
    v = np.asarray(v, float)
    k = len(y)
    se = np.sqrt(v)
    w = 1.0 / v
    sw = float(np.sum(w))

    fe_mu = float(np.sum(w * y) / sw)
    dl_tau2, Q = M._dl_tau2(y, v)
    wre = 1.0 / (v + dl_tau2)
    dl_mu = float(np.sum(wre * y) / np.sum(wre))
    df = max(1, k - 1)
    i2 = float(max(0.0, (Q - df) / Q)) if Q > 0 else 0.0
    Q_over_df = float(Q / df)

    mean_y = float(np.mean(y))
    median_y = float(np.median(y))
    std_y = float(np.std(y))
    iqr_y = float(np.subtract(*np.percentile(y, [75, 25]))) if k >= 4 else std_y

    min_se, max_se = float(se.min()), float(se.max())
    mean_se, median_se = float(se.mean()), float(np.median(se))
    std_se = float(se.std())
    mean_log_se = float(np.mean(np.log(se)))
    se_ratio = float(max_se / min_se) if min_se > 0 else 1.0
    weight_dominance = float(np.max(w) / sw)

    # Egger: standardised effect (y/se) regressed on precision (1/se).
    # Intercept = small-study/selection bias signal.
    x_prec = 1.0 / se
    y_std = y / se
    egger_b0 = egger_t = egger_slope = 0.0
    if k >= 3:
        n = k
        sx, sy = x_prec.sum(), y_std.sum()
        sxx, sxy = np.sum(x_prec * x_prec), np.sum(x_prec * y_std)
        det = n * sxx - sx * sx
        if abs(det) > 1e-12:
            b1 = (n * sxy - sx * sy) / det
            b0 = (sy - b1 * sx) / n
            resid = y_std - (b0 + b1 * x_prec)
            s2 = np.sum(resid ** 2) / (n - 2) if n > 2 else np.nan
            seb0 = np.sqrt(s2 * sxx / det) if np.isfinite(s2) and s2 > 0 else np.nan
            egger_b0 = float(b0)
            egger_slope = float(b1)
            egger_t = float(b0 / seb0) if np.isfinite(seb0) and seb0 > 0 else 0.0

    # PET (y ~ se) and PEESE (y ~ se^2) WLS intercepts (bias-corrected location).
    pb0, _, _, _ = M._wls(se, y, w)
    eb0, _, _, _ = M._wls(se * se, y, w)
    pet_b0 = float(pb0) if np.isfinite(pb0) else fe_mu
    peese_b0 = float(eb0) if np.isfinite(eb0) else fe_mu

    corr_y_se = _safe_corr(y, se)
    corr_y_prec = _safe_corr(y, x_prec)

    # One-sided p-value masses (favouring large positive effects) — the direct
    # fingerprint of p-step selection.
    p_one = 1.0 - ndtr(y / se)
    p_bin_lo = float(np.mean(p_one < 0.025))
    p_bin_mid = float(np.mean((p_one >= 0.025) & (p_one < 0.05)))
    p_bin_hi = float(np.mean(p_one >= 0.05))
    frac_pos = float(np.mean(y > 0))

    # Trim-and-fill: imputed missing-study count and the location shift it implies.
    try:
        tf = M.trim_fill(y, v)
        tf_k0 = float(tf.get("k0", 0))
        tf_mu = float(tf.get("mu", dl_mu))
    except Exception:
        tf_k0, tf_mu = 0.0, dl_mu
    tf_gap = float(fe_mu - tf_mu)

    # Skew of standardised residuals (asymmetry of the funnel about the pooled mean).
    z = (y - dl_mu) / np.sqrt(v + dl_tau2)
    resid_skew = float(stats.skew(z)) if k >= 3 and np.std(z) > 1e-12 else 0.0

    # Precision-tilt signal: covariance of (one-sided significance) with precision,
    # captures Copas latent (precision-driven) selection that p-bins miss.
    sig = (p_one < 0.05).astype(float)
    ptl_se_signal = _safe_corr(sig, x_prec)

    vec = np.array([
        k, np.sqrt(k), 1.0 / k,
        fe_mu, dl_mu, dl_tau2, i2, Q_over_df,
        mean_y, median_y, std_y, iqr_y,
        min_se, max_se, mean_se, median_se, std_se,
        mean_log_se, se_ratio, weight_dominance,
        egger_b0, egger_t, egger_slope,
        pet_b0, peese_b0,
        corr_y_se, corr_y_prec,
        p_bin_lo, p_bin_mid, p_bin_hi, frac_pos,
        tf_k0, tf_mu, tf_gap,
        resid_skew,
        ptl_se_signal,
    ], dtype=float)
    vec[~np.isfinite(vec)] = 0.0
    return vec


if __name__ == "__main__":
    import dgp
    rng = np.random.default_rng(0)
    y, v, _ = dgp.generate(0.3, 0.05, 15, "step_strong", rng)
    f = featurize(y, v)
    assert len(f) == N_FEATURES == len(FEATURE_NAMES)
    for name, val in zip(FEATURE_NAMES, f):
        print(f"{name:20s} {val:+.4f}")
