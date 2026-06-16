## 10. Goal 2 — real-data validation (Pairwise70 Cochrane corpus)

No known truth exists on real data, so nothing here is scored as correct — this is a **descriptive** comparison against the classical methods, with REML as the common anchor. Data: study-level log-odds-ratios from the Pairwise70 Cochrane corpus (first analysis per review, binary outcomes, closed-form `escalc(OR)` with 0.5 continuity correction on zero-cell studies). The extraction is **validated**: re-running REML on it reproduces the published SYNTHESIS/REML Pairwise70 benchmark exactly (point and SE abs-diff 0.00000 on all 426 shared reviews; k matches 100%).

**Honest domain caveat.** The estimator was trained on study SE ∈ [0.1, 0.7] (typical of standardized mean differences). Real log-OR study SEs are much larger (median ≈ 1.74; 71% exceed 0.7), so the FULL set is largely OUT of the estimator's training support. We therefore report (a) all reviews and (b) the in-support subset (median study SE ≤ 0.7), and — where available — a real-scale-trained NPE (training SE widened to bracket the data).

Columns: `median dev vs REML` = median |μ̂ − μ̂_REML| (point divergence from the anchor); `median width` = median 95% interval width; `frac excl 0` = how often the CI excludes 0; `sig-agree REML` = same significance call & sign as REML; `contains REML` = CI contains the REML point (coherence).

### Model: canonical (`sbi_model.pkl`)

### All reviews  (n=434 reviews)

| method | n_ok | median dev vs REML | median width | frac excl 0 | sig-agree REML | contains REML |
|---|---|---|---|---|---|---|
| REML | 434 | 0.000 | 1.092 | 0.29 | 1.00 | 1.00 |
| HKSJ | 434 | 0.000 | 1.272 | 0.27 | 0.96 | 1.00 |
| PET-PEESE | 434 | 0.415 | 1.838 | 0.33 | 0.69 | 0.79 |
| TrimFill | 434 | 0.034 | 1.030 | 0.36 | 0.90 | 0.94 |
| VeveaHedges | 434 | 0.107 | 1.120 | 0.33 | 0.85 | 0.92 |
| Copas | 434 | 0.000 | 1.063 | 0.30 | 0.97 | 0.98 |
| NPE | 434 | 0.055 | 0.591 | 0.43 | 0.78 | 0.97 |
| PartialID | 434 | 0.063 | 1.560 | 0.19 | 0.88 | 1.00 |
| PVS | 434 | 0.041 | 1.156 | 0.29 | 0.94 | 0.99 |
| Unified-frozen | 434 | 0.055 | 0.690 | 0.37 | 0.78 | 0.99 |
| Unified-union | 434 | 0.055 | 1.581 | 0.18 | 0.86 | 1.00 |
| Unified-lower | 434 | 0.055 | 1.238 | 0.31 | 0.73 | 0.98 |

### In-support subset (median study SE ≤ 0.7)  (n=136 reviews)

| method | n_ok | median dev vs REML | median width | frac excl 0 | sig-agree REML | contains REML |
|---|---|---|---|---|---|---|
| REML | 136 | 0.000 | 0.541 | 0.53 | 1.00 | 1.00 |
| HKSJ | 136 | 0.003 | 0.658 | 0.46 | 0.93 | 1.00 |
| PET-PEESE | 136 | 0.202 | 0.852 | 0.25 | 0.66 | 0.82 |
| TrimFill | 136 | 0.027 | 0.571 | 0.51 | 0.94 | 0.95 |
| VeveaHedges | 136 | 0.039 | 0.595 | 0.54 | 0.82 | 0.90 |
| Copas | 136 | 0.011 | 0.564 | 0.53 | 0.94 | 0.97 |
| NPE | 136 | 0.060 | 0.630 | 0.48 | 0.88 | 0.93 |
| PartialID | 136 | 0.036 | 0.665 | 0.34 | 0.78 | 1.00 |
| PVS | 136 | 0.019 | 0.599 | 0.49 | 0.92 | 0.99 |
| Unified-frozen | 136 | 0.060 | 0.764 | 0.40 | 0.82 | 0.99 |
| Unified-union | 136 | 0.060 | 0.812 | 0.30 | 0.74 | 1.00 |
| Unified-lower | 136 | 0.060 | 0.771 | 0.32 | 0.74 | 0.96 |

### Model: realscale (`sbi_model_realscale.pkl`)

### All reviews  (n=434 reviews)

| method | n_ok | median dev vs REML | median width | frac excl 0 | sig-agree REML | contains REML |
|---|---|---|---|---|---|---|
| REML | 434 | 0.000 | 1.092 | 0.29 | 1.00 | 1.00 |
| HKSJ | 434 | 0.000 | 1.272 | 0.27 | 0.96 | 1.00 |
| PET-PEESE | 434 | 0.415 | 1.838 | 0.33 | 0.69 | 0.79 |
| TrimFill | 434 | 0.034 | 1.030 | 0.36 | 0.90 | 0.94 |
| VeveaHedges | 434 | 0.107 | 1.120 | 0.33 | 0.85 | 0.92 |
| Copas | 434 | 0.000 | 1.063 | 0.30 | 0.97 | 0.98 |
| NPE | 434 | 0.025 | 0.841 | 0.35 | 0.84 | 0.96 |
| PartialID | 434 | 0.063 | 1.560 | 0.19 | 0.88 | 1.00 |
| PVS | 434 | 0.041 | 1.156 | 0.29 | 0.94 | 0.99 |
| Unified-frozen | 434 | 0.025 | 0.975 | 0.29 | 0.85 | 0.99 |
| Unified-union | 434 | 0.025 | 1.588 | 0.18 | 0.86 | 1.00 |
| Unified-lower | 434 | 0.025 | 1.327 | 0.27 | 0.77 | 0.98 |

### In-support subset (median study SE ≤ 0.7)  (n=136 reviews)

| method | n_ok | median dev vs REML | median width | frac excl 0 | sig-agree REML | contains REML |
|---|---|---|---|---|---|---|
| REML | 136 | 0.000 | 0.541 | 0.53 | 1.00 | 1.00 |
| HKSJ | 136 | 0.003 | 0.658 | 0.46 | 0.93 | 1.00 |
| PET-PEESE | 136 | 0.202 | 0.852 | 0.25 | 0.66 | 0.82 |
| TrimFill | 136 | 0.027 | 0.571 | 0.51 | 0.94 | 0.95 |
| VeveaHedges | 136 | 0.039 | 0.595 | 0.54 | 0.82 | 0.90 |
| Copas | 136 | 0.011 | 0.564 | 0.53 | 0.94 | 0.97 |
| NPE | 136 | 0.018 | 0.709 | 0.47 | 0.88 | 0.93 |
| PartialID | 136 | 0.036 | 0.665 | 0.34 | 0.78 | 1.00 |
| PVS | 136 | 0.019 | 0.599 | 0.49 | 0.92 | 0.99 |
| Unified-frozen | 136 | 0.018 | 0.857 | 0.40 | 0.84 | 0.97 |
| Unified-union | 136 | 0.018 | 0.871 | 0.30 | 0.74 | 1.00 |
| Unified-lower | 136 | 0.018 | 0.855 | 0.32 | 0.74 | 0.96 |


**Reading (descriptive — there is no truth here).** On the **in-support subset** (study SE ≤ 0.7, closest to the estimator's training regime) the unified estimator is competitive with the classical methods: the frozen config's point is within ~0.06 of REML, it contains the REML point on ~99% of reviews, and its interval is modestly conservative (median width ~0.76 vs REML ~0.54). On the **full out-of-support set** (median study SE ≈ 1.74, far beyond training), the learned NPE posterior does NOT expand enough for the domain shift — NPE-alone and the frozen Unified stay *narrower* than REML (≈0.59 / 0.69 vs 1.09) and reject 0 a little more often (≈0.43 / 0.37 vs 0.29), i.e. some residual over-confidence out of support. The frozen gate fires only rarely on this corpus (its ×1.15 NPE interval usually already contains PartialID's point), so it widens NPE only modestly. The **union** interval mode is the conservative fallback that DOES fully widen under the domain shift (median width ≈1.58, contains REML on 100% of reviews) — use it when worst-case robustness to an unmodelled domain matters more than width.

**Real-scale retrain — measured verdict (full-scale, 160k/60k, training SE widened to [0.1, 3.0] to bracket the data; identical corpus size to the canonical model, so the only change is the SE prior).** Matching the support closes the full-set over-confidence: the deployed **Unified-frozen** median interval widens from **0.690 → 0.975** (REML anchor 1.092 — from 63% to 89% of the classical width) and its reject-0 rate falls from **0.369 → 0.288**, now essentially matching REML's 0.295 rather than over-rejecting; NPE-alone moves 0.591 → 0.841 and 0.429 → 0.353 likewise. Crucially the real-scale model tracks REML's honest width (0.975 ≈ 1.092) rather than overshooting it like the union fallback (1.58), while still containing the REML point on ~99% of reviews. **The over-confidence gap is closed, not merely papered over.** The cost is an **in-support precision tax**: on the SE ≤ 0.7 subset the real-scale intervals are ~12% wider (Unified-frozen 0.764 → 0.857), and on the in-support *synthetic* known-truth grid ~18% wider (median) — see the real-scale grid re-validation in §7.1. That grid re-validation confirms the retrain does **not** regress: Unified-frozen still holds ≥0.90 coverage of the true μ on every one of the 55 cells (min 0.936, vs the canonical 0.927) with worst-case type-I 0.032 (vs 0.054). **Frozen decision (see §7.1): keep the canonical `sbi_model.pkl` as the in-support default; ship the grid-validated `sbi_model_realscale.pkl` (selected via `SBI_MODEL_PATH`) as the recommended estimator when the observed median study SE exceeds the canonical support (~0.7), e.g. log-OR-scale corpora — it is a strictly better OOD fix than the union fallback.**

