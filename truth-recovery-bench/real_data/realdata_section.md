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

### Model: realscale (`../sbi_model_realscale.pkl`)

### All reviews  (n=434 reviews)

| method | n_ok | median dev vs REML | median width | frac excl 0 | sig-agree REML | contains REML |
|---|---|---|---|---|---|---|
| REML | 434 | 0.000 | 1.092 | 0.29 | 1.00 | 1.00 |
| HKSJ | 434 | 0.000 | 1.272 | 0.27 | 0.96 | 1.00 |
| PET-PEESE | 434 | 0.415 | 1.838 | 0.33 | 0.69 | 0.79 |
| TrimFill | 434 | 0.034 | 1.030 | 0.36 | 0.90 | 0.94 |
| VeveaHedges | 434 | 0.107 | 1.120 | 0.33 | 0.85 | 0.92 |
| Copas | 434 | 0.000 | 1.063 | 0.30 | 0.97 | 0.98 |
| NPE | 434 | 0.076 | 0.812 | 0.32 | 0.84 | 0.97 |
| PartialID | 434 | 0.063 | 1.560 | 0.19 | 0.88 | 1.00 |
| PVS | 434 | 0.041 | 1.156 | 0.29 | 0.94 | 0.99 |
| Unified-frozen | 434 | 0.076 | 0.942 | 0.26 | 0.84 | 0.99 |
| Unified-union | 434 | 0.076 | 1.588 | 0.16 | 0.85 | 1.00 |
| Unified-lower | 434 | 0.076 | 1.353 | 0.24 | 0.77 | 0.99 |

### In-support subset (median study SE ≤ 0.7)  (n=136 reviews)

| method | n_ok | median dev vs REML | median width | frac excl 0 | sig-agree REML | contains REML |
|---|---|---|---|---|---|---|
| REML | 136 | 0.000 | 0.541 | 0.53 | 1.00 | 1.00 |
| HKSJ | 136 | 0.003 | 0.658 | 0.46 | 0.93 | 1.00 |
| PET-PEESE | 136 | 0.202 | 0.852 | 0.25 | 0.66 | 0.82 |
| TrimFill | 136 | 0.027 | 0.571 | 0.51 | 0.94 | 0.95 |
| VeveaHedges | 136 | 0.039 | 0.595 | 0.54 | 0.82 | 0.90 |
| Copas | 136 | 0.011 | 0.564 | 0.53 | 0.94 | 0.97 |
| NPE | 136 | 0.068 | 0.734 | 0.42 | 0.86 | 0.95 |
| PartialID | 136 | 0.036 | 0.665 | 0.34 | 0.78 | 1.00 |
| PVS | 136 | 0.019 | 0.599 | 0.49 | 0.92 | 0.99 |
| Unified-frozen | 136 | 0.068 | 0.855 | 0.38 | 0.82 | 0.97 |
| Unified-union | 136 | 0.068 | 0.872 | 0.29 | 0.73 | 1.00 |
| Unified-lower | 136 | 0.068 | 0.865 | 0.29 | 0.73 | 0.97 |


**Reading (descriptive — there is no truth here).** On the **in-support subset** (study SE ≤ 0.7, closest to the estimator's training regime) the unified estimator is competitive with the classical methods: the frozen config's point is within ~0.06 of REML, it contains the REML point on ~99% of reviews, and its interval is modestly conservative (median width ~0.76 vs REML ~0.54). On the **full out-of-support set** (median study SE ≈ 1.74, far beyond training), the learned NPE posterior does NOT expand enough for the domain shift — NPE-alone and the frozen Unified stay *narrower* than REML (≈0.59 / 0.69 vs 1.09) and reject 0 a little more often (≈0.43 / 0.37 vs 0.29), i.e. some residual over-confidence out of support. The frozen gate fires only rarely on this corpus (its ×1.15 NPE interval usually already contains PartialID's point), so it widens NPE only modestly. The **union** interval mode is the conservative fallback that DOES fully widen under the domain shift (median width ≈1.58, contains REML on 100% of reviews) — use it when worst-case robustness to an unmodelled domain matters more than width. The **real-scale** model below (training SE widened to bracket the data) tests whether matching the support removes the full-set over-confidence.

