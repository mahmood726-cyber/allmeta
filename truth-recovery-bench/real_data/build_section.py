"""
build_section.py — Assemble the §10 real-data section (realdata_section.md) from
one or more realdata_results_*.json files, with framing + the validated-
extraction note. report.py appends this file to the REPORT.
"""
import argparse
import json
import os

from summarize_realdata import summarize, fmt_table

HERE = os.path.dirname(os.path.abspath(__file__))

INTRO = (
    "## 10. Goal 2 — real-data validation (Pairwise70 Cochrane corpus)\n\n"
    "No known truth exists on real data, so nothing here is scored as correct — "
    "this is a **descriptive** comparison against the classical methods, with REML "
    "as the common anchor. Data: study-level log-odds-ratios from the Pairwise70 "
    "Cochrane corpus (first analysis per review, binary outcomes, closed-form "
    "`escalc(OR)` with 0.5 continuity correction on zero-cell studies). The "
    "extraction is **validated**: re-running REML on it reproduces the published "
    "SYNTHESIS/REML Pairwise70 benchmark exactly (point and SE abs-diff 0.00000 on "
    "all 426 shared reviews; k matches 100%).\n\n"
    "**Honest domain caveat.** The estimator was trained on study SE ∈ [0.1, 0.7] "
    "(typical of standardized mean differences). Real log-OR study SEs are much "
    "larger (median ≈ 1.74; 71% exceed 0.7), so the FULL set is largely OUT of the "
    "estimator's training support. We therefore report (a) all reviews and (b) the "
    "in-support subset (median study SE ≤ 0.7), and — where available — a "
    "real-scale-trained NPE (training SE widened to bracket the data).\n\n"
    "Columns: `median dev vs REML` = median |μ̂ − μ̂_REML| (point divergence from "
    "the anchor); `median width` = median 95% interval width; `frac excl 0` = how "
    "often the CI excludes 0; `sig-agree REML` = same significance call & sign as "
    "REML; `contains REML` = CI contains the REML point (coherence).\n"
)

# Plain-English reading of what the numbers mean (kept honest/measured).
TAKEAWAY = (
    "\n**Reading (descriptive — there is no truth here).** On the **in-support "
    "subset** (study SE ≤ 0.7, closest to the estimator's training regime) the "
    "unified estimator is competitive with the classical methods: the frozen "
    "config's point is within ~0.06 of REML, it contains the REML point on ~99% "
    "of reviews, and its interval is modestly conservative (median width ~0.76 vs "
    "REML ~0.54). On the **full out-of-support set** (median study SE ≈ 1.74, far "
    "beyond training), the learned NPE posterior does NOT expand enough for the "
    "domain shift — NPE-alone and the frozen Unified stay *narrower* than REML "
    "(≈0.59 / 0.69 vs 1.09) and reject 0 a little more often (≈0.43 / 0.37 vs "
    "0.29), i.e. some residual over-confidence out of support. The frozen gate "
    "fires only rarely on this corpus (its ×1.15 NPE interval usually already "
    "contains PartialID's point), so it widens NPE only modestly. The **union** "
    "interval mode is the conservative fallback that DOES fully widen under the "
    "domain shift (median width ≈1.58, contains REML on 100% of reviews) — use it "
    "when worst-case robustness to an unmodelled domain matters more than width.\n\n"
    "**Real-scale retrain — measured verdict (full-scale, 160k/60k, training SE "
    "widened to [0.1, 3.0] to bracket the data; identical corpus size to the "
    "canonical model, so the only change is the SE prior).** Matching the support "
    "closes the full-set over-confidence: the deployed **Unified-frozen** median "
    "interval widens from **0.690 → 0.975** (REML anchor 1.092 — from 63% to 89% "
    "of the classical width) and its reject-0 rate falls from **0.369 → 0.288**, "
    "now essentially matching REML's 0.295 rather than over-rejecting; NPE-alone "
    "moves 0.591 → 0.841 and 0.429 → 0.353 likewise. Crucially the real-scale "
    "model tracks REML's honest width (0.975 ≈ 1.092) rather than overshooting it "
    "like the union fallback (1.58), while still containing the REML point on "
    "~99% of reviews. **The over-confidence gap is closed, not merely papered "
    "over.** The cost is an **in-support precision tax**: on the SE ≤ 0.7 subset "
    "the real-scale intervals are ~12% wider (Unified-frozen 0.764 → 0.857), and "
    "on the in-support *synthetic* known-truth grid ~18% wider (median) — see the "
    "real-scale grid re-validation in §7.1. That grid re-validation confirms the "
    "retrain does **not** regress: Unified-frozen still holds ≥0.90 coverage of "
    "the true μ on every one of the 55 cells (min 0.936, vs the canonical 0.927) "
    "with worst-case type-I 0.032 (vs 0.054). **Frozen decision (see §7.1): keep "
    "the canonical `sbi_model.pkl` as the in-support default; ship the "
    "grid-validated `sbi_model_realscale.pkl` (selected via `SBI_MODEL_PATH`) as "
    "the recommended estimator when the observed median study SE exceeds the "
    "canonical support (~0.7), e.g. log-OR-scale corpora — it is a strictly "
    "better OOD fix than the union fallback.**\n"
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--canonical", default=os.path.join(HERE, "realdata_results_canonical.json"))
    ap.add_argument("--realscale", default=os.path.join(HERE, "realdata_results_realscale.json"))
    ap.add_argument("--out", default=os.path.join(HERE, "realdata_section.md"))
    args = ap.parse_args()
    parts = [INTRO]
    for tag, path in [("canonical", args.canonical), ("realscale", args.realscale)]:
        if not os.path.exists(path):
            continue
        d = json.load(open(path))
        res = d["results"]
        full, nf = summarize(res)
        insup, ni = summarize(res, subset=lambda r: r["median_se"] <= 0.7)
        # show only the artifact basename — never a machine-specific abs path in
        # the committed report.
        model_disp = os.path.basename(d["meta"]["model_path"])
        parts.append(f"### Model: {tag} (`{model_disp}`)\n")
        parts.append(fmt_table(full, nf, "All reviews"))
        parts.append("")
        parts.append(fmt_table(insup, ni, "In-support subset (median study SE ≤ 0.7)"))
        parts.append("")
    parts.append(TAKEAWAY)
    md = "\n".join(parts)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(md + "\n")
    print(f"[wrote] {args.out} ({len(md)} chars)")


if __name__ == "__main__":
    main()
