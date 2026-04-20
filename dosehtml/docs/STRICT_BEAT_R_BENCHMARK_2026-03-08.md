# Strict Beat-R Benchmark

Generated: 2026-03-08T09:24:43+00:00
Seed: 20260307
Datasets requested: 120

## Outcome
- Beats R under strict criteria: True
- Comparable datasets: 120/120
- Our fail rate: 0.0000
- R fail rate: 0.0000
- Median runtime (ours ms): 167.04197350190952
- Median runtime (R ms): 320.0
- Runtime speedup (R/ours): 1.9156861792963789

## Accuracy
- p95 |beta diff|: 0.007562402479001138
- p95 |SE diff|: 0.007058935050982372
- p95 |tau2 diff|: 0.0007059449412107466
- p95 max |grid logRR diff|: 0.00993274744527154
- p95 max |grid SE diff|: 0.023855710595481274

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
