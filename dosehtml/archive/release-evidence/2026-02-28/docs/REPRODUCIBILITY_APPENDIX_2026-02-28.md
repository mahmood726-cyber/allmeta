# Reproducibility Appendix (2026-02-28)

## Scope
This appendix documents the exact commands and artifact paths used to support release and manuscript claims on February 28, 2026.

## Environment Snapshot
- OS: Windows
- Python: 3.13.7
- Node.js: v22.19.0
- Rscript: 4.5.2 (`C:\Program Files\R\R-4.5.2\bin\Rscript.exe`)

## Core Commands Executed
### 1) Syntax and integrity checks
```bash
python -m py_compile dose-response-cli.py scripts/cross_package_multipersona_review.py
node --check dose-response-worker.js
```

### 2) GUI and usability tests
```bash
python test_dose_response_app.py
python test_dose_response_main.py
python selenium_full_test.py
```

For release evidence capture, logs are stored at:
- `tests/release_validation_2026-02-28/test_dose_response_app.log`
- `tests/release_validation_2026-02-28/test_dose_response_main.log`
- `tests/release_validation_2026-02-28/selenium_full_test.log`

### 3) Strict benchmark against R
```bash
python scripts/strict_beat_r_benchmark.py --n-datasets 120 --seed 20260228
```

Primary outputs:
- `tests/strict_beat_r_benchmark_results.json`
- `docs/STRICT_BEAT_R_BENCHMARK_2026-02-28.md`

### 4) Multipersona and cross-package synthesis
```bash
python scripts/cross_package_multipersona_review.py
```

Primary outputs:
- `tests/cross_package_benchmark_results.json`
- `docs/CROSS_PACKAGE_MULTIPERSONA_REVIEW_2026-02-28.md`

### 5) Release readiness consolidation
```bash
python scripts/build_release_readiness_summary.py
```

Primary output:
- `tests/release_validation_2026-02-28/release_readiness_summary.json`

## Preserved Claim-Supporting Artifacts
- Deterministic parity: `tests/r_validation_results.json`, `tests/r_validation_results.txt`
- Strict benchmark: `tests/strict_beat_r_benchmark_results.json`
- Simulation benchmark: `tests/r_simulation_benchmark_results.json`
- Cross-package panel synthesis: `tests/cross_package_benchmark_results.json`
- GUI test logs: `tests/release_validation_2026-02-28/*.log`
- Machine readiness summary: `tests/release_validation_2026-02-28/release_readiness_summary.json`

## Validation Values Used in Release and Manuscript
- GUI aggregate: 161/161 passed
- Deterministic R validation: 3/3 passed
- Strict benchmark: `beats_r = true`
- Strict benchmark runtime speedup ratio: 2.9976792979583644
- Multipersona votes: YES=11, CONDITIONAL=1, NO=0

## Claim Boundary
On February 28, 2026, SPSS/Stata executable comparisons were not run locally in this environment. Cross-package statements involving SPSS and Stata are bounded to internet-reference evidence unless local artifact files are supplied:
- `tests/stata_benchmark_results.json`
- `tests/spss_benchmark_results.json`

