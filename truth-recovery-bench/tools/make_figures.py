"""
make_figures.py -- regenerate the pairwise truth-recovery manuscript figures from
the committed measured results JSON (results_merged.json). Deterministic: reads
numbers only, draws no random samples. Run via `python tools/make_figures.py` or
the Makefile `figures` target. Output -> paper/figures/*.png.

Three figures, all from the same committed leaderboard:
  fig1  coverage vs tau^2 under strong p-step selection (k=15): the incumbent
        collapse vs the honest selection-aware estimators, with the nominal 0.95 line.
  fig2  coverage collapse WITH k under strong p-step selection: the central
        pathology -- naive RE coverage of the truth falls toward 0 as evidence
        accumulates, while Unified/PartialID hold; nominal 0.95 line.
  fig3  the joint-condition leaderboard (selection cells, k>=15): coverage of the
        true mu vs mean interval width, separating the honest correctors from the
        incumbents, with the nominal-0.95 line.
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RESULTS = os.path.join(ROOT, "results_merged.json")
FIGDIR = os.path.join(ROOT, "paper", "figures")
os.makedirs(FIGDIR, exist_ok=True)

NOMINAL = 0.95


def load():
    with open(RESULTS, encoding="utf-8") as f:
        return json.load(f)["results"]


def cell(results, **kw):
    """Return the result dict whose `cell` matches all of kw, else None."""
    for r in results:
        c = r["cell"]
        if all(c.get(k) == v for k, v in kw.items()):
            return r
    return None


# (method-key, colour, marker, label) -- incumbents in warm/red, honest in cool/green.
INCUMBENTS = [("DL", "#d62728", "o", "DL (naive RE + z)"),
              ("REML", "#9467bd", "v", "REML"),
              ("HKSJ", "#ff7f0e", "s", "HKSJ"),
              ("Copas", "#8c564b", "P", "Copas-Shi")]
HONEST = [("VeveaHedges", "#17becf", "*", "Vevea-Hedges"),
          ("PartialID", "#2ca02c", "^", "PartialID (Manski bounds)"),
          ("Unified", "#1f77b4", "D", "Unified (NPE + union)")]


def fig_coverage_vs_tau(results):
    taus = [0.0, 0.02, 0.08, 0.20]
    fig, ax = plt.subplots(figsize=(6.4, 4.2))
    for key, col, mk, lab in INCUMBENTS + HONEST:
        ys = []
        for t in taus:
            r = cell(results, k=15, tau2=t, scenario="step_strong", block="hetero")
            ys.append(r["methods"][key]["coverage"] if r else None)
        ax.plot(taus, ys, marker=mk, color=col, label=lab, lw=1.8, ms=6)
    ax.axhline(NOMINAL, ls="--", color="#555555", lw=1, label="nominal 0.95")
    ax.set_xlabel(r"true between-study variance $\tau^2$")
    ax.set_ylabel(r"coverage of the true $\mu$")
    ax.set_title("Coverage under strong p-step selection (k = 15)")
    ax.set_ylim(0, 1.04)
    ax.legend(fontsize=7.5, loc="center right", ncol=1)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    p = os.path.join(FIGDIR, "fig1_coverage_vs_tau.png")
    fig.savefig(p, dpi=160)
    plt.close(fig)
    return p


def fig_coverage_vs_k(results):
    ks = [5, 10, 15, 25, 50]
    fig, ax = plt.subplots(figsize=(6.4, 4.2))
    for key, col, mk, lab in INCUMBENTS + HONEST:
        ys = []
        for k in ks:
            r = cell(results, k=k, tau2=0.05, scenario="step_strong", block="primary")
            ys.append(r["methods"][key]["coverage"] if r else None)
        ax.plot(ks, ys, marker=mk, color=col, label=lab, lw=1.8, ms=6)
    ax.axhline(NOMINAL, ls="--", color="#555555", lw=1, label="nominal 0.95")
    ax.set_xlabel("number of published studies k")
    ax.set_ylabel(r"coverage of the true $\mu$")
    ax.set_title("The central pathology: coverage collapses as k grows\n"
                 r"(strong p-step selection, $\tau^2$=0.05)")
    ax.set_ylim(0, 1.04)
    ax.set_xticks(ks)
    ax.legend(fontsize=7.5, loc="center right")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    p = os.path.join(FIGDIR, "fig2_coverage_vs_k.png")
    fig.savefig(p, dpi=160)
    plt.close(fig)
    return p


def fig_leaderboard(results):
    """Coverage vs width on the joint condition: selection cells, k>=15, tau2=0.05.
    Average each method's coverage and width over the four selection scenarios and
    k in {15,25,50}, matching REPORT.md table 2."""
    scenarios = ["step_weak", "step_strong", "copas_weak", "copas_strong"]
    ks = [15, 25, 50]
    methods = ["DL", "REML", "PM", "HKSJ", "VeveaHedges", "Copas", "RoBMA",
               "PET-PEESE", "GRMA", "TrimFill", "NPE", "PVS", "PartialID", "Unified"]
    honest = {"NPE", "PartialID", "Unified", "PVS", "VeveaHedges"}
    cov, wid = {}, {}
    for m in methods:
        cs, ws = [], []
        for sc in scenarios:
            for k in ks:
                r = cell(results, k=k, tau2=0.05, scenario=sc, block="primary")
                if r:
                    cs.append(r["methods"][m]["coverage"])
                    ws.append(r["methods"][m]["mean_width"])
        if cs:
            cov[m] = sum(cs) / len(cs)
            wid[m] = sum(ws) / len(ws)
    fig, ax = plt.subplots(figsize=(6.6, 4.4))
    for m in methods:
        if m not in cov:
            continue
        is_h = m in honest
        ax.scatter(wid[m], cov[m], s=70,
                   color="#2ca02c" if is_h else "#d62728",
                   marker="D" if is_h else "o",
                   edgecolor="black", linewidth=0.5, zorder=3)
        ax.annotate(m, (wid[m], cov[m]), fontsize=7,
                    xytext=(4, 3), textcoords="offset points")
    ax.axhline(NOMINAL, ls="--", color="#555555", lw=1)
    ax.text(ax.get_xlim()[1], NOMINAL + 0.005, "nominal 0.95",
            fontsize=7, color="#555555", ha="right", va="bottom")
    from matplotlib.lines import Line2D
    leg = [Line2D([0], [0], marker="D", color="w", markerfacecolor="#2ca02c",
                  markeredgecolor="black", label="selection-aware / honest", ms=8),
           Line2D([0], [0], marker="o", color="w", markerfacecolor="#d62728",
                  markeredgecolor="black", label="incumbent", ms=8)]
    ax.legend(handles=leg, fontsize=8, loc="lower right")
    ax.set_xlabel("mean 95% interval width")
    ax.set_ylabel(r"mean coverage of the true $\mu$")
    ax.set_title("Joint condition (selection cells, k >= 15): coverage vs width")
    ax.set_ylim(0.4, 1.04)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    p = os.path.join(FIGDIR, "fig3_leaderboard.png")
    fig.savefig(p, dpi=160)
    plt.close(fig)
    return p


def main():
    results = load()
    for fn in (fig_coverage_vs_tau, fig_coverage_vs_k, fig_leaderboard):
        print("wrote", os.path.relpath(fn(results), ROOT))


if __name__ == "__main__":
    main()
