# Phase 2: Baseline Capture Report

Date: 2026-02-23  
Working copy: `C:\HTML apps\Truthcert1_work`

## Baseline Environment

- Node: `v22.19.0`
- npm: `10.9.3`
- Python: `3.13.7`
- pytest: `9.0.2`
- selenium: `4.38.0`
- R: not available on PATH

## Baseline Integrity Notes

- Selenium tests are hardcoded to `C:\Truthcert1\...` in current scripts.
- At baseline time, core files are byte-identical between:
  - `C:\Truthcert1\app.js` and `C:\HTML apps\Truthcert1_work\app.js`
  - `C:\Truthcert1\TruthCert-PairwisePro-v1.0.html` and `C:\HTML apps\Truthcert1_work\TruthCert-PairwisePro-v1.0.html`
  - `C:\Truthcert1\TruthCert-PairwisePro-v1.0-bundle.html` and `C:\HTML apps\Truthcert1_work\TruthCert-PairwisePro-v1.0-bundle.html`
  - `C:\Truthcert1\TruthCert-PairwisePro-v1.0-fast.html` and `C:\HTML apps\Truthcert1_work\TruthCert-PairwisePro-v1.0-fast.html`

## Executed Checks and Outcomes

| Check | Outcome | Evidence |
|---|---|---|
| `node -c app.js` | PASS | runtime command output |
| `node -c unit_tests.js` | PASS | runtime command output |
| `node -c app_test.js` | FAIL (syntax error) | `app_test.js:1263` |
| `python -u test_truthcert_v2.py` (180s guard) | TIMEOUT after partial run | `baseline_logs/test_truthcert_v2.py.stdout.log` |
| `python -u test_truthcert_comprehensive.py` | FAIL | `baseline_logs/test_truthcert_comprehensive.py.stdout.log`, `.stderr.log` |
| `python -u test_hta.py` | Functional output produced; harness marked non-pass | `baseline_logs/test_hta.py.stdout.log` |
| `python -u S4_Validation_Test.py` (180s guard) | TIMEOUT after critical element failure | `baseline_logs/S4_Validation_Test.py.stdout.log`, `.stderr.log` |

## Key Observations

1. `app_test.js` is not parseable due a broken string join:
   - `app_test.js:1263`
   - `const csv = [header, ...rows].join('` followed by newline.

2. Selector mismatch is present between current UI and older test scripts:
   - Current UI uses:
     - `TruthCert-PairwisePro-v1.0-fast.html:1865` (`id="dataTypeSelect"`)
     - `TruthCert-PairwisePro-v1.0-fast.html:1876` (`id="effectMeasureSelect"`)
     - `TruthCert-PairwisePro-v1.0-fast.html:1884` (`id="tau2MethodSelect"`)
   - Missing in current UI:
     - `id="dataType"`, `id="effectSize"`, `id="tau2Estimator"`, `id="forestPlot"`, `id="funnelPlot"`, `id="useHKSJ"`
   - Older selectors still used by:
     - `test_truthcert_comprehensive.py:126,149,178`
     - `S4_Validation_Test.py:291`

3. Validation claims are inconsistent across repository artifacts:
   - Claims of full pass:
     - `DOCUMENTATION.md:708` (`191/191`, `100%`)
     - `CLAUDE.md:106` (`100% pass rate (17/17)`)
     - `DEVELOPMENT_LOG.md:44` (`17/17`)
   - Contradictory results file:
     - `S3_Validation_Results_Complete.txt:6` (`Passed: 24 (26.1%)`)

4. `S4_Validation_Test.py` produced real numeric mismatches before abort:
   - `baseline_logs/S4_Validation_Test.py.stdout.log`
   - Example failures include tau² methods (`DL`, `REML`, `ML`, `PM`, `HS`, `SJ`, `HE`, `EB`) and NULL primary outputs before `NoSuchElementException` on `useHKSJ`.

5. `test_truthcert_comprehensive.py` is not automation-safe:
   - Includes interactive pause: `test_truthcert_comprehensive.py:722` (`input(...)`)
   - Ends with `EOFError` in non-interactive run (`baseline_logs/test_truthcert_comprehensive.py.stderr.log`).

## Prioritized Baseline Backlog (`P0/P1/P2`)

## `P0` (Correctness / Trust Blocking)

1. Resolve validation truthfulness conflict between published claims and executable results.  
   Evidence: `DOCUMENTATION.md:708`, `CLAUDE.md:106`, `DEVELOPMENT_LOG.md:44`, `S3_Validation_Results_Complete.txt:6`.

2. Investigate and fix statistical mismatches surfaced by S4 validation run (tau² family and primary REML outputs).  
   Evidence: `baseline_logs/S4_Validation_Test.py.stdout.log`.

3. Repair parse error in `app_test.js` so baseline automation can run without syntax failure.  
   Evidence: `app_test.js:1263`.

## `P1` (Reliability / Regression Control)

1. Align Selenium selectors to current UI IDs and element structure.  
   Evidence: `test_truthcert_comprehensive.py:126,149,178`, `S4_Validation_Test.py:291`, `TruthCert-PairwisePro-v1.0-fast.html:1865,1876,1884`.

2. Remove hardcoded absolute test target paths (`C:\Truthcert1\...`) and make tests run against configurable workspace paths.  
   Evidence: `test_truthcert_v2.py:365`, `test_truthcert_comprehensive.py:656`, `test_hta.py:26`, `S4_Validation_Test.py:158`.

3. Diagnose `test_truthcert_v2.py` timeout/hang after partial success (stalls during multi-data-type sequence).  
   Evidence: `baseline_logs/test_truthcert_v2.py.stdout.log`.

## `P2` (Automation Hygiene / Maintainability)

1. Remove interactive `input()` pause and enforce deterministic exit behavior in comprehensive test scripts.  
   Evidence: `test_truthcert_comprehensive.py:722`.

2. Normalize script output encoding handling to avoid charmap warnings in test logs.  
   Evidence: `baseline_logs/test_truthcert_comprehensive.py.stdout.log`.

3. Consolidate and date-stamp validation artifacts so one authoritative report is used for release claims.

## Phase 2 Exit

- Baseline checks executed with captured logs under `baseline_logs/`.
- Initial `P0/P1/P2` backlog established from executable evidence.
