<!-- sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files. -->

﻿# Release Checklist

Use this checklist before shipping a release of IPD Meta-Analysis Pro.

## One-command run

```bash
python dev/build-scripts/release_checklist.py
```

## Freeze gate run (current mode)

```bash
python dev/build-scripts/release_checklist.py --freeze
```

`--freeze` enforces release-freeze behavior:
- Bug-fix only changes.
- Full validation required.
- `--skip-selenium` is not allowed.

## What it runs

1. Mojibake/encoding scan on authored manifest modules
   - Vendored runtime payloads are excluded from this text-quality scan
2. `python dev/build.py verify`
3. `node --check dev/modules/export_schema_module.js`
4. `python dev/build-scripts/extract_and_check_js.py`
5. `node dev/tests/core_stats_meta_test.js`
6. `python dev/build-scripts/quick_js_test.py`
7. `python dev/build-scripts/browser_test_runner.py`
8. `python dev/build-scripts/user_flow_smoke_test.py`
9. `python dev/build-scripts/regression_fixed_paths_test.py`
10. `python dev/build-scripts/selenium_test.py`

## Optional fast mode

Skip the Selenium suite when doing a quick local pass:

```bash
python dev/build-scripts/release_checklist.py --skip-selenium
```

This fast path matches the browser-facing GitHub Actions job in `.github/workflows/validation.yml`.

## Release gate

A release is ready only when every checklist step passes.

## Artifact contracts

The checklist also verifies that these steps refreshed their benchmark artifacts and that each artifact reports a passing status:
- `dev/benchmarks/latest_core_stats_meta_test.json`
- `dev/benchmarks/latest_browser_test_runner.json`
- `dev/benchmarks/latest_user_flow_smoke_test.json`
- `dev/benchmarks/latest_ipd_parity_gate.json` when `--with-r-parity` is used

## Optional IPD parity gate vs R (Loop 2)

Run the standard checklist plus IPD-only parity benchmarks against R:
- Two-stage (`metafor/meta`)
- One-stage + frailty (`lme4/survival`)
- Gap-validated IPD methods (centered interactions, piecewise Poisson survival, RMST)

Install the R benchmark dependencies first if needed:

```bash
Rscript dev/build-scripts/install_r_parity_dependencies.R
```

```bash
python dev/build-scripts/release_checklist.py --with-r-parity
```

If needed, provide explicit benchmark Python and Rscript paths:

```bash
python dev/build-scripts/release_checklist.py --with-r-parity \
  --parity-python "C:\Users\user\AppData\Local\Programs\Python\Python313\python.exe" \
  --rscript "C:\Program Files\R\R-4.5.2\bin\Rscript.exe"
```

## Optional frontier gap gate (Loop 3/4/6)

Add Loop-3 checks (methods without turnkey CRAN workflow parity targets):
- KM reconstruction uncertainty propagation
- Federated privacy-preserving survival synthesis
- Transportability sensitivity bias-function stress testing
- Transportability overlap/weight-stability stress testing

```bash
python dev/build-scripts/release_checklist.py --with-r-parity --with-frontier-gap
```

With explicit Python/R paths:

```bash
python dev/build-scripts/release_checklist.py --with-r-parity --with-frontier-gap \
  --parity-python "C:\Users\user\AppData\Local\Programs\Python\Python313\python.exe" \
  --rscript "C:\Program Files\R\R-4.5.2\bin\Rscript.exe"
```

## Optional Loop 7 superiority gate

Add Loop-7 checks:
- Simulation lab benchmark for nonlinear one-stage interaction method
- Publication-profile replication gate on canonical example datasets

```bash
python dev/build-scripts/release_checklist.py --with-r-parity --with-frontier-gap --with-loop7
```

With explicit Python/R paths:

```bash
python dev/build-scripts/release_checklist.py --with-r-parity --with-frontier-gap --with-loop7 \
  --parity-python "C:\Users\user\AppData\Local\Programs\Python\Python313\python.exe" \
  --rscript "C:\Program Files\R\R-4.5.2\bin\Rscript.exe"
```

## Loop 9 snapshot artifact

When `--with-r-parity` is used, the checklist now also builds a Loop-9 validation snapshot artifact:
- `dev/benchmarks/latest_ipd_superiority_snapshot.json`
- `dev/benchmarks/latest_ipd_superiority_snapshot.md`

You can rebuild this artifact directly:

```bash
python dev/build-scripts/build_ipd_superiority_snapshot.py
```
