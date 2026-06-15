"""
worked_example.py -- one seeded known-truth network, scored by the NMA toolbox.
Deterministic (fixed seed); the printed numbers are reproducible and are the ones
quoted in the manuscript worked example. Run: python tools/worked_example.py

A dense 4-treatment network with well-separated true effects and genuine
between-study heterogeneity (tau2=0.15). We print, for one representative
contrast, the NaiveFE / RE / NetHK intervals (the FE-CI bug and its honest fix),
the recovered tau2, the honest-vs-naive inconsistency test, and the claimed
P(best) under the FE / RE / calibrated covariance (the ranking over-confidence).
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import dgp_nma as D
import methods_nma as M

SEED = 20260615
GEOM, T, SPE = "dense", 4, 5
TRUE_TAU2 = 0.15
Z975 = M.Z975


def main():
    rng = np.random.default_rng(SEED)
    studies, tr = D.generate(GEOM, T, SPE, TRUE_TAU2, 0.0, "none", rng, d_spread=0.6)
    fFE = M.fit_consistency(studies, T, re=False)
    fRE = M.fit_consistency(studies, T, re=True)
    hk = M.network_hk(fRE)

    print(f"Worked example  (seed={SEED}, geometry={GEOM}, T={T}, "
          f"studies/edge={SPE}, true tau2={TRUE_TAU2})")
    print(f"  N studies     = {fRE['N']}   true best treatment = {tr['best']}")
    print(f"  network DL tau2_hat (RE) = {fRE['tau2']:.4f}   "
          f"NetHK scaling H = {hk['H']:.3f}")
    print()

    # one representative contrast: best vs reference
    a, b = 0, int(tr["best"])
    true = tr["D"][a, b]
    print(f"Relative effect of treatment {b} vs reference {a}  (true = {true:.3f})")
    hdr = f"{'method':<10}{'estimate':>10}{'95% CI':>22}{'width':>9}{'covers?':>9}"
    print(hdr)
    rows = [
        ("NaiveFE", M.contrast_ci(fFE, a, b)),
        ("RE", M.contrast_ci(fRE, a, b)),
        ("NetHK", M.contrast_ci(fRE, a, b, Cov=hk["Cov"], crit=hk["crit"])),
    ]
    for name, (est, lo, hi, se) in rows:
        covers = "yes" if lo <= true <= hi else "NO"
        ci = f"[{lo:.3f}, {hi:.3f}]"
        print(f"{name:<10}{est:>10.3f}{ci:>22}{hi - lo:>9.3f}{covers:>9}")
    print()

    # inconsistency test
    th = M.inconsistency_test(studies, T, honest=True)
    tn = M.inconsistency_test(studies, T, honest=False)
    print("Global inconsistency test (design-by-treatment Q):")
    print(f"  honest (common-tau2 RE) : Q={th['Q']:.2f}  df={th['df']}  "
          f"p={th['p_value']:.3f}")
    print(f"  naive  (tau2 ignored)   : Q={tn['Q']:.2f}  df={tn['df']}  "
          f"p={tn['p_value']:.3f}")
    print()

    # ranking over-confidence under three covariance sources
    incons_infl = max(1.0, th["Q"] / th["df"]) if th["df"] > 0 else 1.0
    t_infl = (hk["crit"] / Z975) ** 2
    cal_cov = hk["Cov"] * t_infl * incons_infl
    print("Claimed P(point-best treatment is truly best):")
    for src, cov, dhat in (("FE", fFE["Cov"], fFE["dhat"]),
                           ("RE", fRE["Cov"], fRE["dhat"]),
                           ("Calibrated", cal_cov, fRE["dhat"])):
        r = M.ranking(dhat, cov, T, np.random.default_rng(SEED + 1))
        right = "yes" if r["best"] == tr["best"] else "NO"
        print(f"  {src:<11} P(best)={r['p_best_of_best']:.3f}   "
              f"point-best={r['best']} (correct? {right})")


if __name__ == "__main__":
    main()
