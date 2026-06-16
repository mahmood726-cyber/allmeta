"""
validate_realscale.py — Re-validate the real-scale NPE retrain on the 55-cell
known-truth grid WITHOUT re-simulating, by reusing a per-rep NPE dump
(dump_perrep.py) produced with the chosen model artifact.

For a given NPE per-rep dump (canonical or real-scale) and the model-independent
PartialID dump, we evaluate exactly the two configs that matter for the frozen
deliverable, using the SAME offline aggregation as explore_tighten.py / the
REPORT:

  * NPE-alone (npe_scale=1.00)         — the raw amortized estimator.
  * Unified frozen (gated, npe_scale=1.15) — the deployed estimator.

We emit, per config: the min coverage over all 55 cells (and the cell), the
worst type-I (reject0 at mu=0) and its cell, the mean interval width, the count
of cells below 0.90 coverage / above 0.07 type-I, and the FULL per-cell
coverage + reject0 arrays so a before/after table can be built deterministically.

The pass bar (from REPORT.md §7): coverage of true mu >= 0.90 on EVERY cell AND
type-I <= 0.07 everywhere. PartialID is unchanged by NPE retraining, so the
canonical-vs-realscale delta is attributable entirely to the wider SE prior.

Usage:
  python validate_realscale.py --npe perrep_npe.json           --tag canonical \
        --out validation_canonical.json
  python validate_realscale.py --npe perrep_npe_realscale.json --tag realscale \
        --out validation_realscale.json
"""
import argparse
import json
import os

import numpy as np

from ensemble_offline import load_perrep, aggregate
from explore_tighten import shrink_npe, combine

HERE = os.path.dirname(os.path.abspath(__file__))

CONFIGS = [
    ("NPE-alone", "gated", 1.00),       # NPE base interval, no widening (rule moot)
    ("Unified-frozen", "gated", 1.15),  # deployed config
]
# For NPE-alone we want the raw NPE interval, not a gated ensemble. shrink at
# s=1.0 with gated rule keeps NPE's own interval except where PartialID
# disagrees — which is NOT NPE-alone. So evaluate NPE-alone directly from the
# NPE dump (no combine), matching explore_tighten's "NPE-alone" frontier row.


def eval_config(npe, pid, rule, s, reps, npe_alone=False):
    """Return summary + per-cell coverage/reject0 for one config."""
    percell = {}
    mincov, mincell = 1.0, None
    worst_typeI, worstcell = 0.0, None
    n_below90, n_typeI_over = 0, 0
    widths = []
    for cid in npe:
        a = shrink_npe(npe[cid], s)
        if npe_alone:
            syn = {k: a[k] for k in ("lo", "hi", "mu", "tau2", "ok")}
        else:
            syn = combine(a, pid[cid], rule)
        tmu, tt2 = npe[cid]["true_mu"], npe[cid]["true_tau2"]
        agg = aggregate(syn, tmu, tt2, reps)
        cov, rej, wid = agg["coverage"], agg["reject0"], agg["mean_width"]
        is_null = (npe[cid]["cell"]["mu"] == 0.0)
        percell[cid] = {"coverage": cov, "reject0": rej, "mean_width": wid,
                        "mu": npe[cid]["cell"]["mu"], "is_null": is_null}
        widths.append(wid)
        if cov < mincov:
            mincov, mincell = cov, cid
        if cov < 0.90:
            n_below90 += 1
        if is_null:
            if rej > worst_typeI:
                worst_typeI, worstcell = rej, cid
            if rej > 0.07:
                n_typeI_over += 1
    return {
        "min_cov": mincov, "min_cov_cell": mincell,
        "worst_typeI": worst_typeI, "worst_typeI_cell": worstcell,
        "mean_width": float(np.mean(widths)),
        "n_below90": n_below90, "n_typeI_over_0p07": n_typeI_over,
        "feasible": bool(mincov >= 0.90 and worst_typeI <= 0.07),
        "percell": percell,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--npe", required=True)
    ap.add_argument("--pid", default=os.path.join(HERE, "perrep_partialid.json"))
    ap.add_argument("--tag", default="model")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    npe, reps_n = load_perrep(args.npe, "NPE")
    pid, reps_p = load_perrep(args.pid, "PartialID")
    assert reps_n == reps_p, f"reps mismatch {reps_n} vs {reps_p}"
    # parity guard: same cells, same degeneracy/sel_frac (data identical)
    for cid in npe:
        assert cid in pid, f"{cid} missing from PID dump"
        assert npe[cid]["n_degenerate"] == pid[cid]["n_degenerate"], \
            f"degeneracy mismatch at {cid} (data streams diverged)"
    reps = reps_n

    out = {"tag": args.tag, "npe_dump": os.path.basename(args.npe),
           "reps": reps, "n_cells": len(npe), "configs": {}}
    for name, rule, s in CONFIGS:
        r = eval_config(npe, pid, rule, s, reps, npe_alone=(name == "NPE-alone"))
        out["configs"][name] = r
        flag = "PASS" if r["feasible"] else "FAIL"
        print(f"[{args.tag}] {name:16s} minCov={r['min_cov']:.3f} "
              f"(@{r['min_cov_cell']})  worstTypeI={r['worst_typeI']:.3f} "
              f"(@{r['worst_typeI_cell']})  meanW={r['mean_width']:.3f}  "
              f"#<.90={r['n_below90']}  #typeI>.07={r['n_typeI_over_0p07']}  "
              f"-> {flag}")

    outp = args.out or os.path.join(HERE, f"validation_{args.tag}.json")
    with open(outp, "w") as f:
        json.dump(out, f, indent=1)
    print(f"[{args.tag}] wrote {outp}")


if __name__ == "__main__":
    main()
