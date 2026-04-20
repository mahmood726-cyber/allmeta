# Phase 1: Review Scope and Success Criteria

Date: 2026-02-23  
Working copy: `C:\HTML apps\Truthcert1_work`

## Objective

Review and improve TruthCert-PairwisePro carefully, with statistical correctness as the top priority and no silent regressions in core workflows.

## Scope

In scope:
- `app.js` (primary statistical and application logic)
- `TruthCert-PairwisePro-v1.0-fast.html` (primary UI entry point that loads `app.js`)
- Validation and benchmark artifacts used to verify correctness:
  - `validation_benchmarks.json`
  - `unit_tests.js`
  - `test_truthcert_comprehensive.py`
  - `test_truthcert_v2.py`
  - `S3_*` validation files
  - `S4_HTA_Validation.md` and `S4_Validation_Test.py`
- Documentation claims that describe validation outcomes or method guarantees

Out of scope (unless needed to debug):
- Historical backup HTML/JS variants (for example `*.backup*`, `*-min.html`, `*-dist.html`)
- Country/disease pack YAML content unrelated to app engine behavior
- Feature expansion not tied to defect fixes, reliability, or validation alignment

## Current Risks Identified

1. Single-file, large `app.js` architecture increases regression risk when patching.
2. Multiple HTML variants raise risk of editing a non-primary file by mistake.
3. Validation status appears inconsistent across files:
   - Some docs claim 100% pass (for example 17/17, 191/191, 109/109).
   - `S3_Validation_Results_Complete.txt` reports `Passed: 24/92`.
4. Statistical methods include iterative estimators where tolerance and convergence behavior can drift.
5. CDN dependencies may hide runtime issues under restricted/offline conditions.

## Quality Gates (Must Pass)

| Area | Gate |
|---|---|
| Syntax integrity | `node -c app.js` exits cleanly after every change batch |
| Primary load path | `TruthCert-PairwisePro-v1.0-fast.html` loads and initializes without uncaught console errors in smoke run |
| Core statistical correctness | R-comparison checks satisfy documented tolerances where applicable: effect estimate `< 0.001`, SE `< 0.01`, tau2 `< 0.01`, I2 `< 1%` |
| Regression control | Post-change validation results do not regress relative to baseline established in Phase 2 |
| Validation truthfulness | Published/project docs must match date-stamped executable validation outputs |
| HTA consistency | HTA checks remain within documented thresholds in `S4_HTA_Validation.md` |

## Review Order (Execution Sequence)

1. Establish baseline outputs (no edits yet).
2. Verify statistical engine behavior against available reference artifacts.
3. Verify UI workflow reliability on the primary HTML path.
4. Triage findings by severity (`P0`, `P1`, `P2`).
5. Apply fixes in small batches with full gate reruns.
6. Reconcile documentation claims with measured outputs.

## Severity Definitions

- `P0`: Incorrect statistical output, broken core workflow, or invalid published validation claim.
- `P1`: Reliable but materially degraded behavior (performance, robustness, major UX blockers).
- `P2`: Maintainability, cleanup, low-risk UX polish, non-critical docs.

## Phase 1 Exit Criteria

- Scope, risks, and quality gates are fixed in writing.
- Primary files and validation artifacts are explicitly identified.
- Contradictory validation claims are recognized as a tracked risk for resolution in next phases.
