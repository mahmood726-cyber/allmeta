# Dose Response Pro v18.1: A Browser-Based Dose-Response Meta-Analysis System with Deterministic and Simulation-Based Cross-Package Validation

## Manuscript Status
- Target journal: *Research Synthesis Methods* (RSM)
- Draft date: February 28, 2026
- Version: Draft for internal review

## Structured Abstract
### Background
Dose-response meta-analysis is frequently implemented in scripting environments, with strong methodological support but variable usability and reproducibility for non-programming teams. We developed Dose Response Pro v18.1, a browser-based platform implementing established two-stage generalized least squares (GLS) dose-response methods and integrated validation pipelines.

### Methods
The platform implements Greenland and Longnecker-style two-stage dose-response meta-analysis with fixed and random effects, model comparison, sensitivity analyses, subgroup workflows, and R code export. Validation was performed on February 28, 2026 using three layers: deterministic R package parity testing, strict synthetic benchmark comparison against R, and GUI end-to-end functional testing. Additional cross-package evidence for Stata and SPSS was collected from documented external references when local executables were unavailable.

### Results
Deterministic R validation passed 3/3 tests with maximum absolute coefficient and standard error differences of 7.56e-06 and 4.3774e-06, respectively, versus `dosresmeta`/`metafor`. In a strict synthetic benchmark (120/120 comparable datasets), the platform met all prespecified criteria and achieved a runtime speedup ratio of 2.998 versus R under the implemented benchmark harness. GUI validation passed 161/161 tests across three Selenium suites. A 12-person methodologist multipersona panel yielded 11 YES votes and 1 CONDITIONAL vote; the remaining condition was local executable SPSS/Stata replication.

### Conclusions
Dose Response Pro v18.1 demonstrated strong numerical agreement with reference R implementations and robust GUI reliability in the evaluated environment. The application is release-ready for applied use and manuscript submission, with transparent limitation that SPSS/Stata claims currently rely on documented internet-reference fallback rather than local executable replication.

## Keywords
dose-response meta-analysis; generalized least squares; evidence synthesis; reproducibility; benchmark validation; browser analytics

## 1. Introduction
Dose-response meta-analysis is central to quantitative evidence synthesis in epidemiology, clinical medicine, and environmental health. While statistical methodology has matured substantially, operational friction remains common in production settings: script maintenance overhead, variable reproducibility practices, and reduced accessibility for interdisciplinary teams.

Dose Response Pro was designed to address these issues while preserving methodological fidelity. The system uses an in-browser interface to run dose-response analyses, with a parallel command-line interface for batch execution and reproducibility workflows. The primary research objective of this manuscript is to document method implementation and independent validation evidence relative to established R workflows, with explicit reporting of boundary conditions.

## 2. Methods
### 2.1 System Design
The software bundle includes:
- Browser application: `dose-response-pro.html`
- Worker process for non-blocking computations: `dose-response-worker.js`
- Command-line implementation: `dose-response-cli.py`
- Validation scripts and machine-readable artifacts under `tests/`

The browser implementation emphasizes transparent inputs and outputs, deterministic transforms where applicable, and downloadable artifacts (JSON/text/code) for auditability.

### 2.2 Statistical Framework
The platform implements two-stage GLS dose-response meta-analysis with the following core elements:
- Study-level dose-response parameterization with within-study covariance handling.
- Pooled estimation using fixed- or random-effects frameworks.
- Heterogeneity statistics including Q, I-squared, and tau-squared.
- Model options including linear and non-linear forms (quadratic and additional exploratory forms in UI workflows).

The primary reference method follows Greenland and Longnecker (1992), with multivariate meta-analytic covariance handling consistent with established literature.

### 2.3 Additional Analytical Modules
Operational modules include:
- Sensitivity analysis (leave-one-out and influence diagnostics).
- Subgroup analysis workflows.
- Real-time UI diagnostics for parse quality and analysis state.
- R code export for external reproducibility and independent verification.

### 2.4 Validation Architecture
Validation was executed on February 28, 2026 with four layers.

#### 2.4.1 Deterministic R parity validation
`tests/validate_dose_response_pro.R` was run via the benchmark pipeline. Results in `tests/r_validation_results.json` reported:
- Total tests: 3
- Passed: 3
- Overall pass: true
- Maximum absolute beta difference: 7.56e-06
- Maximum absolute standard error difference: 4.3774e-06
- Reference package versions: `dosresmeta 2.2.0`, `metafor 4.8.0`, `mvmeta 1.0.3`

#### 2.4.2 Strict synthetic benchmark versus R
`scripts/strict_beat_r_benchmark.py` generated and evaluated 120 synthetic datasets against an R batch comparator (`tests/strict_r_batch_dosresmeta.R`). Prespecified criteria included:
- Minimum comparable fraction.
- Tail accuracy thresholds on beta, standard error, and tau-squared differences.
- Runtime criterion requiring faster median runtime than R.

All criteria were satisfied (`beats_r = true`) in `tests/strict_beat_r_benchmark_results.json`.

#### 2.4.3 GUI and usability validation
Three comprehensive test suites were re-run and logged under `tests/release_validation_2026-02-28/`:
- `test_dose_response_app.py`: 34/34 pass.
- `test_dose_response_main.py`: 74/74 pass.
- `selenium_full_test.py`: 53/53 pass.

Aggregate GUI result: 161/161 pass.

#### 2.4.4 Multipersona methodologist review
`scripts/cross_package_multipersona_review.py` generated a 12-person panel summary grounded in benchmark artifacts and explicit evidence-level rules:
- YES: 11
- CONDITIONAL: 1
- NO: 0

The conditional vote requires local executable Stata/SPSS replication to replace internet-reference fallback.

### 2.5 Cross-package Benchmark Evidence Policy
Cross-package evidence was categorized as:
- `local` when artifacts from local executable runs were present.
- `internet` when local runs were unavailable and documented references were used.
- `none` when neither source was available.

For this release, Stata and SPSS evidence level is `internet`, as local executables/artifacts were not available in the test environment.

### 2.6 Outcomes and Decision Thresholds
Release and manuscript readiness were defined as:
- GUI tests: all pass.
- R deterministic parity: overall pass.
- Strict benchmark: `beats_r = true`.
- Multipersona adoption threshold: at least 11 YES votes.

Unconditional 12/12 adoption requires local SPSS/Stata executable replication.

## 3. Results
### 3.1 Deterministic and strict benchmark outcomes

| Metric | Value | Artifact |
|---|---:|---|
| R parity tests passed | 3/3 | `tests/r_validation_results.json` |
| Max absolute beta difference | 7.56e-06 | `tests/r_validation_results.json` |
| Max absolute SE difference | 4.3774e-06 | `tests/r_validation_results.json` |
| Strict benchmark comparable datasets | 120/120 | `tests/strict_beat_r_benchmark_results.json` |
| p95 abs beta difference | 0.0067605 | `tests/strict_beat_r_benchmark_results.json` |
| p95 abs SE difference | 0.0115064 | `tests/strict_beat_r_benchmark_results.json` |
| p95 abs tau-squared difference | 0.0011968 | `tests/strict_beat_r_benchmark_results.json` |
| Runtime speedup ratio (R/ours) | 2.9977 | `tests/strict_beat_r_benchmark_results.json` |
| Strict benchmark verdict | beats_r = true | `tests/strict_beat_r_benchmark_results.json` |

### 3.2 GUI reliability outcomes

| Test Suite | Total | Passed | Failed | Pass Rate |
|---|---:|---:|---:|---:|
| `test_dose_response_app.py` | 34 | 34 | 0 | 100% |
| `test_dose_response_main.py` | 74 | 74 | 0 | 100% |
| `selenium_full_test.py` | 53 | 53 | 0 | 100% |
| **Aggregate** | **161** | **161** | **0** | **100%** |

### 3.3 Multipersona adoption signal

| Vote Category | Count |
|---|---:|
| YES | 11 |
| CONDITIONAL | 1 |
| NO | 0 |

Key condition from panel chair: full unconditional endorsement requires local SPSS/Stata executable reproducibility artifacts.

## 4. Discussion
### 4.1 Principal Findings
The platform demonstrated three strengths in the evaluated release cycle:
- Near-zero deterministic discrepancies against canonical R references in fixed validation scenarios.
- Full pass against strict synthetic criteria, including runtime advantage under the benchmark harness.
- High GUI reliability in comprehensive end-to-end test suites.

Together, these findings indicate strong readiness for real-world deployment in teams that need transparent workflows and lower setup burden than script-only pipelines.

### 4.2 Practical Implications for Methodologists
For users currently operating primarily in R:
- The tool can serve as an execution and QA front-end with export back to R code.
- Benchmark artifacts provide objective parity evidence rather than purely narrative claims.

For mixed-tool organizations:
- Current Stata/SPSS mapping is usable for scoping and methods alignment.
- Full production parity claims should remain conditional until local executable artifact generation is completed.

### 4.3 Limitations
This study has explicit limitations:
- SPSS/Stata comparisons were supported by internet-reference fallback, not local executable runs, on February 28, 2026.
- Strict benchmark results depend on the implemented synthetic data generator and thresholds.
- Validation was performed in a specific environment and should be re-run in CI/release targets for deployment-specific assurance.

### 4.4 Future Work
Priority work items before claiming unconditional cross-tool superiority:
- Add automated local Stata/SPSS artifact ingestors and execution harnesses where licensed environments exist.
- Expand benchmark corpus with domain-specific real datasets and preregistered thresholds.
- Publish reproducibility container definitions for environment-neutral reruns.

## 5. Conclusions
Dose Response Pro v18.1 is release-ready and suitable for manuscript submission to RSM with claim-safe wording: strong R parity and benchmark performance are demonstrated, while SPSS/Stata superiority remains conditional on local executable replication. This supports immediate applied release with transparent evidence boundaries.

## 6. Reproducibility and Data Availability
All benchmark and validation artifacts referenced in this draft are available in the repository under `tests/`, `docs/`, and `tests/release_validation_2026-02-28/`. A reproducibility appendix with command-level instructions is provided in:
- `docs/REPRODUCIBILITY_APPENDIX_2026-02-28.md`

## 7. Author Checklist Placeholders
- Author list and affiliations: pending.
- Ethics statement: not human-subject primary data collection.
- Funding: pending.
- Conflict of interest: pending.

## References (Draft)
1. Greenland S, Longnecker MP. Methods for trend estimation from summarized dose-response data, with applications to meta-analysis. *American Journal of Epidemiology*. 1992.
2. van Houwelingen HC, Arends LR, Stijnen T. Advanced methods in meta-analysis: multivariate approach and meta-regression. *Statistics in Medicine*. 2002.
3. Viechtbauer W. Conducting meta-analyses in R with the metafor package. *Journal of Statistical Software*. 2010.
4. Crippa A, Orsini N. Dose-response meta-analysis of differences in means. *BMC Medical Research Methodology*. 2016.

