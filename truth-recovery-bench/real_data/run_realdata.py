"""
run_realdata.py — Descriptive real-data comparison of the unified estimator
against the classical pooling/bias methods on the Pairwise70 Cochrane corpus.

There is NO known truth on real data, so nothing here is scored as correct.
We report, per method, across the 434 log-OR meta-analyses:

  * the POINT estimate and its divergence from the REML anchor (|mu - mu_REML|);
  * the 95% interval WIDTH (the central question of goal 1 — does the unified
    interval's honest width manifest on real data, and by how much?);
  * SIGN/significance agreement with REML (does the CI exclude 0, same side?);
  * how often the unified interval CONTAINS the REML point (a coherence check:
    a coverage-targeted partial-ID interval should rarely exclude the standard
    estimate).

The estimator was trained on a DGP with study SE in [0.1, 0.7]; real log-OR SEs
run much larger (median ~1.7). We therefore report results on the FULL set and
on the in-support subset (median study SE <= 0.7), and — driven from a separate
real-scale artifact via SBI_MODEL_PATH — a real-scale-trained NPE for contrast.

Usage:
  python run_realdata.py --csv pairwise70_studylevel.csv --out realdata_results.json
  SBI_MODEL_PATH=../sbi_model_realscale.pkl python run_realdata.py --tag realscale ...
"""

import argparse
import csv
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import methods as M  # noqa: E402

# Methods to compare. Unified is evaluated in both interval modes.
CLASSICAL = ["REML", "HKSJ", "PET-PEESE", "TrimFill", "VeveaHedges", "Copas"]
NEW = ["NPE", "PartialID", "PVS"]


def load_studylevel(path):
    rows = {}
    with open(path, encoding="utf-8", errors="replace", newline="") as f:
        for r in csv.DictReader(f):
            rows.setdefault(r["review_id"], []).append(
                (float(r["yi"]), float(r["vi"])))
    out = {}
    for rid, pairs in rows.items():
        y = np.array([a for a, _ in pairs], float)
        v = np.array([b for _, b in pairs], float)
        if len(y) >= 3 and np.all(np.isfinite(y)) and np.all(v > 0):
            out[rid] = (y, v)
    return out


def _run_one(y, v):
    """Run every method on one meta-analysis; return {method: result-dict}."""
    res = {}
    for name in CLASSICAL + NEW:
        try:
            r = M.ALL_METHODS[name](y, v)
        except Exception as e:
            r = {"mu": np.nan, "ci_lo": np.nan, "ci_hi": np.nan, "ok": False,
                 "fail": repr(e)}
        res[name] = r
    # Unified: the frozen deployed config (gated, ×1.15) plus the two reference
    # interval rules (union = max-width, lower = width-efficient) for contrast.
    import unified as U
    try:
        res["Unified-frozen"] = U.unified(y, v)          # gated, npe_scale=1.15
    except Exception as e:
        res["Unified-frozen"] = {"mu": np.nan, "ci_lo": np.nan, "ci_hi": np.nan,
                                 "ok": False, "fail": repr(e)}
    for mode in ("union", "lower"):
        try:
            r = U.unified(y, v, mode=mode, npe_scale=1.0)
        except Exception as e:
            r = {"mu": np.nan, "ci_lo": np.nan, "ci_hi": np.nan, "ok": False,
                 "fail": repr(e)}
        res[f"Unified-{mode}"] = r
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=os.path.join(HERE, "pairwise70_studylevel.csv"))
    ap.add_argument("--out", default=os.path.join(HERE, "realdata_results.json"))
    ap.add_argument("--tag", default="canonical",
                    help="label for this run (e.g. canonical / realscale)")
    args = ap.parse_args()

    data = load_studylevel(args.csv)
    rids = sorted(data)
    print(f"[realdata:{args.tag}] {len(rids)} reviews from {args.csv} "
          f"(model={os.environ.get('SBI_MODEL_PATH', 'sbi_model.pkl')})",
          flush=True)

    method_names = CLASSICAL + NEW + ["Unified-frozen", "Unified-union",
                                      "Unified-lower"]
    per_review = []
    for i, rid in enumerate(rids, 1):
        y, v = data[rid]
        med_se = float(np.median(np.sqrt(v)))
        res = _run_one(y, v)
        row = {"review_id": rid, "k": len(y), "median_se": med_se, "methods": {}}
        for name in method_names:
            r = res[name]
            row["methods"][name] = {
                "mu": float(r.get("mu", np.nan)),
                "ci_lo": float(r.get("ci_lo", np.nan)),
                "ci_hi": float(r.get("ci_hi", np.nan)),
                "ok": bool(r.get("ok", False)),
            }
        per_review.append(row)
        if i % 50 == 0:
            print(f"  [{i}/{len(rids)}] {rid}", flush=True)

    payload = {"meta": {"tag": args.tag, "n_reviews": len(rids),
                        "methods": method_names,
                        "model_path": os.environ.get("SBI_MODEL_PATH",
                                                     "sbi_model.pkl"),
                        "csv": os.path.basename(args.csv)},
               "results": per_review}
    with open(args.out, "w") as f:
        json.dump(payload, f, indent=1)
    print(f"[realdata:{args.tag}] wrote {args.out}", flush=True)


if __name__ == "__main__":
    main()
