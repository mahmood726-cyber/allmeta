# Strict Beat-R Benchmark

Generated: 2026-03-07T15:29:39+00:00
Seed: 20260307
Datasets requested: 20

## Outcome
- Beats R under strict criteria: True
- Comparable datasets: 20/20
- Our fail rate: 0.0000
- R fail rate: 0.0000
- Median runtime (ours ms): 94.10804400249617
- Median runtime (R ms): 235.0
- Runtime speedup (R/ours): 2.497129788328899

## Accuracy
- p95 |beta diff|: 0.00467664624270156
- p95 |SE diff|: 0.009337092712074245
- p95 |tau2 diff|: 0.0011326440549850468
- p95 max |grid logRR diff|: 0.008129545980973357
- p95 max |grid SE diff|: 0.03603722777819855

## Criteria
- comparable_fraction_ok: True
- p95_abs_beta_diff_ok: True
- p95_abs_se_diff_ok: True
- p95_abs_tau2_diff_ok: True
- p95_abs_grid_logrr_diff_ok: True
- p95_abs_grid_se_diff_ok: True
- fail_rate_vs_r_ok: True
- runtime_better_than_r_ok: True

## Notes
- Accuracy compares linear/quadratic coefficients, their SEs, tau2, and pooled contrast-grid predictions against dosresmeta.
- R fits are executed via batch R script to avoid per-dataset startup overhead.
