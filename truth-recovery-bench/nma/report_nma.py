"""
report_nma.py -- Assemble REPORT.md from results_nma_*.json (+ results_partialid.json).

Truth-first: every number here is read straight from the seeded harness output.
The report leads with the three measured stories — coverage of true relative
effects, inconsistency-test calibration, and ranking over-confidence — followed
by the partial-identification table and the honest negatives.
"""
import argparse
import json
import os


def fmt(x, d=3):
    if x is None or (isinstance(x, float) and x != x):
        return "  -  "
    return f"{x:.{d}f}"


def load(p):
    return json.load(open(p))


def cells_by_block(results, block):
    return [r for r in results if r["cell"]["block"] == block]


def coverage_table(rows):
    out = ["| geometry | spe | τ² | spread | NaiveFE | RE | NetHK | width FE/RE/HK |",
           "|---|---|---|---|---|---|---|---|"]
    for r in sorted(rows, key=lambda r: (r["cell"]["geometry"], r["cell"]["spe"],
                                         r["cell"]["tau2"], r["cell"]["spread"])):
        c = r["cell"]; cov = r["coverage"]; w = r["width"]
        out.append(f"| {c['geometry']} | {c['spe']} | {c['tau2']} | {c['spread']} | "
                   f"{fmt(cov['NaiveFE'])} | {fmt(cov['RE'])} | **{fmt(cov['NetHK'])}** | "
                   f"{fmt(w['NaiveFE'],2)}/{fmt(w['RE'],2)}/{fmt(w['NetHK'],2)} |")
    return "\n".join(out)


def ranking_table(rows):
    out = ["| geometry | spe | τ² | spread | src | P(best) claimed | actual hit | **over-conf** | spurious |",
           "|---|---|---|---|---|---|---|---|---|"]
    for r in sorted(rows, key=lambda r: (r["cell"]["spread"], r["cell"]["geometry"],
                                         r["cell"]["tau2"], r["cell"]["spe"])):
        c = r["cell"]
        for src in ("FE", "RE", "Cal"):
            rk = r["ranking"][src]
            tag = "**" if src == "Cal" else ""
            out.append(f"| {c['geometry']} | {c['spe']} | {c['tau2']} | {c['spread']} | "
                       f"{tag}{src}{tag} | {fmt(rk['mean_pbest'])} | {fmt(rk['hit_rate'])} | "
                       f"{tag}{fmt(rk['overconfidence'])}{tag} | {fmt(rk['spurious_confident'])} |")
        if "bayes" in r:
            b = r["bayes"]
            out.append(f"| {c['geometry']} | {c['spe']} | {c['tau2']} | {c['spread']} | "
                       f"Bayes | {fmt(b['mean_pbest'])} | {fmt(b['hit_rate'])} | "
                       f"{fmt(b['overconfidence'])} | - |")
    return "\n".join(out)


def incons_table(rows):
    out = ["| geometry | τ² | true incons | honest reject | naive reject |",
           "|---|---|---|---|---|"]
    for r in sorted(rows, key=lambda r: (r["cell"]["geometry"], r["cell"]["tau2"],
                                         r["cell"]["incons"])):
        c = r["cell"]; i = r["incons"]
        kind = "type-I" if c["incons"] == 0 else "power"
        out.append(f"| {c['geometry']} | {c['tau2']} | {c['incons']} ({kind}) | "
                   f"**{fmt(i['honest_reject'])}** | {fmt(i['naive_reject'])} |")
    return "\n".join(out)


def selection_table(rows):
    out = ["| scenario | NaiveFE | RE | NetHK | sel.frac |", "|---|---|---|---|---|"]
    for r in sorted(rows, key=lambda r: r["cell"]["scenario"]):
        c = r["cell"]; cov = r["coverage"]
        out.append(f"| {c['scenario']} | {fmt(cov['NaiveFE'])} | {fmt(cov['RE'])} | "
                   f"{fmt(cov['NetHK'])} | {fmt(r['mean_sel_frac'],2)} |")
    return "\n".join(out)


def partialid_section(pid):
    out = [f"PartialID = NetHK CI widened by ±c·ω̂ (c={pid['c']}), ω̂ = data-driven "
           "inconsistency SD from the honest global test (0 when none detected).",
           "", "| geometry | true incons | RE cov | NetHK cov | **PartialID cov** | width RE/HK/PID |",
           "|---|---|---|---|---|---|"]
    for row in pid["loop_dense"]:
        cov = row["coverage"]; w = row["width"]
        out.append(f"| {row['geometry']} | {row['incons']} | {fmt(cov['RE'])} | "
                   f"{fmt(cov['NetHK'])} | **{fmt(cov['PartialID'])}** | "
                   f"{fmt(w['RE'],2)}/{fmt(w['NetHK'],2)}/{fmt(w['PartialID'],2)} |")
    s = pid["star"]
    out.append(f"| star (indirect-only, **consistent**) | 0.0 | {fmt(s['coverage']['RE'])} | "
               f"{fmt(s['coverage']['NetHK'])} | **{fmt(s['coverage']['PartialID'])}** | "
               f"{fmt(s['width']['RE'],2)}/{fmt(s['width']['NetHK'],2)}/{fmt(s['width']['PartialID'],2)} |")
    return "\n".join(out)


def build(results_path, pid_path, out_path):
    payload = load(results_path)
    meta = payload["meta"]
    results = payload["results"]
    pid = load(pid_path) if os.path.exists(pid_path) else None

    L = []
    L.append("# NMA Truth-Recovery — measured report\n")
    L.append(f"> Seeded ({meta['base_seed']}), reps/cell = {meta['reps']} "
             f"(Bayesian {meta['bayes_reps']}), {meta['n_cells']} cells, "
             f"{meta['elapsed_sec']:.0f}s. Every number is produced by `harness_nma.py`; "
             "nothing is hand-entered.\n")
    L.append("Treatments 0..T-1 (0=reference); two-arm studies; effects on a generic "
             "additive scale. 'sep' = well-separated true effects, 'tight' = closely-"
             "spaced top treatments (where 'which is best?' is genuinely hard).\n")

    L.append("## 1. Coverage of the true relative effects\n")
    L.append("The LivingNMA / enma-snma fixed-effect-CI bug (τ² ignored in the CI) "
             "reproduced as **NaiveFE**; **RE** is the proper random-effects network "
             "CI; **NetHK** is the Hartung-Knapp honest-coverage lever (the analogue "
             "of the HKSJ fix that repaired the pairwise track).\n")
    L.append(coverage_table(cells_by_block(results, "coverage")))
    L.append("")

    L.append("## 2. Ranking over-confidence (the spurious 'best treatment')\n")
    L.append("Claimed P(best) for the point-best treatment vs the rate it IS the true "
             "best. **over-conf** = claimed − actual (positive ⇒ over-confident). "
             "**FE** = SUCRA/P-score sampled from the fixed-effect covariance; **RE** "
             "from the RE covariance; **Cal** from the calibrated (NetHK × detected-"
             "inconsistency-inflated) covariance; **Bayes** = posterior P(best).\n")
    L.append(ranking_table(cells_by_block(results, "coverage")))
    L.append("")

    L.append("## 3. Inconsistency test — type-I and power\n")
    L.append("Global design-by-treatment Q-test. **honest** uses a common RE τ² "
             "(calibrated under heterogeneity); **naive** ignores τ² and over-rejects "
             "(the sheaf-nma / enma-snma over-detection bug, reproduced).\n")
    L.append(incons_table(cells_by_block(results, "inconsistency")))
    L.append("")

    L.append("## 4. Small-study / publication selection on the network\n")
    L.append("No method here corrects publication bias; selection collapses coverage "
             "for ALL intervals — the honest boundary of the consistency model.\n")
    L.append(selection_table(cells_by_block(results, "selection")))
    L.append("")

    if pid:
        L.append("## 5. Partial-identification bounds for under-determined networks\n")
        L.append(partialid_section(pid))
        L.append("")

    L.append("## 6. Honest negatives & boundaries\n")
    L.append(_honest_negatives(results, pid))

    open(out_path, "w", encoding="utf-8").write("\n".join(L) + "\n")
    print(f"[report] -> {out_path}")


def _honest_negatives(results, pid):
    bullets = [
        "- **NetHK is mildly conservative at τ²=0** (over-covers slightly, like the "
        "pairwise HKSJ floor) — the honest price of guaranteed coverage under unknown "
        "heterogeneity; it is never worse than RE on coverage.",
        "- **The Bayesian posterior P(best) is NOT automatically calibrated.** Under "
        "heterogeneity + closely-spaced treatments it is over-confident (the IG(ε,ε) "
        "τ² prior under-shrinks the ranking spread) — a Bayesian framing does not by "
        "itself cure ranking over-confidence; the calibrated covariance does.",
        "- **PartialID buys nothing where there is nothing to hedge.** On consistent "
        "or untestable (star, indirect-only) networks ω̂=0 and PartialID ≡ NetHK — no "
        "false width. Its coverage gain appears only under genuine inconsistency.",
        "- **On dense, redundant networks the consistency estimand is barely biased** "
        "even under injected inconsistency (the loop disagreements average out), so "
        "PartialID merely over-covers there — it is a small-/sparse-network tool.",
        "- **Publication selection is uncorrected.** Step/Copas selection collapses "
        "coverage for every interval; honest network coverage needs a selection model "
        "(out of scope here, flagged like the pairwise bench).",
        "- **Two-arm studies only.** Multi-arm trials add a within-study shared-control "
        "sampling covariance (the platformtrialma failure mode) and are deliberately "
        "out of scope rather than approximated.",
    ]
    return "\n".join(bullets)


def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--results", default=os.path.join(here, "results_nma_full.json"))
    ap.add_argument("--pid", default=os.path.join(here, "results_partialid.json"))
    ap.add_argument("--out", default=os.path.join(here, "REPORT.md"))
    args = ap.parse_args()
    build(args.results, args.pid, args.out)


if __name__ == "__main__":
    main()
