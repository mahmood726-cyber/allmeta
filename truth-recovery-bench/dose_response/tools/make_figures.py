"""
make_figures.py -- regenerate the dose-response manuscript figures from the
committed measured results JSON (results_dose_full.json). Deterministic: reads
numbers only, draws no random samples. Run via `python tools/make_figures.py`
or the Makefile `figures` target. Output -> paper/figures/*.png.
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RESULTS = os.path.join(ROOT, "results_dose_full.json")
FIGDIR = os.path.join(ROOT, "paper", "figures")
os.makedirs(FIGDIR, exist_ok=True)

NOMINAL = 0.95
METHODS = [("NaiveFE", "#d62728", "o", "NaiveFE (tau2 ignored)"),
           ("DL", "#ff7f0e", "s", "DL + z"),
           ("REML_HK", "#2ca02c", "^", "REML + Knapp-Hartung"),
           ("OneStage", "#1f77b4", "D", "One-stage REML")]


def load():
    with open(RESULTS, encoding="utf-8") as f:
        return json.load(f)["results"]


def cell(results, **kw):
    for r in results:
        c = r["cell"]
        if all(c.get(k) == v for k, v in kw.items()):
            return r
    return None


def fig_coverage_vs_tau(results):
    taus = [0.0, 0.05, 0.15, 0.30]
    fig, ax = plt.subplots(figsize=(6.2, 4.0))
    for key, col, mk, lab in METHODS:
        ys = []
        for t in taus:
            r = cell(results, k=10, tau2=t, curve="linear", scenario="none")
            ys.append(r["coverage_slope"][key] if r else None)
        ax.plot(taus, ys, marker=mk, color=col, label=lab, lw=1.8, ms=6)
    ax.axhline(NOMINAL, ls="--", color="#555555", lw=1, label="nominal 0.95")
    ax.set_xlabel(r"true between-study slope variance $\tau^2$")
    ax.set_ylabel("coverage of true slope $\\beta$")
    ax.set_title("Slope coverage as heterogeneity rises (k = 10)")
    ax.set_ylim(0, 1.02)
    ax.legend(fontsize=8, loc="lower left")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    p = os.path.join(FIGDIR, "fig1_coverage_vs_tau.png")
    fig.savefig(p, dpi=160)
    plt.close(fig)
    return p


def fig_width_vs_tau(results):
    taus = [0.0, 0.05, 0.15, 0.30]
    fig, ax = plt.subplots(figsize=(6.2, 4.0))
    for key, col, mk, lab in METHODS:
        ys = []
        for t in taus:
            r = cell(results, k=10, tau2=t, curve="linear", scenario="none")
            ys.append(r["width_slope"][key] if r else None)
        ax.plot(taus, ys, marker=mk, color=col, label=lab, lw=1.8, ms=6)
    ax.set_xlabel(r"true between-study slope variance $\tau^2$")
    ax.set_ylabel("mean 95% interval width")
    ax.set_title("The honest cost of coverage: interval width (k = 10)")
    ax.legend(fontsize=8, loc="upper left")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    p = os.path.join(FIGDIR, "fig2_width_vs_tau.png")
    fig.savefig(p, dpi=160)
    plt.close(fig)
    return p


def fig_curve_coverage(results):
    combos = [(k, g) for g in (-0.03, -0.06) for k in (10, 20)]
    labels = [f"k={k}\n$\\gamma$={g}" for (k, g) in combos]
    lin, quad = [], []
    for (k, g) in combos:
        r = cell(results, k=k, gamma=g, curve="quadratic")
        lin.append(r["coverage_curve"]["LinearFit"] if r else 0)
        quad.append(r["coverage_curve"]["QuadFit"] if r else 0)
    x = range(len(combos))
    w = 0.38
    fig, ax = plt.subplots(figsize=(6.2, 4.0))
    ax.bar([i - w / 2 for i in x], lin, w, color="#d62728", label="Linear fit (misspecified)")
    ax.bar([i + w / 2 for i in x], quad, w, color="#2ca02c", label="Quadratic multivariate fit")
    ax.axhline(NOMINAL, ls="--", color="#555555", lw=1, label="nominal 0.95")
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels, fontsize=8)
    ax.set_ylabel("curve coverage at test doses")
    ax.set_title("Nonlinearity: linear-fit collapse vs quadratic recovery")
    ax.set_ylim(0, 1.02)
    ax.legend(fontsize=8, loc="lower right")
    ax.grid(alpha=0.3, axis="y")
    fig.tight_layout()
    p = os.path.join(FIGDIR, "fig3_curve_coverage.png")
    fig.savefig(p, dpi=160)
    plt.close(fig)
    return p


def main():
    results = load()
    for fn in (fig_coverage_vs_tau, fig_width_vs_tau, fig_curve_coverage):
        print("wrote", os.path.relpath(fn(results), ROOT))


if __name__ == "__main__":
    main()
