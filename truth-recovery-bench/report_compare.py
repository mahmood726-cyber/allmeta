"""
report_compare.py — turn results_compare.json (the frontier head-to-head) into the
measured §4 tables and inject them into frontier_survey.md.

Truth-first: every number comes straight from the seeded harness aggregation; we
report honest wins AND losses for the new competitors and the Unified estimator.
"""
import argparse
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))

# Curated display order: incumbents, new SOTA competitors, unified family.
ORDER = ["DL", "REML", "HKSJ", "VeveaHedges", "Copas", "RoBMA", "PET-PEESE",
         "TrimFill", "GRMA", "p-uniform*", "WLS", "WAAP", "NPE", "PartialID", "Unified"]
NEW = {"p-uniform*", "WLS", "WAAP"}
SCEN = ["none", "step_weak", "step_strong", "copas_weak", "copas_strong"]


def _load(path):
    with open(path) as f:
        return json.load(f)


def _cells(results, block):
    return [r for r in results if r["cell"].get("block") == block]


def _agg(cells, metric):
    """Mean of a per-cell metric across cells, per method (NaN-aware)."""
    out = {}
    for m in ORDER:
        vals = []
        for c in cells:
            md = c["methods"].get(m, {})
            x = md.get(metric)
            if x is not None and np.isfinite(x):
                vals.append(x)
        out[m] = float(np.mean(vals)) if vals else float("nan")
    return out


def _fmt(x, nd=3, plus=False):
    if x is None or not np.isfinite(x):
        return "—"
    s = f"{x:+.{nd}f}" if plus else f"{x:.{nd}f}"
    return s


def build_md(path):
    data = _load(path)
    res = data["results"]
    meta = data["meta"]
    primary = _cells(res, "primary")
    typeI = _cells(res, "typeI")
    reps = meta["reps"]

    lines = []
    lines.append(f"**Run:** profile=compare, reps={reps}/cell, "
                 f"{len(primary)} primary + {len(typeI)} type-I cells, "
                 f"all on identical seeds (BASE_SEED={meta['base_seed']}).\n")

    # ---- Table 1: mean |bias| by scenario on the primary grid -------------
    lines.append("### 4.1 Mean |bias| by selection mechanism (primary grid, μ=0.3, τ²=0.05, mean over k∈{5,10,15,25,50})\n")
    hdr = "| Method | " + " | ".join(SCEN) + " |"
    lines.append(hdr)
    lines.append("|" + "---|" * (len(SCEN) + 1))
    for m in ORDER:
        row = [m + (" *(new)*" if m in NEW else "")]
        for sc in SCEN:
            sc_cells = [c for c in primary if c["cell"]["scenario"] == sc]
            biases = [abs(c["methods"].get(m, {}).get("bias")) for c in sc_cells
                      if c["methods"].get(m, {}).get("bias") is not None
                      and np.isfinite(c["methods"].get(m, {}).get("bias", np.nan))]
            row.append(_fmt(np.mean(biases)) if biases else "—")
        lines.append("| " + " | ".join(row) + " |")
    lines.append("")

    # ---- Table 2: overall primary metrics ---------------------------------
    bias = _agg(primary, "bias")
    rmse = _agg(primary, "rmse")
    cov = _agg(primary, "coverage")
    width = _agg(primary, "mean_width")
    # min coverage across primary cells per method
    mincov = {}
    for m in ORDER:
        cs = [c["methods"].get(m, {}).get("coverage") for c in primary
              if c["methods"].get(m, {}).get("coverage") is not None
              and np.isfinite(c["methods"].get(m, {}).get("coverage", np.nan))]
        mincov[m] = float(np.min(cs)) if cs else float("nan")

    lines.append("### 4.2 Overall (mean over the 25 primary cells)\n")
    lines.append("| Method | mean bias | mean RMSE | mean cov | min cov | mean width |")
    lines.append("|---|---|---|---|---|---|")
    for m in ORDER:
        lines.append(f"| {m}{' *(new)*' if m in NEW else ''} "
                     f"| {_fmt(bias[m], plus=True)} | {_fmt(rmse[m])} "
                     f"| {_fmt(cov[m])} | {_fmt(mincov[m])} | {_fmt(width[m])} |")
    lines.append("")

    # ---- Table 3: type-I -------------------------------------------------
    rej = _agg(typeI, "reject0")
    covI = _agg(typeI, "coverage")
    lines.append("### 4.3 Type-I error at μ=0 (mean reject-0 over k∈{10,25} × 5 scenarios; target ≤0.05–0.07)\n")
    lines.append("| Method | mean type-I | mean cov(0) |")
    lines.append("|---|---|---|")
    for m in ORDER:
        lines.append(f"| {m}{' *(new)*' if m in NEW else ''} | {_fmt(rej[m])} | {_fmt(covI[m])} |")
    lines.append("")

    # ---- Auto narrative: honest wins & losses -----------------------------
    def best(d, lo=True):
        items = [(m, v) for m, v in d.items() if np.isfinite(v)]
        return sorted(items, key=lambda kv: kv[1], reverse=not lo)

    step_cells = [c for c in primary if c["cell"]["scenario"] in ("step_weak", "step_strong")]
    copas_cells = [c for c in primary if c["cell"]["scenario"] in ("copas_weak", "copas_strong")]

    def mean_abs_bias(cells, m):
        b = [abs(c["methods"].get(m, {}).get("bias")) for c in cells
             if c["methods"].get(m, {}).get("bias") is not None
             and np.isfinite(c["methods"].get(m, {}).get("bias", np.nan))]
        return float(np.mean(b)) if b else float("nan")

    lines.append("### 4.4 Honest read (auto-generated from the numbers above)\n")
    sb = {m: mean_abs_bias(step_cells, m) for m in ORDER}
    cb = {m: mean_abs_bias(copas_cells, m) for m in ORDER}
    lines.append(f"- **Under p-step selection** lowest |bias|: "
                 + ", ".join(f"{m} {v:.3f}" for m, v in best(sb)[:4]) + ".")
    lines.append(f"- **Under Copas/funnel selection** lowest |bias|: "
                 + ", ".join(f"{m} {v:.3f}" for m, v in best(cb)[:4]) + ".")
    lines.append(f"- **Tightest honest interval** (min cov ≥0.90), lowest mean width: "
                 + ", ".join(f"{m} {width[m]:.3f}" for m in
                             sorted([m for m in ORDER if mincov[m] >= 0.90 and np.isfinite(width[m])],
                                    key=lambda m: width[m])[:4]) + ".")
    lines.append(f"- **Best type-I control**: "
                 + ", ".join(f"{m} {v:.3f}" for m, v in best(rej)[:4]) + ".")
    lines.append("")

    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", default=os.path.join(HERE, "results_compare.json"))
    ap.add_argument("--survey", default=os.path.join(HERE, "frontier_survey.md"))
    ap.add_argument("--inject", action="store_true",
                    help="replace the <!-- RESULTS_PLACEHOLDER --> in the survey")
    args = ap.parse_args()
    md = build_md(args.results)
    print(md)
    if args.inject:
        with open(args.survey, encoding="utf-8") as f:
            txt = f.read()
        marker = "<!-- RESULTS_PLACEHOLDER -->"
        if marker in txt:
            txt = txt.replace(marker, md)
            with open(args.survey, "w", encoding="utf-8") as f:
                f.write(txt)
            print(f"\n[injected into {args.survey}]")
        else:
            print("\n[marker not found — survey already has results?]")


if __name__ == "__main__":
    main()
