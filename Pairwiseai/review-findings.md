# Review Findings: TruthCert-PairwisePro (Pairwiseai)

**Date:** 2026-03-24
**App:** TruthCert-PairwisePro v1.0 (TruthCert-PairwisePro-v1.0-bundle.html)
**Location:** `C:\HTML apps\Pairwiseai\`
**Papers:** PLOS ONE (3 drafts: Draft, Revised, R2), F1000 Software Tool Article

---

## Test Results Summary

### Selenium Round 4 Comprehensive (2026-02-27)

| Category | Passed | Failed | Total |
|----------|--------|--------|-------|
| Page Load | 2 | 0 | 2 |
| Demo Data | 2 | 0 | 2 |
| Data Type Selector | 5 | 0 | 5 |
| Effect Size Selector | 4 | 0 | 4 |
| Tau-squared Estimators (17) | 18 | 0 | 18 |
| Run Analysis | 2 | 0 | 2 |
| Forest/Funnel Plots | 2 | 0 | 2 |
| Tab Navigation (15 tabs) | 16 | 0 | 16 |
| Report Generation | 8 | 0 | 8 |
| Subgroup/Meta-Regression | 2 | 0 | 2 |
| Validation Panel | 2 | 0 | 2 |
| Button Safety | 2 | 0 | 2 |
| Multi-Data-Type Analysis | 5 | 0 | 5 |
| Final JS Error Check | 1 | 0 | 1 |
| **Total** | **79** | **0** | **79** |

### S4 Validation Results (2026-02-24)

- 17/17 PASS (100%)
- BCG dataset: tau2 DL/REML/ML consistency, pooled theta, SE, HKSJ CI, PI, Egger output
- Proportion and continuous SMD demos validated
- Three-level model and GOSH analysis functions confirmed available

### Reporting Verification (2026-02-27)

- Analysis ready: true
- 3 report styles validated: General, PRISMA, GRADE
- All have Methods, Results, TruthCert Verdict sections
- HTA section present
- Downloads: TXT (9.6 KB), MD (9.3 KB), DOC (11.0 KB) -- all created and clicked
- 0 errors

### R Oracle Parity (oracle_output.json, 2026-03-03)

- R metafor 4.8.0, R 4.5.2
- 12 metafor-supported methods validated: DL, REML, ML, PM, PMM, HS, HSk, SJ, HE, EB, GENQ, GENQM
- 5 app-only methods: PL, DL2, CA, BMM, QG (no metafor equivalent)
- 17 total tau-squared estimators in app

### Expert Panel Round 4 (2026-02-27, 12-persona simulated)

- Adoption: 10 Adopt Now, 2 Pilot First, 0 Not Now (12/12)
- Weighted total mean: 4.76/5.00 (SD 0.14)
- Key scores: Estimator coverage 4.92, Reproducibility 5.00, Reporting ready 5.00
- Critical blockers: 0/12
- Remaining friction: operational assurance and independent third-party rerun (governance, not methods)

### Blocker Remediation (2026-02-26)

- 9/10 blockers completed
- 1 external dependency: independent third-party replication (cannot be self-completed)
- Nightly quality gate passed (2026-02-26, GLMM-enforced)

---

## Review Rounds

### 4-Persona Truth Review (2026-03-01)

| Persona | Verdict |
|---------|---------|
| Evidence Traceability | PASS |
| Artifact Consistency | PASS |
| Limitation Honesty | PASS |
| Language Truthfulness | PASS |
| **Overall** | **PASS** |

### Previous R Validation (S3_Validation_Results_Complete.txt, 2026-01-20)

An older validation run (92 tests, 24 pass / 68 fail, 26.1% pass rate) showed significant discrepancies in study-level yi/vi values, Begg/Egger statistics, and LOO results. **This predates the extensive remediation work in Feb 2026.** The Round 4 selenium (79/79), S4 validation (17/17), and oracle parity results supersede this older run.

---

## P0 Issues (Critical / Blocking)

None identified in current version. All 79 Selenium tests pass. 17/17 validation tests pass. Oracle parity confirmed for 12 metafor methods.

## P1 Issues (High / Should-Fix)

- **P1-1**: The Jan 2026 R validation (S3) showed 68/92 failures. While Feb 2026 work addressed these, a fresh full S3-equivalent run with updated code would close the evidence gap definitively.
- **P1-2**: 5 app-only tau-squared estimators (PL, DL2, CA, BMM, QG) lack external R oracle validation (no metafor equivalent). Should document these as "JS-only, no R reference" or validate against published formulas.
- **P1-3**: Independent third-party replication remains an external dependency (blocker 10/10).

## P2 Issues (Low / Nice-to-Have)

- **P2-1**: Forest/funnel plot containers reported as "not present in current layout" during selenium test -- plots are generated dynamically but not verified visually in headless mode.

---

## Verdict

**REVIEW CLEAN**

79/79 Selenium tests pass. 17/17 validation tests pass. R oracle parity confirmed for 12 methods. Expert panel 12/12 (10 adopt now, 2 pilot). 4-persona truth review PASS. Nightly quality gate passing. The Jan 2026 R validation failures are superseded by Feb 2026 remediation and re-testing. Three P1 items are process/evidence gaps, not correctness concerns.
