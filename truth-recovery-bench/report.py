"""
report.py — Turn a results_*.json into the truth-recovery leaderboard + REPORT.md.

Honest scoring criterion (from MA_METHODS_INVENTORY 2026-06-10, sec 7):
methods are judged purely by recovery of the TRUE mu under joint contamination
(heterogeneity + publication selection): minimal |bias|, MSE-to-true-mu, and
CI coverage of the TRUE value at the nominal 0.95 rate. A method that nails the
point but mis-states its interval is NOT 'truest'. We therefore always report
bias, RMSE, AND coverage together and never collapse them into one opaque score.
"""
import argparse
import json
import os
from collections import defaultdict

import numpy as np

METHOD_ORDER = ["DL", "REML", "PM", "HKSJ", "VeveaHedges", "Copas",
                "RoBMA", "PET-PEESE", "GRMA", "TrimFill"]
SEL_SCENARIOS = ["step_weak", "step_strong", "copas_weak", "copas_strong"]


def load(path):
    return json.load(open(path))


def _by(results, **match):
    out = []
    for r in results:
        c = r["cell"]
        if all(c.get(kk) == vv for kk, vv in match.items()):
            out.append(r)
    return out


def fmt(x, d=3):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return "  -  "
    return f"{x:+.{d}f}" if d and x < 0 else f"{x:.{d}f}"


def cov_fmt(x):
    return "  -  " if x is None or not np.isfinite(x) else f"{x:.2f}"


def agg_over_cells(cells, metric):
    """Mean of a per-method metric across a list of cells (rep-weighted equally)."""
    acc = defaultdict(list)
    for r in cells:
        for m, s in r["methods"].items():
            v = s.get(metric)
            if v is not None and np.isfinite(v):
                acc[m].append(v)
    return {m: (float(np.mean(vs)) if vs else np.nan) for m, vs in acc.items()}


def headline_leaderboard(results):
    """Selection-present cells at moderate het (primary block, the 4 selection
    scenarios, all k pooled). Returns rows sorted by RMSE-to-truth."""
    cells = [r for r in _by(results, block="primary")
             if r["cell"]["scenario"] in SEL_SCENARIOS]
    bias = agg_over_cells(cells, "bias")
    absbias = {m: abs(b) for m, b in bias.items()}
    rmse = agg_over_cells(cells, "rmse")
    cov = agg_over_cells(cells, "coverage")
    width = agg_over_cells(cells, "mean_width")
    fail = agg_over_cells(cells, "fail_rate")
    rows = []
    for m in METHOD_ORDER:
        if m not in rmse:
            continue
        rows.append({"method": m, "abs_bias": absbias[m], "rmse": rmse[m],
                     "coverage": cov.get(m, np.nan), "width": width.get(m, np.nan),
                     "fail": fail.get(m, np.nan)})
    rows.sort(key=lambda r: r["rmse"])
    return rows


def md_table(headers, rows):
    line = "| " + " | ".join(headers) + " |"
    sep = "|" + "|".join("---" for _ in headers) + "|"
    body = "\n".join("| " + " | ".join(r) + " |" for r in rows)
    return f"{line}\n{sep}\n{body}"


def build_report(payload):
    meta = payload["meta"]
    results = payload["results"]
    L = []
    L.append("# Truth-Recovery Yardstick — Measured Leaderboard\n")
    L.append(f"> Generated from `{meta.get('profile')}` run · base_seed="
             f"`{meta['base_seed']}` · {meta['reps']} replications/cell · "
             f"{meta['n_cells']} cells · {meta.get('elapsed_sec','?')}s · "
             f"GRMA bootstrap B={meta['grma_B']}.\n")
    L.append("**What this is.** A known-truth simulation that injects BOTH "
             "heterogeneity (true τ²) AND a parameterised publication-selection "
             "mechanism, then scores every pooling/bias method in the portfolio "
             "on recovery of the TRUE μ. This replaces the inventory's *reasoned* "
             "ranking (sec 7b) with a *measured* one. No new method is claimed "
             "superior here — this establishes the bar one must beat.\n")

    # ---- mechanism description ----
    L.append("## Data-generating process\n")
    L.append(f"- Studies drawn from θᵢ ~ N(μ, τ²), yᵢ ~ N(θᵢ, vᵢ); SEs "
             f"log-uniform on {meta['se_range']}. The observed meta-analysis is "
             "the set of *published* studies (oversampled to the target k), so k "
             "is the published count and the true μ is the unconditional mean a "
             "method must recover.")
    L.append(f"- **Step (Vevea–Hedges) selection**: one-sided p cutpoints "
             f"{meta['step_cuts']}, publication weights "
             f"weak={meta['step_weights']['weak']}, "
             f"strong={meta['step_weights']['strong']}.")
    cp = meta["copas_params"]
    L.append(f"- **Copas latent selection**: z = γ₀ + γ₁/SE + d, publish if z>0, "
             f"corr(d, study noise)=ρ. weak={cp['weak']}, strong={cp['strong']}.")
    # realised naive bias per scenario (from none/primary cells, FE-naive proxy = DL bias)
    L.append("")

    # ---- headline leaderboard ----
    L.append("## 1. Headline leaderboard — joint condition (selection + τ²=0.05, k 5→50 pooled)\n")
    L.append("Ranked by **RMSE-to-true-μ** across the four selection scenarios "
             "(step weak/strong, Copas weak/strong) and all k. Coverage is of the "
             "TRUE μ (target 0.95). `fail` = share of replications with no usable "
             "estimate.\n")
    rows = headline_leaderboard(results)
    trows = []
    for i, r in enumerate(rows, 1):
        trows.append([str(i), f"**{r['method']}**", fmt(r["abs_bias"]),
                      fmt(r["rmse"]), cov_fmt(r["coverage"]),
                      fmt(r["width"]), cov_fmt(r["fail"])])
    L.append(md_table(["#", "method", "|bias|", "RMSE", "coverage", "width", "fail"],
                      trows))
    L.append("")

    # ---- per-scenario x k detail (primary block) ----
    L.append("## 2. Per-scenario detail (primary block, μ=0.3, τ²=0.05)\n")
    for sc in ["none"] + SEL_SCENARIOS:
        L.append(f"### {sc}\n")
        L.append("bias / coverage / RMSE per method × k.\n")
        ks = sorted({r["cell"]["k"] for r in _by(results, block="primary", scenario=sc)})
        header = ["method"] + [f"k={k}" for k in ks]
        # three sub-tables: bias, coverage, rmse
        for metric, label in [("bias", "bias"), ("coverage", "coverage"),
                              ("rmse", "RMSE")]:
            trows = []
            for m in METHOD_ORDER:
                cells_by_k = {}
                for k in ks:
                    cs = _by(results, block="primary", scenario=sc, k=k)
                    if cs and m in cs[0]["methods"]:
                        cells_by_k[k] = cs[0]["methods"][m].get(metric)
                row = [m]
                for k in ks:
                    v = cells_by_k.get(k)
                    row.append(cov_fmt(v) if metric == "coverage" else fmt(v))
                trows.append(row)
            L.append(f"*{label}*\n")
            L.append(md_table(header, trows))
            L.append("")

    # ---- heterogeneity sweep ----
    het = _by(results, block="hetero")
    if het:
        L.append("## 3. Heterogeneity sweep (k=15, μ=0.3, τ² ∈ {0, 0.02, 0.08, 0.20})\n")
        t2s = sorted({r["cell"]["tau2"] for r in het})
        for sc in SEL_SCENARIOS:
            L.append(f"### {sc} — coverage by τ²\n")
            header = ["method"] + [f"τ²={t}" for t in t2s]
            trows = []
            for m in METHOD_ORDER:
                row = [m]
                for t2 in t2s:
                    cs = _by(results, block="hetero", scenario=sc, tau2=t2)
                    v = cs[0]["methods"].get(m, {}).get("coverage") if cs else None
                    row.append(cov_fmt(v))
                trows.append(row)
            L.append(md_table(header, trows))
            L.append("")

    # ---- type-I / power ----
    ti = _by(results, block="typeI")
    if ti:
        L.append("## 4. Type-I error (μ=0) and power (μ=0.3)\n")
        L.append("`reject0` = P(0 outside the 95% CI). At μ=0 this is the type-I "
                 "rate (target ≤0.05); at μ=0.3 (primary block) it is power.\n")
        for sc in ["none"] + SEL_SCENARIOS:
            ks = sorted({r["cell"]["k"] for r in _by(results, block="typeI", scenario=sc)})
            header = ["method"] + [f"typeI k={k}" for k in ks] + ["power(k=15,μ=.3)"]
            trows = []
            for m in METHOD_ORDER:
                row = [m]
                for k in ks:
                    cs = _by(results, block="typeI", scenario=sc, k=k)
                    v = cs[0]["methods"].get(m, {}).get("reject0") if cs else None
                    row.append(cov_fmt(v))
                cs = _by(results, block="primary", scenario=sc, k=15)
                pv = cs[0]["methods"].get(m, {}).get("reject0") if cs else None
                row.append(cov_fmt(pv))
                trows.append(row)
            L.append(f"### {sc}\n")
            L.append(md_table(header, trows))
            L.append("")

    # ---- failure modes ----
    L.append("## 5. Failure modes (where each method breaks)\n")
    fr = agg_over_cells([r for r in _by(results, block="primary")
                         if r["cell"]["scenario"] in SEL_SCENARIOS], "fail_rate")
    cov = agg_over_cells([r for r in _by(results, block="primary")
                          if r["cell"]["scenario"] in SEL_SCENARIOS], "coverage")
    bias = agg_over_cells([r for r in _by(results, block="primary")
                           if r["cell"]["scenario"] in SEL_SCENARIOS], "bias")
    notes = []
    if "Copas" in fr:
        notes.append(f"- **Copas** non-convergence / non-identification rate "
                     f"(selection cells): **{fr['Copas']*100:.1f}%**.")
    if "PET-PEESE" in cov:
        notes.append(f"- **PET-PEESE** mean coverage under selection: "
                     f"**{cov['PET-PEESE']:.2f}** (FE WLS has no τ² → interval "
                     f"under/over-statement).")
    if "RoBMA" in bias:
        notes.append(f"- **RoBMA** mean bias under selection: "
                     f"**{bias['RoBMA']:+.3f}** (bias-blind ensemble + μ-prior "
                     f"shrinkage → biased location with honest-width interval).")
    if "VeveaHedges" in cov:
        notes.append(f"- **Vevea–Hedges** mean coverage under selection: "
                     f"**{cov['VeveaHedges']:.2f}**; strongest when the true "
                     f"mechanism IS a p-step, degrades at small k (δ near-unidentified).")
    L.extend(notes)
    L.append("")

    # ---- reproducibility ----
    L.append("## 6. Reproducibility\n")
    L.append(f"- Fully seeded: every replication draws from "
             f"`np.random.default_rng(SeedSequence([{meta['base_seed']}, "
             f"stable_hash(cell_id), k]).spawn(rep))`. Re-running "
             f"`python harness.py --profile {meta.get('profile')} "
             f"--reps {meta['reps']}` reproduces every number.")
    L.append("- Method ports validated against the audited R oracles in "
             "`tests/test_methods.py` (Vevea–Hedges ≈ metafor::selmodel, "
             "Copas ≈ metasens, REML ≈ brute-force restricted-likelihood grid).")
    L.append("")
    return "\n".join(L)


def console_summary(payload):
    rows = headline_leaderboard(payload["results"])
    print("\n=== HEADLINE LEADERBOARD (joint condition, RMSE-to-true-mu) ===")
    print(f"{'#':>2} {'method':12s} {'|bias|':>7s} {'RMSE':>7s} "
          f"{'cover':>6s} {'width':>7s} {'fail':>6s}")
    for i, r in enumerate(rows, 1):
        print(f"{i:>2} {r['method']:12s} {abs(r['abs_bias']):7.3f} {r['rmse']:7.3f} "
              f"{r['coverage']:6.2f} {r['width']:7.3f} {r['fail']:6.2f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", default="results_full.json")
    ap.add_argument("--out", default="REPORT.md")
    args = ap.parse_args()
    here = os.path.dirname(os.path.abspath(__file__))
    rp = args.results if os.path.isabs(args.results) else os.path.join(here, args.results)
    payload = load(rp)
    md = build_report(payload)
    op = args.out if os.path.isabs(args.out) else os.path.join(here, args.out)
    with open(op, "w", encoding="utf-8") as f:
        f.write(md)
    console_summary(payload)
    print(f"\n[report] wrote {op} ({len(md)} chars)")


if __name__ == "__main__":
    main()
