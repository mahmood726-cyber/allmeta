"""
worked_example.py -- one seeded known-truth dose-response dataset, scored by the
four poolers. Deterministic (fixed seed); the printed numbers are reproducible and
are the ones quoted in the manuscript worked example. Run: python tools/worked_example.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import dgp_dose as D
import methods_dose as M

SEED = 20260615
TRUE_BETA, TRUE_TAU2, K = 0.30, 0.15, 10


def main():
    rng = np.random.default_rng(SEED)
    studies, tr = D.generate(K, TRUE_BETA, 0.0, TRUE_TAU2, "linear", "none", rng)
    betas, vars_ = [], []
    for st in studies:
        b, v = M.stage1_linear(st)
        betas.append(b)
        vars_.append(v)
    betas, vars_ = np.array(betas), np.array(vars_)
    fe = M.pool_fe(betas, vars_)
    dl = M.pool_dl(betas, vars_)
    re = M.pool_reml_hk(betas, vars_)
    os1 = M.one_stage_linear(studies)
    print(f"Worked example  (seed={SEED}, k={K}, true beta={TRUE_BETA}, true tau2={TRUE_TAU2})")
    print(f"  DL tau2_hat   = {dl['tau2']:.4f}")
    print(f"  REML tau2_hat = {re['tau2']:.4f}")
    hdr = f"{'method':<10}{'estimate':>10}{'95% CI':>22}{'width':>9}{'covers?':>9}"
    print(hdr)
    for name, p in (("NaiveFE", fe), ("DL", dl), ("REML_HK", re), ("OneStage", os1)):
        covers = "yes" if p["lo"] <= TRUE_BETA <= p["hi"] else "NO"
        ci = f"[{p['lo']:.3f}, {p['hi']:.3f}]"
        print(f"{name:<10}{p['mu']:>10.3f}{ci:>22}{p['hi'] - p['lo']:>9.3f}{covers:>9}")


if __name__ == "__main__":
    main()
