"""
make_figures.py -- regenerate the DTA manuscript figures from the committed
measured results JSON (results_dta_full.json and results_partialid.json).
Deterministic: reads numbers only, draws no random samples. Run via
`python tools/make_figures.py` or the Makefile `figures` target.
Output -> paper/figures/*.png.
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RESULTS = os.path.join(ROOT, "results_dta_full.json")
PARTIALID = os.path.join(ROOT, "results_partialid.json")
FIGDIR = os.path.join(ROOT, "paper", "figures")
os.makedirs(FIGDIR, exist_ok=True)

NOMINAL = 0.95
# (json key, colour, marker, legend label)
METHODS = [("NaiveFE", "#d62728", "o", "NaiveFE (tau2 ignored)"),
           ("UnivDL", "#ff7f0e", "s", "UnivDL (per-margin tau2)"),
           ("Bivariate", "#9467bd", "^", "Bivariate (Reitsma RE)"),
           ("BivarHK", "#2ca02c", "D", "Bivariate + Hartung-Knapp")]


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def cell(results, **kw):
    for r in results:
        c = r["cell"]
        if all(c.get(k) == v for k, v in kw.items()):
            return r
    return None


def fig_coverage_vs_tau(results):
    """Joint coverage of the true (Se,Sp) point vs heterogeneity at k=8 -- the
    correlation-ignoring NaiveFE collapse vs the bivariate/HK recovery."""
    taus = [0.0, 0.25, 0.5, 0.8]
    fig, ax = plt.subplots(figsize=(6.2, 4.0))
    for key, col, mk, lab in METHODS:
        ys = []
        for t in taus:
            r = cell(results, block="coverage", k=8, tau_se=t)
            ys.append(r["coverage_joint"][key] if r else None)
        ax.plot(taus, ys, marker=mk, color=col, label=lab, lw=1.8, ms=6)
    ax.axhline(NOMINAL, ls="--", color="#555555", lw=1, label="nominal 0.95")
    ax.set_xlabel(r"true between-study SD $\tau_{Se}=\tau_{Sp}$")
    ax.set_ylabel("joint coverage of true (Se, Sp) point")
    ax.set_title("Joint coverage as heterogeneity rises (k = 8)")
    ax.set_ylim(0, 1.02)
    ax.legend(fontsize=8, loc="lower left")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    p = os.path.join(FIGDIR, "fig1_coverage_vs_tau.png")
    fig.savefig(p, dpi=160)
    plt.close(fig)
    return p


def fig_threshold(results):
    """Threshold variation: as the Spearman(logitSe, logitFPR) climbs, NaiveFE Se
    coverage collapses while BivarHK holds; AUC recovery improves with spread."""
    thr = [0.0, 0.3, 0.6, 1.0]
    spear, fe, hk, auc = [], [], [], []
    for t in thr:
        r = cell(results, block="threshold", thresh=t)
        spear.append(r["mean_spearman"])
        fe.append(r["coverage_se"]["NaiveFE"])
        hk.append(r["coverage_se"]["BivarHK"])
        auc.append(r["auc_abs_err"])
    fig, ax1 = plt.subplots(figsize=(6.2, 4.0))
    ax1.plot(spear, fe, marker="o", color="#d62728", lw=1.8, ms=6,
             label="NaiveFE Se coverage")
    ax1.plot(spear, hk, marker="D", color="#2ca02c", lw=1.8, ms=6,
             label="BivarHK Se coverage")
    ax1.axhline(NOMINAL, ls="--", color="#555555", lw=1, label="nominal 0.95")
    ax1.set_xlabel(r"threshold-effect Spearman $\rho$(logit Se, logit FPR)")
    ax1.set_ylabel("Se coverage")
    ax1.set_ylim(0, 1.02)
    ax2 = ax1.twinx()
    ax2.plot(spear, auc, marker="s", color="#1f77b4", lw=1.2, ms=5, ls=":",
             label="SROC AUC abs. error")
    ax2.set_ylabel("|recovered AUC - true AUC|", color="#1f77b4")
    ax2.tick_params(axis="y", labelcolor="#1f77b4")
    ax2.set_ylim(0, max(auc) * 1.4 + 1e-6)
    ax1.set_title("Threshold variation: naive collapse, bivariate recovery (k = 15)")
    h1, l1 = ax1.get_legend_handles_labels()
    h2, l2 = ax2.get_legend_handles_labels()
    ax1.legend(h1 + h2, l1 + l2, fontsize=8, loc="lower left")
    ax1.grid(alpha=0.3)
    fig.tight_layout()
    p = os.path.join(FIGDIR, "fig2_threshold.png")
    fig.savefig(p, dpi=160)
    plt.close(fig)
    return p


def fig_partialid(pid):
    """Partial-ID of the off-summary operating point vs k: the over-confident
    plug-in interval vs the partial-ID bracket (improves but stays sub-nominal),
    with the honest width cost on a second axis."""
    by_k = pid["by_k"]
    ks = [d["k"] for d in by_k]
    plug = [d["coverage"]["plugin"] for d in by_k]
    pidc = [d["coverage"]["PartialID"] for d in by_k]
    wplug = [d["width"]["plugin"] for d in by_k]
    wpid = [d["width"]["PartialID"] for d in by_k]
    fig, ax1 = plt.subplots(figsize=(6.2, 4.0))
    ax1.plot(ks, plug, marker="o", color="#d62728", lw=1.8, ms=6,
             label="plug-in SROC coverage")
    ax1.plot(ks, pidc, marker="D", color="#2ca02c", lw=1.8, ms=6,
             label="partial-ID bracket coverage")
    ax1.axhline(NOMINAL, ls="--", color="#555555", lw=1, label="nominal 0.95")
    ax1.set_xlabel("number of studies k")
    ax1.set_ylabel("coverage of Se at a target FPR")
    ax1.set_ylim(0, 1.02)
    ax2 = ax1.twinx()
    ax2.plot(ks, wplug, marker="o", color="#d62728", lw=1.0, ms=4, ls=":",
             alpha=0.6, label="plug-in width")
    ax2.plot(ks, wpid, marker="D", color="#2ca02c", lw=1.0, ms=4, ls=":",
             alpha=0.6, label="partial-ID width")
    ax2.set_ylabel("mean interval width (Se scale)")
    ax2.set_ylim(0, max(wpid + wplug) * 1.5)
    ax1.set_title("Off-summary operating point: partially identified (sub-nominal)")
    h1, l1 = ax1.get_legend_handles_labels()
    h2, l2 = ax2.get_legend_handles_labels()
    ax1.legend(h1 + h2, l1 + l2, fontsize=7.5, loc="center right")
    ax1.grid(alpha=0.3)
    fig.tight_layout()
    p = os.path.join(FIGDIR, "fig3_partialid.png")
    fig.savefig(p, dpi=160)
    plt.close(fig)
    return p


def main():
    results = load(RESULTS)["results"]
    pid = load(PARTIALID)
    print("wrote", os.path.relpath(fig_coverage_vs_tau(results), ROOT))
    print("wrote", os.path.relpath(fig_threshold(results), ROOT))
    print("wrote", os.path.relpath(fig_partialid(pid), ROOT))


if __name__ == "__main__":
    main()
