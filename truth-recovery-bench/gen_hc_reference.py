"""
gen_hc_reference.py — Generate fixed (y, v) test cases for the Henmi-Copas port
and (when run with --emit-cases) write them to hc_testcases.json for R to score.

Pipeline:
  1. python gen_hc_reference.py --emit-cases      # -> hc_testcases.json
  2. Rscript gen_hc_reference.R                    # -> hc_reference.json (metafor::hc)
  3. python -m pytest tests/test_henmi_copas.py    # asserts agreement < 1e-5

The cases span scenarios (none/step/copas), k in {5,10,15,25,50} and a couple of
hand-built datasets incl. a tau2=0 (homogeneous) edge case, so the port is
validated across the regimes the head-to-head exercises.
"""

import argparse
import json
import os

import numpy as np

import dgp

HERE = os.path.dirname(os.path.abspath(__file__))


def build_cases():
    cases = []
    for sc in ["none", "step_strong", "copas_strong", "step_weak", "copas_weak"]:
        for k in [5, 10, 15, 25, 50]:
            rng = np.random.default_rng(abs(hash((sc, k))) % (2 ** 32))
            y, v, info = dgp.generate(0.3, 0.05, k, sc, rng)
            if info["degenerate"] or len(y) < 3:
                continue
            cases.append({"label": f"{sc}_k{k}", "y": [float(a) for a in y],
                          "v": [float(a) for a in v]})
    # Hand-built deterministic datasets (independent of the DGP).
    cases.append({"label": "manual_hetero",
                  "y": [0.10, 0.30, 0.35, 0.05, 0.50, 0.20, 0.42, 0.28],
                  "v": [0.02, 0.05, 0.10, 0.01, 0.20, 0.03, 0.15, 0.06]})
    cases.append({"label": "manual_homog_tau2zero",   # Q < k-1 -> tau2=0 branch
                  "y": [0.20, 0.21, 0.19, 0.205, 0.195],
                  "v": [0.04, 0.05, 0.045, 0.05, 0.04]})
    cases.append({"label": "manual_k2",
                  "y": [0.15, 0.45], "v": [0.03, 0.08]})
    return cases


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emit-cases", action="store_true")
    args = ap.parse_args()
    cases = build_cases()
    if args.emit_cases:
        path = os.path.join(HERE, "hc_testcases.json")
        with open(path, "w") as f:
            json.dump(cases, f, indent=1)
        print(f"wrote {len(cases)} cases -> {path}")
    else:
        print(f"{len(cases)} cases built (pass --emit-cases to write json)")


if __name__ == "__main__":
    main()
