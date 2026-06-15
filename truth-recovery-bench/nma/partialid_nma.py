"""
partialid_nma.py -- Partial-identification bounds for under-determined networks.

The consistency-model relative effect d_ab is point-identified ONLY under the
(often untestable) consistency assumption. When the network actually carries loop
inconsistency, the consistency estimate is biased for d_ab and its CI
under-covers -- exactly what the harness shows on incons>0 cells. The honest
object is then a Manski-style partial-identification interval that hedges against
the *plausible amount* of unmodelled inconsistency, sized from the data itself.

  PartialID interval(a,b) = NetHK CI(a,b)  widened by  +/- c * omega_hat

where omega_hat is the inconsistency standard deviation estimated from the global
design-by-treatment statistic:

  omega2_hat = max(0, Q_inc - df_inc) / sum(W_RE)          (effect-scale variance)

So when no inconsistency is detected (Q_inc <= df_inc) the bound collapses to the
ordinary NetHK CI -- no width cost. When inconsistency is present it widens to
restore honest coverage of the consistency truth. This is the NMA analogue of the
impossible-ma / PartialID pairwise bound, and is measured (not asserted) against
the plain RE and NetHK intervals across a ladder of true inconsistency.

Honest scope: this targets the CONSISTENCY estimand d_ab (the network-pooled
relative effect). It does not claim to recover an individual loop's *direct*
effect when that is the estimand -- de-confounding direction matters there, as in
targettrialma.
"""
from __future__ import annotations

import numpy as np

import dgp_nma as D
import methods_nma as M


def omega_hat(studies, T):
    """Data-driven inconsistency SD (effect scale) from the honest global test."""
    th = M.inconsistency_test(studies, T, honest=True)
    if not th["testable"] or th["df"] <= 0:
        return 0.0
    X, y, v = M.design(studies, T)
    W = 1.0 / (v + th.get("tau2", 0.0))
    excess = max(0.0, th["Q"] - th["df"])
    omega2 = excess / float(np.sum(W))
    return float(np.sqrt(max(0.0, omega2)))


def partial_id_interval(fit, studies, a, b, c=2.0):
    """NetHK CI for contrast (a,b) widened by +/- c*omega_hat. Returns (est,lo,hi)."""
    T = fit["T"]
    hk = M.network_hk(fit)
    est, lo, hi, se = M.contrast_ci(fit, a, b, Cov=hk["Cov"], crit=hk["crit"])
    om = omega_hat(studies, T)
    return est, lo - c * om, hi + c * om, om


# ---------------------------------------------------------------------------
# Measured experiment
# ---------------------------------------------------------------------------
def run_experiment(reps=600, c=2.0, seed=20260615):
    """Coverage of the consistency truth d_ab and interval width for RE / NetHK /
    PartialID, across a ladder of TRUE inconsistency, on loop and dense networks;
    plus the indirect-only width cost on a star network (truly consistent)."""
    import hashlib

    def _h(s):
        return int.from_bytes(hashlib.sha256(s.encode()).digest()[:4], "big")

    out = {"c": c, "reps": reps, "loop_dense": [], "star": []}

    for (geom, T) in (("loop", 3), ("dense", 4)):
        for incons in (0.0, 0.1, 0.2, 0.4):
            cid = f"{geom}_inc{incons}"
            ss = np.random.SeedSequence([seed, _h(cid)]).spawn(reps)
            cov = {"RE": [], "NetHK": [], "PartialID": []}
            wid = {"RE": [], "NetHK": [], "PartialID": []}
            for rep in range(reps):
                rng = np.random.default_rng(ss[rep])
                studies, tr = D.generate(geom, T, 5, 0.05, incons, "none", rng)
                fit = M.fit_consistency(studies, T, re=True)
                hk = M.network_hk(fit)
                for a in range(T):
                    for b in range(a + 1, T):
                        true = tr["D"][a, b]                 # consistency truth
                        e, lo, hi, se = M.contrast_ci(fit, a, b)
                        cov["RE"].append(lo <= true <= hi); wid["RE"].append(hi - lo)
                        e, lo, hi, se = M.contrast_ci(fit, a, b, Cov=hk["Cov"], crit=hk["crit"])
                        cov["NetHK"].append(lo <= true <= hi); wid["NetHK"].append(hi - lo)
                        e, lo, hi, om = partial_id_interval(fit, studies, a, b, c=c)
                        cov["PartialID"].append(lo <= true <= hi); wid["PartialID"].append(hi - lo)
            out["loop_dense"].append({
                "geometry": geom, "incons": incons,
                "coverage": {k: float(np.mean(v)) for k, v in cov.items()},
                "width": {k: float(np.mean(v)) for k, v in wid.items()}})

    # star: contrast (1,2) is indirect-only and TRULY consistent (no loops).
    ss = np.random.SeedSequence([seed, _h("star_indirect")]).spawn(reps)
    cov = {"RE": [], "NetHK": [], "PartialID": []}
    wid = {"RE": [], "NetHK": [], "PartialID": []}
    for rep in range(reps):
        rng = np.random.default_rng(ss[rep])
        studies, tr = D.generate("star", 4, 5, 0.10, 0.0, "none", rng)
        fit = M.fit_consistency(studies, 4, re=True)
        hk = M.network_hk(fit)
        a, b = 1, 2
        true = tr["D"][a, b]
        e, lo, hi, se = M.contrast_ci(fit, a, b)
        cov["RE"].append(lo <= true <= hi); wid["RE"].append(hi - lo)
        e, lo, hi, se = M.contrast_ci(fit, a, b, Cov=hk["Cov"], crit=hk["crit"])
        cov["NetHK"].append(lo <= true <= hi); wid["NetHK"].append(hi - lo)
        e, lo, hi, om = partial_id_interval(fit, studies, a, b, c=c)
        cov["PartialID"].append(lo <= true <= hi); wid["PartialID"].append(hi - lo)
    out["star"] = {"contrast": "1v2 (indirect-only, truly consistent)",
                   "coverage": {k: float(np.mean(v)) for k, v in cov.items()},
                   "width": {k: float(np.mean(v)) for k, v in wid.items()}}
    return out


if __name__ == "__main__":
    import json
    import os
    res = run_experiment()
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results_partialid.json")
    json.dump(res, open(p, "w"), indent=1)
    print(json.dumps(res, indent=1))
