# Publication-Grade External Validation Plan

Date: 2026-02-26
Project: TruthCert-PairwisePro

## Guardrail
Validation and roadmap actions are add-only:
- No removal of current methods or UI capabilities.
- No regression of existing functionality.
- All changes must preserve backward behavior and outputs unless clearly corrected bug behavior is documented.

## 1. Purpose
Produce an independent, submission-ready validation package that increases expert immediate adoption from 7/12 toward 10+/12.

## 2. Primary validation questions
1. Are core pooled estimates numerically concordant with reference tools across representative datasets?
2. Are extended tau2 methods stable, reproducible, and well-characterized?
3. Are advanced outputs (bias tests, sensitivity tools, prediction intervals, HTA outputs) concordant and decision-safe?
4. Is reproducibility sufficient for journal, guideline, and regulatory contexts?

## 3. External comparators
- R metafor (primary statistical oracle)
- R meta (secondary cross-check)
- Stata meta (where available)
- RevMan outputs for overlapping methods

## 4. Dataset matrix
Minimum required test matrix:
1. Binary outcomes, low heterogeneity
2. Binary outcomes, high heterogeneity
3. Sparse/zero-cell binary outcomes
4. Continuous outcomes (MD)
5. Continuous outcomes (SMD)
6. Proportion outcomes
7. Correlation outcomes
8. Generic yi/vi outcomes
9. Multi-study large-k dataset
10. Small-k edge-case dataset

Include at least 30 datasets total:
- 10 canonical published datasets
- 10 synthetic stress datasets
- 10 domain-specific practical datasets

## 5. Method matrix
Validate, at minimum:
- Core: FE, DL, REML, ML, PM, HE, HS, HSk, SJ, EB
- Extended: PMM, GENQ, GENQM, PL, DL2, CA, BMM, QG
- Heterogeneity outputs: Q, I2, H2, tau2, tau, p-value
- Interval outputs: standard CI, HKSJ CI, prediction interval
- Bias outputs: Egger, Begg, Peters, trim-and-fill, PET-PEESE, TES
- Diagnostics: leave-one-out, Baujat, influence metrics
- HTA: ICER, NMB, CEAC, EVPI consistency checks

## 6. Pre-specified tolerances
Suggested pass criteria by output class:
- Pooled effect and SE: relative error <= 1e-5
- tau2 and heterogeneity metrics: relative error <= 1e-4
- p-values: absolute error <= 1e-4
- CEAC probabilities: absolute error <= 0.02
- EVPI and NMB: relative error <= 0.05

Any out-of-tolerance result requires:
1. Reproduction in isolated script.
2. Root cause classification (reference variance, numerical method, bug, settings mismatch).
3. Documented resolution or accepted limitation with rationale.

## 7. Reproducibility and governance
Required artifacts per validation run:
1. Input dataset file and checksum.
2. App build identifier and file hash.
3. Reference tool versions and session info.
4. Exact command log and run timestamps.
5. Machine-readable result table (CSV/JSON).
6. Human-readable validation memo.

Two-person rule for final sign-off:
- Analyst A executes runs.
- Analyst B independently reproduces subset and verifies summary claims.

## 8. Independent replication package
Deliverables:
1. Replication protocol document.
2. Reference scripts (R and optional Stata do-files).
3. App output extraction scripts.
4. Concordance calculator scripts.
5. Final discrepancy ledger with disposition.

## 9. Expert review integration
After numerical validation lock:
1. Re-run 12-expert survey using final package.
2. Compute weighted adoption metrics.
3. Map each blocker to a concrete add-only remediation item.
4. Publish final adoption report with before/after comparison.

## 10. Publication mapping
Map outputs to manuscript and supplement:
- Main manuscript: key concordance results and practical significance.
- Supplement S3: full statistical validation tables and scripts.
- Supplement S4: HTA and decision-analysis validation.
- Supplemental appendix: expert panel process and adoption results.

## 11. Timeline (4-week sprint)
Week 1:
- Lock datasets, comparators, tolerance thresholds.
- Run baseline concordance.

Week 2:
- Resolve discrepancies and produce reruns.
- Freeze validation scripts and artifact schema.

Week 3:
- Independent replication pass.
- Draft final validation memo and supplement tables.

Week 4:
- Execute real 12-expert review cycle.
- Publish adoption summary and improvement backlog.

## 12. Exit criteria
Validation package is release-ready only if all are true:
1. Core method concordance pass rate >= 99%.
2. No unresolved critical numerical discrepancies.
3. Full artifact traceability for every reported claim.
4. Expert panel immediate adoption >= 8/12 with defined plan to reach 10/12.
5. No recommended change removes existing capability.
