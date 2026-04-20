# Dose Response Pro v18.1 Release Notes (2026-02-28)

Historical note: this document is preserved as the February 28, 2026 release record. For the current release basis, use `docs/RELEASE_NOTES_2026-03-08.md` and the March 8, 2026 validation artifacts.

## Release Decision
- Status: Release approved
- Date: February 28, 2026
- Basis: GUI tests 161/161 pass, deterministic R parity pass, strict benchmark `beats_r = true`, multipersona panel 11 YES / 1 CONDITIONAL / 0 NO.

## What Changed in This Release Pass
### Usability and GUI polish
- Added analysis status badge with explicit state transitions.
- Added run-button busy-state protection and accessibility attributes.
- Added live data-input quality summary (rows parsed, study count, dose range, dropped rows, warning notes).
- Added global keyboard shortcuts:
  - `Ctrl/Cmd+Enter`: Run analysis
  - `Ctrl/Cmd+Shift+L`: Load sample data
  - `Ctrl/Cmd+Shift+R`: Results tab
  - `Ctrl/Cmd+Shift+D`: Data tab
- Improved toast accessibility via polite live-region semantics.
- Replaced PDF placeholder with full report generation:
  - Produces full in-app report content (Methods + Results + diagnostics + figures).
  - Opens print-ready report window for direct Save-as-PDF workflow.

### Validation and benchmark evidence
- Re-ran GUI suites and captured logs:
  - `tests/release_validation_2026-02-28/test_dose_response_app.log`
  - `tests/release_validation_2026-02-28/test_dose_response_main.log`
  - `tests/release_validation_2026-02-28/selenium_full_test.log`
- Re-ran strict benchmark:
  - Output: `tests/strict_beat_r_benchmark_results.json`
- Re-ran cross-package multipersona benchmark:
  - Output: `tests/cross_package_benchmark_results.json`
  - Report: `docs/CROSS_PACKAGE_MULTIPERSONA_REVIEW_2026-02-28.md`

## Validation Snapshot
### GUI
- `test_dose_response_app.py`: 34/34
- `test_dose_response_main.py`: 74/74
- `selenium_full_test.py`: 53/53
- Aggregate: 161/161 (100%)

### R and benchmark parity
- Deterministic R validation: 3/3 pass
- Max absolute beta difference: 7.56e-06
- Max absolute standard error difference: 4.3774e-06
- Strict synthetic benchmark: 120/120 comparable, `beats_r = true`
- Runtime speedup ratio (R/ours): 2.9977

### Multipersona adoption
- YES: 11
- CONDITIONAL: 1
- NO: 0

## Known Constraint (Claim Boundary)
SPSS and Stata evidence currently uses internet-reference fallback in this environment. Unconditional 12/12 methodologist endorsement requires local executable artifact replication:
- `tests/stata_benchmark_results.json`
- `tests/spss_benchmark_results.json`

## Artifacts to Cite
- Release readiness summary: `tests/release_validation_2026-02-28/release_readiness_summary.json`
- RSM manuscript draft: `docs/RSM_MANUSCRIPT_DRAFT_2026-02-28.md`
- Reproducibility appendix: `docs/REPRODUCIBILITY_APPENDIX_2026-02-28.md`
- Submission checklist: `docs/RSM_SUBMISSION_CHECKLIST_2026-02-28.md`
