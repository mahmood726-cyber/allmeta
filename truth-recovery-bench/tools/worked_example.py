"""
worked_example.py -- one seeded known-truth meta-analysis under strong p-value
publication selection, scored by a representative slice of the portfolio. The DGP
is the benchmark's own dgp.generate, so the TRUE mu is known and we can mark which
intervals actually cover it. Deterministic (fixed seed); the printed numbers are
reproducible and are the ones quoted in the manuscript worked example.

Run: python tools/worked_example.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import dgp
import methods as M

SEED = 20260611
TRUE_MU, TRUE_TAU2, K, SCENARIO = 0.30, 0.05, 15, "step_strong"
SHOWN = ["DL", "REML", "HKSJ", "VeveaHedges", "Copas", "PartialID", "Unified"]


def main():
    rng = np.random.default_rng(SEED)
    y, v, info = dgp.generate(TRUE_MU, TRUE_TAU2, K, SCENARIO, rng)
    print(f"Worked example  (seed={SEED}, scenario={SCENARIO}, k={K}, "
          f"true mu={TRUE_MU}, true tau2={TRUE_TAU2})")
    print(f"  observed published studies k = {len(y)}; "
          f"selection fraction = {info['sel_frac']:.3f} "
          f"(only ~{info['sel_frac']*100:.0f}% of generated studies were 'published')")
    print()
    hdr = f"{'method':<13}{'mu_hat':>9}{'95% CI':>22}{'width':>9}{'covers mu?':>12}"
    print(hdr)
    print("-" * len(hdr))
    for name in SHOWN:
        r = M.ALL_METHODS[name](y, v)
        covers = "yes" if r["ci_lo"] <= TRUE_MU <= r["ci_hi"] else "NO"
        ci = f"[{r['ci_lo']:.3f}, {r['ci_hi']:.3f}]"
        print(f"{name:<13}{r['mu']:>9.3f}{ci:>22}{r['ci_hi'] - r['ci_lo']:>9.3f}"
              f"{covers:>12}")
    print()
    print("Reading: strong positive-result selection drags every naive/selection-")
    print("partial pool UP to mu_hat ~ 0.55 with a tight interval that EXCLUDES the")
    print("true mu = 0.30. Only the selection-aware estimators (PartialID's honest")
    print("Manski bounds and the Unified NPE-de-biased point + union interval)")
    print("recover an interval that covers the truth -- at the honest cost of width.")


if __name__ == "__main__":
    main()
