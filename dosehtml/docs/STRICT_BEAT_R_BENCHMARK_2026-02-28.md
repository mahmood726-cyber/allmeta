# Strict Beat-R Benchmark

Generated: 2026-02-28T16:23:05+00:00
Seed: 20260228
Datasets requested: 120

## Outcome
- Beats R under strict criteria: True
- Comparable datasets: 120/120
- Our fail rate: 0.0000
- R fail rate: 0.0000
- Median runtime (ours ms): 60.046449973015115
- Median runtime (R ms): 180.0
- Runtime speedup (R/ours): 2.9976792979583644

## Accuracy
- p95 |beta diff|: 0.006760504833900883
- p95 |SE diff|: 0.011506353356679308
- p95 |tau2 diff|: 0.0011968159284591671

## Criteria
- comparable_fraction_ok: True
- p95_abs_beta_diff_ok: True
- p95_abs_se_diff_ok: True
- p95_abs_tau2_diff_ok: True
- fail_rate_vs_r_ok: True
- runtime_better_than_r_ok: True

## Notes
- Accuracy compares linear/quadratic coefficients, their SEs, and tau2 against dosresmeta.
- R fits are executed via batch R script to avoid per-dataset startup overhead.
