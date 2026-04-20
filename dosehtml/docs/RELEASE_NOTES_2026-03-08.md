# Dose Response Pro v18.1 Release Notes (2026-03-08)

## Release Decision
- Status: Broad public release supported by the current artifact set.
- Date: March 8, 2026.
- Basis: refreshed deterministic R validation, refreshed 120-dataset strict benchmark, and an explicit end-to-end browser regression for the Validation-tab round-trip JSON load path.

## Validation Snapshot
### Deterministic R parity
- Comparator: `dosresmeta` 2.2.0 via `tests/strict_r_batch_dosresmeta.R`
- Result: `3/3` tests passed and `3/3` pooled grid checks passed
- Artifact: `tests/r_validation_results.json`
- Tolerances:
  - `|beta| <= 0.02`
  - `|SE| <= 0.05`
  - `|tau2| <= 0.02`
  - `|grid logRR| <= 0.02`
  - `|grid SE| <= 0.05`

### Strict benchmark vs R
- Seed: `20260307`
- Datasets requested: `120`
- Comparable datasets: `120/120`
- Verdict: `beats_r = true`
- Median runtime (ours): `167.04197350190952 ms`
- Median runtime (R): `320.0 ms`
- Runtime speedup ratio (R/ours): `1.9156861792963789`
- Accuracy summary:
  - `p95 |beta diff| = 0.007562402479001138`
  - `p95 |SE diff| = 0.007058935050982372`
  - `p95 |tau2 diff| = 0.0007059449412107466`
  - `p95 max |grid logRR diff| = 0.00993274744527154`
  - `p95 max |grid SE diff| = 0.023855710595481274`
- Artifacts:
  - `tests/strict_beat_r_benchmark_results.json`
  - `docs/STRICT_BEAT_R_BENCHMARK_2026-03-08.md`

### Browser regression coverage
- Main Selenium suite includes explicit coverage for:
  - linear-model regression path
  - Validation-tab round-trip R JSON upload/load path
- Files:
  - `test_dose_response_main.py`
  - `dose-response-pro.html`

## What Changed In This Release-Hardening Pass
- Re-ran the full 120-dataset strict benchmark against the installed Windows `Rscript.exe`.
- Refreshed the release-facing benchmark report for March 8, 2026.
- Made the round-trip JSON file input DOM-addressable so automated browser tests exercise the real upload path.
- Added a Selenium regression that uploads a generated round-trip JSON fixture and verifies the Validation panel reports a passing comparison.
- Updated the README so the current release basis points at fresh 2026-03-08 artifacts instead of the earlier archival package.

## Claim Boundary
- Current public release claims should be limited to the implemented `linear` and `quadratic` paths plus the validated browser/CLI/R evidence above.
- The February 28, 2026 manuscript and submission-package documents remain useful historical context, but they are not the primary evidence basis for this release pass.
