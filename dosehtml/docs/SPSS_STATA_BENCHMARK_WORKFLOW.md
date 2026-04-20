# SPSS/Stata Benchmark Workflow

This project now supports external benchmark artifacts for SPSS and Stata.

## Files
- Stata template: `tests/stata_benchmark_results.template.json`
- SPSS template: `tests/spss_benchmark_results.template.json`
- Internet references: `tests/internet_cross_package_references.json`
- Machine benchmark output: `tests/cross_package_benchmark_results.json`
- Generated multipersona report: `docs/CROSS_PACKAGE_MULTIPERSONA_REVIEW_YYYY-MM-DD.md`

## Run cross-package benchmark
```bash
python scripts/cross_package_multipersona_review.py
```

The script will:
1. Run R validation (if Rscript is available).
2. Parse simulation benchmark artifact (`tests/r_simulation_benchmark_results.json`).
3. Load SPSS/Stata artifacts if present (`tests/spss_benchmark_results.json`, `tests/stata_benchmark_results.json`).
4. If local SPSS/Stata artifacts are missing, fall back to internet references from `tests/internet_cross_package_references.json`.
5. Generate machine + markdown reports.

## To include Stata/SPSS in benchmark now
1. Copy each template file to:
   - `tests/stata_benchmark_results.json`
   - `tests/spss_benchmark_results.json`
2. Fill numeric outputs for each test.
3. Re-run the benchmark script.

## Note
If SPSS/Stata are not installed locally, internet-reference fallback keeps the panel review runnable. Full local reproducibility is still required for unconditional 12/12 approval.
