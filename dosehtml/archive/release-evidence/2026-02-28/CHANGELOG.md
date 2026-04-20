# Changelog

All notable changes to this project are documented in this file.

## [2026-02-28] Release Candidate Validation + Publication Package
### Added
- Added full manuscript draft for RSM submission:
  - `docs/RSM_MANUSCRIPT_DRAFT_2026-02-28.md`
- Added release notes:
  - `docs/RELEASE_NOTES_2026-02-28.md`
- Added reproducibility appendix:
  - `docs/REPRODUCIBILITY_APPENDIX_2026-02-28.md`
- Added RSM submission checklist:
  - `docs/RSM_SUBMISSION_CHECKLIST_2026-02-28.md`
- Added machine-readable release readiness summary generator:
  - `scripts/build_release_readiness_summary.py`
- Added release readiness output:
  - `tests/release_validation_2026-02-28/release_readiness_summary.json`

### Changed
- Updated `dose-response-pro.html` initialization and analysis UX flow:
  - Bound global keyboard shortcuts.
  - Stabilized run button label and busy-state behavior.
  - Added analysis status initialization and busy accessibility attributes.

### Validation
- GUI suites: 161/161 passed across:
  - `test_dose_response_app.py`
  - `test_dose_response_main.py`
  - `selenium_full_test.py`
- Deterministic R validation: 3/3 passed.
- Strict synthetic benchmark: `beats_r = true` on 120/120 comparable datasets.
- Multipersona panel: YES=11, CONDITIONAL=1, NO=0.

### Known Limitation
- Local executable SPSS/Stata artifact replication remains pending for unconditional 12/12 endorsement.

