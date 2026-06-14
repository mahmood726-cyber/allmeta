"""
dgp.py — Known-truth data-generating process with parameterised publication
selection on top of known mu and tau^2.

A "meta-analysis" is the set of PUBLISHED studies an analyst observes. We
generate studies from the true random-effects model and apply a selection
mechanism, oversampling until the target observed count k is reached. This
makes k the number of *published* studies (what a real reviewer sees) while
the true mu is the unconditional population mean a method must recover.

Mechanisms
----------
none        : no selection (pure heterogeneity baseline)
step_weak   : Vevea-Hedges one-sided p-value step weights, mild
step_strong : same, severe
copas_weak  : Copas latent-variable selection, mild effect/selection corr
copas_strong: same, strong corr

All draws come from an explicit numpy Generator (seeded) -> fully reproducible.
"""

import numpy as np
from scipy import stats

# One-sided p-value cutpoints (favouring large POSITIVE effects) and the
# publication weight applied to each interval [0,c1), [c1,c2), [c2,1].
_STEP_CUTS = np.array([0.025, 0.05])
_STEP_WEIGHTS = {
    "weak":    np.array([1.0, 0.75, 0.55]),
    "strong":  np.array([1.0, 0.35, 0.10]),
    "vstrong": np.array([1.0, 0.12, 0.03]),   # stress: near-total suppression
}
# Copas latent selection z = g0 + g1/se + d ;  publish if z>0.
# Effect-driven latent selection (small g1 keeps the directional rho-bias from
# being diluted by pure precision-selection). Tuned so the naive pooled bias is
# a meaningful distortion (~+0.04 weak, ~+0.08 strong at mu=0.3, tau2=0.05).
_COPAS = {
    "weak":    {"g0": -0.10, "g1": 0.12, "rho": 0.50},
    "strong":  {"g0": -0.20, "g1": 0.12, "rho": 0.90},
    "vstrong": {"g0": -0.50, "g1": 0.12, "rho": 0.95},  # stress
}

SCENARIOS = ["none", "step_weak", "step_strong", "copas_weak", "copas_strong"]

# ---- Harder stress scenarios (goal 3) ------------------------------------
# These deliberately break assumptions every method (and the NPE training DGP)
# relies on, so they are an out-of-distribution robustness probe:
#   step_vstrong  : near-total suppression of non-significant studies (worst-case
#                   one-sided p-step; the strong-step pathology taken to extreme).
#   copas_vstrong : extreme precision/effect-correlated Copas selection.
#   mixed_strong  : MISSPECIFIED mechanism — a study is published only if it
#                   passes BOTH a strong p-step weight AND a strong Copas latent
#                   gate. Matches neither pure-step nor pure-Copas models.
#   heavy_tail    : Student-t(3) random effects (variance-matched to tau2) under
#                   strong p-step selection — violates the Normal-RE assumption
#                   shared by every estimator here.
STRESS_SCENARIOS = ["step_vstrong", "copas_vstrong", "mixed_strong", "heavy_tail"]
_HEAVY_TAIL_DF = 3


def _draw_se(rng, k, se_lo, se_hi):
    """Log-uniform standard errors -> a realistic spread of study precisions."""
    return np.exp(rng.uniform(np.log(se_lo), np.log(se_hi), size=k))


def _step_weight(p_one, cuts, weights):
    idx = np.searchsorted(cuts, p_one, side="right")
    return weights[idx]


def generate(mu, tau2, k, scenario, rng, se_lo=0.10, se_hi=0.70,
             max_factor=400):
    """Return (y, v, info) for one published meta-analysis of observed size k.

    info: dict(n_generated, n_published_kept=k, sel_frac, degenerate)
    """
    if scenario == "none":
        se = _draw_se(rng, k, se_lo, se_hi)
        theta = rng.normal(mu, np.sqrt(tau2), size=k)
        y = rng.normal(theta, se)
        return y, se ** 2, {"n_generated": k, "k": k, "sel_frac": 1.0,
                            "degenerate": False}

    # --- mechanism dispatch (original 5 scenarios keep byte-identical paths) --
    # heavy_tail / mixed_strong / *_vstrong are stress add-ons (goal 3).
    heavy_tail = (scenario == "heavy_tail")
    mixed = (scenario == "mixed_strong")
    if scenario in ("step_weak", "step_strong"):
        mech = "step"; weights = _STEP_WEIGHTS["weak" if scenario.endswith("weak") else "strong"]
    elif scenario in ("copas_weak", "copas_strong"):
        mech = "copas"; cp = _COPAS["weak" if scenario.endswith("weak") else "strong"]
    elif scenario == "step_vstrong":
        mech = "step"; weights = _STEP_WEIGHTS["vstrong"]
    elif scenario == "copas_vstrong":
        mech = "copas"; cp = _COPAS["vstrong"]
    elif scenario == "heavy_tail":
        mech = "step"; weights = _STEP_WEIGHTS["strong"]
    elif scenario == "mixed_strong":
        mech = "mixed"; weights = _STEP_WEIGHTS["strong"]; cp = _COPAS["strong"]
    else:
        raise ValueError(f"unknown scenario {scenario!r}")

    keep_y, keep_se = [], []
    n_examined = 0          # number of generated studies actually inspected
    cap = max_factor * k
    while len(keep_y) < k and n_examined < cap:
        # generate a modest batch for efficiency
        b = max(k, 64)
        se = _draw_se(rng, b, se_lo, se_hi)
        if heavy_tail:
            # Student-t(df) random effects, scaled to variance tau2.
            scale = np.sqrt(tau2 * (_HEAVY_TAIL_DF - 2) / _HEAVY_TAIL_DF) if tau2 > 0 else 0.0
            theta = mu + scale * rng.standard_t(_HEAVY_TAIL_DF, size=b)
        else:
            theta = rng.normal(mu, np.sqrt(tau2), size=b)
        eps = rng.normal(0.0, 1.0, size=b)
        y = theta + se * eps
        if mech == "step":
            p_one = stats.norm.sf(y / se)              # one-sided p
            w = _step_weight(p_one, _STEP_CUTS, weights)
            published = rng.random(b) < w
        elif mech == "copas":
            d = cp["rho"] * eps + np.sqrt(1 - cp["rho"] ** 2) * rng.normal(0, 1, size=b)
            z = cp["g0"] + cp["g1"] / se + d
            published = z > 0.0
        else:  # mixed: must pass BOTH a strong p-step weight AND a Copas gate
            p_one = stats.norm.sf(y / se)
            w = _step_weight(p_one, _STEP_CUTS, weights)
            pass_step = rng.random(b) < w
            d = cp["rho"] * eps + np.sqrt(1 - cp["rho"] ** 2) * rng.normal(0, 1, size=b)
            z = cp["g0"] + cp["g1"] / se + d
            published = pass_step & (z > 0.0)
        for yi, sei, pub in zip(y, se, published):
            n_examined += 1
            if pub:
                keep_y.append(yi)
                keep_se.append(sei)
                if len(keep_y) >= k:
                    break
    degenerate = len(keep_y) < k
    y = np.asarray(keep_y[:k], float)
    se = np.asarray(keep_se[:k], float)
    sel_frac = len(y) / n_examined if n_examined > 0 else np.nan
    return y, se ** 2, {"n_generated": n_examined, "k": len(y),
                        "sel_frac": sel_frac, "degenerate": degenerate}


def selection_bias_demo(mu=0.3, tau2=0.05, k=20, scenario="step_strong",
                        seed=0, n=2000):
    """Empirical mean of the naive FE estimate under a scenario (diagnostic)."""
    rng = np.random.default_rng(seed)
    naive = []
    for _ in range(n):
        y, v, info = generate(mu, tau2, k, scenario, rng)
        if info["degenerate"]:
            continue
        w = 1.0 / v
        naive.append(float(np.sum(w * y) / np.sum(w)))
    naive = np.array(naive)
    return {"scenario": scenario, "true_mu": mu,
            "naive_fe_mean": float(naive.mean()),
            "naive_bias": float(naive.mean() - mu),
            "mean_sel_frac": None, "n": len(naive)}


if __name__ == "__main__":
    for sc in SCENARIOS:
        print(selection_bias_demo(scenario=sc, n=800))
