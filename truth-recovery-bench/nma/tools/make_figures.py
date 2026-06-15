"""
make_figures.py -- regenerate the NMA manuscript figures from the committed
measured results JSON (results_nma_full.json + results_partialid.json).
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
RESULTS = os.path.join(ROOT, "results_nma_full.json")
PARTIALID = os.path.join(ROOT, "results_partialid.json")
FIGDIR = os.path.join(ROOT, "paper", "figures")
os.makedirs(FIGDIR, exist_ok=True)

NOMINAL = 0.95


def load_full():
    with open(RESULTS, encoding="utf-8") as f:
        return json.load(f)["results"]


def load_partialid():
    with open(PARTIALID, encoding="utf-8") as f:
        return json.load(f)


def cell(results, block=None, **kw):
    for r in results:
        c = r["cell"]
        if block is not None and c.get("block") != block:
            continue
        if all(c.get(k) == v for k, v in kw.items()):
            return r
    return None


# ---------------------------------------------------------------------------
# Figure 1 -- coverage of the true relative effects vs tau2 (the FE-CI bug + fix)
# ---------------------------------------------------------------------------
def fig_coverage_vs_tau(results):
    taus = [0.0, 0.05, 0.15]
    methods = [("NaiveFE", "#d62728", "o", "NaiveFE (tau2 ignored)"),
               ("RE", "#ff7f0e", "s", "RE (random-effects CI)"),
               ("NetHK", "#2ca02c", "^", "NetHK (Hartung-Knapp)")]
    fig, ax = plt.subplots(figsize=(6.2, 4.0))
    for key, col, mk, lab in methods:
        ys = []
        for t in taus:
            r = cell(results, block="coverage", geometry="dense", spe=5,
                     tau2=t, spread="sep")
            ys.append(r["coverage"][key] if r else None)
        ax.plot(taus, ys, marker=mk, color=col, label=lab, lw=1.8, ms=7)
    ax.axhline(NOMINAL, ls="--", color="#555555", lw=1, label="nominal 0.95")
    ax.set_xlabel(r"true between-study variance $\tau^2$")
    ax.set_ylabel("coverage of true relative effects $d_{ab}$")
    ax.set_title("Network-CI coverage as heterogeneity rises\n(dense, 5 studies/edge, well-separated truth)")
    ax.set_ylim(0.45, 1.02)
    ax.set_xticks(taus)
    ax.legend(fontsize=8, loc="lower left")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    p = os.path.join(FIGDIR, "fig1_coverage_vs_tau.png")
    fig.savefig(p, dpi=160)
    plt.close(fig)
    return p


# ---------------------------------------------------------------------------
# Figure 2 -- inconsistency-test type-I: honest vs naive across geometries
# ---------------------------------------------------------------------------
def fig_inconsistency_typeI(results):
    combos = [("loop", 0.05), ("loop", 0.15),
              ("ladder", 0.05), ("ladder", 0.15),
              ("dense", 0.05), ("dense", 0.15)]
    labels = [f"{g}\n$\\tau^2$={t}" for (g, t) in combos]
    honest, naive = [], []
    for (g, t) in combos:
        r = cell(results, block="inconsistency", geometry=g, tau2=t, incons=0.0)
        honest.append(r["incons"]["honest_reject"] if r else 0)
        naive.append(r["incons"]["naive_reject"] if r else 0)
    x = range(len(combos))
    w = 0.38
    fig, ax = plt.subplots(figsize=(6.6, 4.0))
    ax.bar([i - w / 2 for i in x], naive, w, color="#d62728",
           label="naive ($\\tau^2$-ignoring) -- over-rejects")
    ax.bar([i + w / 2 for i in x], honest, w, color="#2ca02c",
           label="honest (common-$\\tau^2$ RE) -- calibrated")
    ax.axhline(0.05, ls="--", color="#555555", lw=1, label="nominal type-I 0.05")
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels, fontsize=8)
    ax.set_ylabel("type-I rejection rate (no true inconsistency)")
    ax.set_title("Inconsistency-test calibration: the $\\tau^2$-ignoring over-detector vs the honest test")
    ax.set_ylim(0, 1.0)
    ax.legend(fontsize=8, loc="upper right")
    ax.grid(alpha=0.3, axis="y")
    fig.tight_layout()
    p = os.path.join(FIGDIR, "fig2_inconsistency_typeI.png")
    fig.savefig(p, dpi=160)
    plt.close(fig)
    return p


# ---------------------------------------------------------------------------
# Figure 3 -- partial-identification coverage across the inconsistency ladder
# ---------------------------------------------------------------------------
def fig_partialid(pid):
    rows = [r for r in pid["loop_dense"] if r["geometry"] == "loop"]
    rows = sorted(rows, key=lambda r: r["incons"])
    xs = [r["incons"] for r in rows]
    re = [r["coverage"]["RE"] for r in rows]
    hk = [r["coverage"]["NetHK"] for r in rows]
    pidc = [r["coverage"]["PartialID"] for r in rows]
    fig, ax = plt.subplots(figsize=(6.2, 4.0))
    ax.plot(xs, re, marker="o", color="#ff7f0e", lw=1.8, ms=7, label="RE")
    ax.plot(xs, hk, marker="s", color="#1f77b4", lw=1.8, ms=7, label="NetHK")
    ax.plot(xs, pidc, marker="^", color="#2ca02c", lw=2.0, ms=8,
            label=r"PartialID (NetHK $\pm\,c\,\hat\omega$)")
    ax.axhline(NOMINAL, ls="--", color="#555555", lw=1, label="nominal 0.95")
    ax.set_xlabel(r"true loop inconsistency $\delta$")
    ax.set_ylabel("coverage of the consistency truth $d_{ab}$")
    ax.set_title("Partial-identification bounds restore coverage under inconsistency\n(loop network)")
    ax.set_ylim(0.6, 1.02)
    ax.set_xticks(xs)
    ax.legend(fontsize=8, loc="lower left")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    p = os.path.join(FIGDIR, "fig3_partialid_coverage.png")
    fig.savefig(p, dpi=160)
    plt.close(fig)
    return p


def main():
    results = load_full()
    pid = load_partialid()
    print("wrote", os.path.relpath(fig_coverage_vs_tau(results), ROOT))
    print("wrote", os.path.relpath(fig_inconsistency_typeI(results), ROOT))
    print("wrote", os.path.relpath(fig_partialid(pid), ROOT))


if __name__ == "__main__":
    main()
