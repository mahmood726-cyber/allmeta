"""
worked_example.py -- one seeded known-truth DTA dataset, scored by the four
poolers of the summary operating point. Deterministic (fixed seed); the printed
numbers are reproducible and are the ones quoted in the manuscript worked example.
Run: python tools/worked_example.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import dgp_dta as D
import methods_dta as M

SEED = 20260615
SE0, SP0 = 0.85, 0.80
K, TAU, RHO, THRESH = 8, 0.5, -0.3, 0.3


def main():
    rng = np.random.default_rng(SEED)
    rows, tr = D.generate(K, SE0, SP0, TAU, TAU, RHO, THRESH, "none", rng)
    mu_true = np.array([tr["mu"][0], tr["mu_logit_fpr"]])

    fe = M.pool_univariate_fe(rows)
    dl = M.pool_univariate_dl(rows)
    bv = M.fit_bivariate(rows)
    hk = M.bivariate_hk(bv)

    print(f"Worked example (seed={SEED}, k={K}, true Se0={SE0}, Sp0={SP0}, "
          f"tau={TAU}, rho={RHO}, thresh={THRESH})")
    print(f"  threshold-effect Spearman = {M.threshold_spearman(rows):.3f}")
    print(f"  bivariate tau_Se_hat = {np.sqrt(max(bv['Sigma'][0,0],0)):.3f}  "
          f"tau_Sp/FPR_hat = {np.sqrt(max(bv['Sigma'][1,1],0)):.3f}  "
          f"recovered AUC = {M.hsroc_auc(bv):.3f}")
    hdr = (f"{'method':<11}{'Se est':>8}{'Se 95% CI':>20}{'Sp est':>8}"
           f"{'Sp 95% CI':>20}{'joint?':>8}")
    print(hdr)

    def row(name, mu, covMu, sens, spec, crit=M.Z975, r2=M.R95 ** 2):
        se_lo, se_hi = M.margin_ci(mu[0], covMu[0, 0], crit=crit)
        f_lo, f_hi = M.margin_ci(mu[1], covMu[1, 1], crit=crit)
        sp_lo, sp_hi = 1 - f_hi, 1 - f_lo
        jc = "yes" if M.covers_point_joint(mu, covMu, mu_true, r2=r2) else "NO"
        se_ci = f"[{se_lo:.3f},{se_hi:.3f}]"
        sp_ci = f"[{sp_lo:.3f},{sp_hi:.3f}]"
        print(f"{name:<11}{sens:>8.3f}{se_ci:>20}{spec:>8.3f}{sp_ci:>20}{jc:>8}")

    row("NaiveFE", fe["mu"], np.diag(fe["se"] ** 2), fe["sens"], fe["spec"])
    row("UnivDL", dl["mu"], np.diag(dl["se"] ** 2), dl["sens"], dl["spec"])
    row("Bivariate", bv["mu"], bv["covMu"], bv["sens"], bv["spec"])
    row("BivarHK", bv["mu"], hk["covMu"], bv["sens"], bv["spec"],
        crit=hk["crit"], r2=hk["r2_joint"])
    print(f"  true point: Se={SE0}, Sp={SP0}  "
          f"(logit Se={mu_true[0]:.3f}, logit FPR={mu_true[1]:.3f})")


if __name__ == "__main__":
    main()
