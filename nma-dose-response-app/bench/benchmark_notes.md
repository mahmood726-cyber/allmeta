# Benchmark dataset notes

Generated helper datasets for package benchmarking.

- benchmark_pairwise.csv: derived from `benchmark.csv` by treating `effect` as arm-level mean and `se` as arm-level SE, then computing pairwise contrasts (independent-arm assumption).
- benchmark_arm.csv: derived from `benchmark.csv` by treating `effect` as arm-level mean, assuming `n = 100` per arm, and computing `sd = se * sqrt(n)`.
- benchmark_dose.csv: synthetic within-study multi-dose expansion; for each non-placebo arm a second row is added with `dose * 0.5` and `effect * 0.7` (same `se`).
- benchmark_combined.csv: combined schema with `record_type` rows (`pairwise`, `arm`, `dose`) so a single file can drive both netmeta and dosresmeta in one run.
- benchmark_real_combined.csv: real-data combined schema built from `netmeta::parkinson` (arm-level continuous) and `dosresmeta::alcohol_cvd` (logRR dose-response).
- benchmark_real_combined2.csv: real-data combined schema built from `netmeta::Senn2013` (pairwise TE/seTE) and `dosresmeta::alcohol_cvd` + `dosresmeta::coffee_cvd` (logRR dose-response).
- benchmark_real_combined3.csv: real-data combined schema built from `netmeta::Stowe2010` (arm-level continuous) and `dosresmeta::milk_mort` (logRR dose-response).
- benchmark_real_combined4.csv: real-data combined schema built from `netmeta::Linde2016` (pairwise lnOR/selnOR with `sm=OR`) and `dosresmeta::red_bc` (logRR dose-response).
