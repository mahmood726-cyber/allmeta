# TruthCert-PairwisePro v1.0 (work build): a software tool article for the development-workspace variant

## Authors
- Mahmood Ahmad [1,2]
- Niraj Kumar [1]
- Bilaal Dar [3]
- Laiba Khan [1]
- Andrew Woo [4]
- Corresponding author: Andrew Woo (andy2709w@gmail.com)

## Affiliations
1. Royal Free Hospital
2. Tahir Heart Institute Rabwah
3. King's College Medical School
4. St George's Medical School

## Abstract
**Background:** Development-workspace builds are useful for validating interface and workflow changes before release alignment. This manuscript documents the TruthCert1_work variant of TruthCert-PairwisePro.

**Methods:** The work build retains the same major workflow architecture as the paired production directory: multi-format import, interactive model controls, run and full-analysis execution, visualization panels, bias and HTA views, and export utilities. A Playwright browser workflow was used on 2026-03-01 to capture representative full-page interface states from the local runnable build.

**Results:** The software completed end-to-end browser workflows for data input, model execution, visual analytics, and export within the domain-specific interface.

**Conclusions:** TruthCert-PairwisePro v1.0 (work build) provides a practical browser-native workflow for evidence synthesis; final submission readiness depends on attaching a public repository link and DOI-archived release metadata.

## Keywords
pairwise meta-analysis; development build; HTA reporting; evidence synthesis; web tool

## Visual Abstract
### Workflow overview
| Panel | Key message | What the software does | Reviewer-check evidence |
|---|---|---|---|
| Clinical problem | Evidence-synthesis workflows are often fragmented and hard to audit. | Consolidates data input, model execution, diagnostics, and exports in one workflow. | Manuscript Methods + reproducibility checklist. |
| Inputs and setup | Reproducibility depends on explicit data/schema and parameter states. | Uses user-provided or demo datasets with configurable model and sensitivity settings. | Use-case walkthrough + saved run configuration. |
| Analysis core | Credible conclusions require transparent estimation and diagnostics. | Runs primary model(s), heterogeneity handling, and sensitivity modules with exportable outputs. | Results/diagnostic tables + validation artifact paths. |
| Output and interpretation | Outputs must be interpretable, bounded, and independently checkable. | Produces pooled estimates, plots, diagnostics, and reporting exports for independent review. | Validation evidence table + checklist-linked artifacts. |
| Claim boundary | Software articles should avoid unsupported superiority claims. | States limitations, scope, and pending metadata requirements explicitly. | Discussion limitations + submission blockers checklist. |

## Introduction
Development builds need explicit reporting of validated behavior to remain credible for scholarly communication. This is especially important when methods span core and advanced estimator pathways.

TruthCert PairwisePro (Work Build) is documented here with the same emphasis on reproducibility and clear validation boundaries used in the stable variant. Claims are intentionally restricted to what current artifacts support.

### Positioning against existing tools
This package is positioned relative to established options including CRSU/MetaInsight web tools, Comprehensive Meta-Analysis (CMA), Stata-based workflows, and package-driven R pipelines. The intended contribution here is workflow transparency, reproducibility scaffolding, and explicit claim boundaries, not blanket superiority over existing platforms.

### Table 1. Positioning matrix
| Dimension | This package | Established alternatives | Claim boundary |
|---|---|---|---|
| Primary goal | Transparent, reproducible end-to-end workflow | Mature GUIs/statistical packages with broad legacy adoption | Scope limited to demonstrated workflows |
| User profile | Clinicians/researchers needing guided reproducibility | Advanced analysts and mixed-skill teams | Complementary use is recommended |
| Strength emphasis | Auditability, artifact linkage, structured outputs | Feature breadth and ecosystem maturity | Interpret strengths relative to use case |
| Reproducibility support | Walkthrough + validation summary + checklist | Varies by tool/package and setup | Claims remain artifact-bounded |

## Methods
### Implementation
The work build retains the same browser-native architecture for import, model execution, visual analysis, and reporting, with workspace-oriented flexibility for iterative method checks. The interface supports controlled reruns to compare behavior before release integration.

### Installation and local execution requirements
- Confirm required runtime dependencies listed in `README.md` and project environment files.
- Use a clean environment for first-run verification to avoid hidden local-state effects.
- Run the documented primary entry point and capture logs/screenshots for reproducibility notes.
- If package-specific dependencies are unavailable, record the exact version mismatch and fallback behavior.

### Operation
- Open `Main screen.html` in the `Truthcert1_work` directory.
- Load demonstration or validation datasets and configure model options for the target test scenario.
- Execute analysis, compare outputs against expected behavior, and review interpretation panels.
- Export artifacts for cross-build comparison and pre-release review documentation.

### Table 2. Minimum input schema and validation checks
| Input field | Required | Validation rule | Failure risk if missing/invalid |
|---|---|---|---|
| Study identifier | Yes | Unique per row/group | Mislabelled outputs, merge errors |
| Effect/endpoint variables | Yes | Numeric + interpretable scale | Invalid model estimation |
| Uncertainty/count fields | Yes | Non-negative and non-null | Biased weighting or unstable inference |
| Model-setting metadata | Yes | Explicitly recorded at run time | Non-reproducible reruns |
| Source file provenance | Recommended | Track input path and version | Ambiguous audit trail |

### Core equations
Key equations used in this manuscript are summarized in Table EQ1.

### Equation summary table
| Eq. ID | Model component | Expression | Interpretation role |
|---|---|---|---|
| E1 | Study-level odds ratio definition | `OR_i = \frac{a_i d_i}{b_i c_i}, \quad y_i = \ln(OR_i)` | Defines each study effect estimate before pooling under fixed- or random-effects assumptions. |
| E2 | Random-effects pooled estimator | `\hat{\theta} = \frac{\sum_i w_i y_i}{\sum_i w_i}, \quad w_i = \frac{1}{v_i + \tau^2}` | Computes the pooled effect as a precision-weighted average under heterogeneity. |
| E3 | Heterogeneity proportion (IÂ²) | `I^2 = \max\left(0,\frac{Q-df}{Q}\right)\times 100\%` | Estimates the proportion of total variability attributable to between-study heterogeneity. |

### Reproducibility and validation
All analytic states are controlled through explicit user-configurable parameters and exportable outputs. In this manuscript, demonstration workflows were repeated under fixed settings to confirm stable behavior across reruns, and figure generation was standardized to full-page captures for consistent interpretation.

<!-- R_VALIDATION_TABLE_START -->
#### R validation evidence table
| Validation dimension | Evidence summary | Artifact source |
|---|---|---|
| Comparator environment | R 4.5.2 (2025-10-31 ucrt); metafor 4.8.0; meta 8.2.1. | Supplement_S3_R_Validation.md |
| Validation scope | Three datasets (SGLT2_ACM, BCG, BP_REDUCTION) with effect-size, tau^2, pooled estimate, CI, and heterogeneity checks. | Supplement_S3_R_Validation.md |
| Pass summary | 108/112 passed (96.4%). | Supplement_S3_R_Validation.md |
| Noted caveat | Minor differences reported for advanced tau^2 estimators (PM/HS/SJ/EB); core estimators and pooled outputs reported as matching. | Supplement_S3_R_Validation.md |
| Additional regression suite | S4 automated checks: 17/17 passed (pass_rate=100.0%). | S4_Validation_Results.json |
<!-- R_VALIDATION_TABLE_END -->
### Core functionality exposed in the interface
- Interactive data ingestion and validation controls
- Configurable analysis models with sensitivity options
- Integrated visualization panels for interpretive review
- Export pathways for reporting and reproducibility artifacts

### Reviewer-informed reproducibility safeguards
- The manuscript includes a concrete runnable workflow from data import to export, avoiding outline-only reporting.
- Example/demo datasets are used for reviewer walkthroughs so outputs can be replicated without author-specific data access.
- Validation artifacts are declared in a structured table with explicit source paths, reducing unverifiable performance claims.
- Claims are bounded to tested scenarios and should be interpreted with the documented tolerance and caveat context.

### Output interpretation guidance
Interpret outputs jointly across effect estimates, uncertainty intervals, heterogeneity diagnostics, and sensitivity results. For small study counts, rare-event settings, or model-mismatch scenarios, treat asymmetry tests and pooled estimates cautiously. When assumptions are only approximately met (e.g., large-sample approximations), results should be reported with explicit caveats.

### Table 4. Output-to-decision interpretation guide
| Output type | What it tells you | What it does not guarantee | Reporting recommendation |
|---|---|---|---|
| Primary pooled/model estimate | Central tendency under stated assumptions | Universal validity across all settings | Report with assumptions and uncertainty |
| Heterogeneity metrics | Between-study variability signal | Definitive cause of heterogeneity | Pair with subgroup/sensitivity rationale |
| Bias/asymmetry checks | Potential small-study/publication-bias signal | Definitive proof of bias mechanism | Report small-k limitations explicitly |
| Sensitivity analyses | Robustness under alternate assumptions | Immunity to all model misspecification | Present scenario-wise evidence table |

## Use cases
### Demonstration dataset used for manuscript walkthrough
- Dataset profile: Demo pairwise dataset in the development workspace variant
- Rationale: a fixed demo dataset enables reproducible method demonstration and easier reviewer verification.

### Use case 1: Development-build reproduction test
Workflow:
- Load the demo dataset in `Truthcert1_work`.
- Run the full-analysis path and verify expected output panels.
- Export artifacts to compare behavior with the release-aligned build.
Expected outputs for the manuscript:
- Development-run reproducibility trace
- Cross-build comparison evidence

### Use case 2: Pre-release change validation
Workflow:
- Apply candidate setting changes and re-run demo analysis.
- Compare forest, contribution, and interpretation outputs.
- Document any behavior changes before release synchronization.
Expected outputs for the manuscript:
- Actionable pre-release validation notes
- Method-change evidence for team review

### Screenshot interpretation
- Figure 1 documents the active analysis interface and confirms operational execution in a browser environment.
- During submission, this figure should be paired with a short caption that names the demo dataset and run configuration.

### Reviewer-facing walkthrough (replicable package check)
1. Open the primary application file in `Pairwiseai` and load an included demo/example dataset.
2. Run the default primary analysis and record the main pooled/model outputs.
3. Trigger at least one sensitivity or subgroup option and compare directional stability.
4. Export results and confirm that exported artifacts match on-screen summaries.
5. Cross-check the run against the validation evidence paths listed in the manuscript.

### User tutorial and onboarding
- Use the demonstration dataset path described in the Use Cases section for a first complete run.
- Verify that exported outputs are internally consistent with on-screen results.
- Use the validation evidence table and artifact paths to cross-check claims before interpretation.
- Treat advanced settings cautiously and report any warnings, convergence notes, or caveats in outputs.

### Table 5. Assumptions, diagnostics, and caution flags
| Component | Assumption | Recommended diagnostic | Caution flag |
|---|---|---|---|
| Effect model | Chosen form reflects study design and outcome scale | Residual pattern + sensitivity reruns | Large directional shifts across settings |
| Heterogeneity handling | Random-effects assumptions are plausible | Tau/I2/Q-related diagnostics | Small-k instability or extreme heterogeneity |
| Approximation regime | Large-sample approximations adequate for data context | Rare-event and small-k checks | Sparse events / unstable variance |
| Sensitivity module | Alternative settings should not reverse core interpretation without explanation | Structured scenario comparison table | Inference changes without transparent rationale |

## Discussion
The work build demonstrates strong operational reproducibility for core workflows and includes additional automated regression evidence. This increases confidence in day-to-day analytical reliability across tested scenarios.

As a development build, it still requires disciplined version governance and continued validation expansion for broader method claims. Transparent caveat reporting remains essential and should be retained in final submission wording.

### Limitations and claim boundaries (review-informed)
- The software is not presented as a universal replacement for all evidence-synthesis platforms.
- Utility claims are limited to demonstrated workflows and validated scenarios reported in this package.
- Interpretation quality still depends on user method expertise, data quality, and appropriate model selection.
- Public repository and DOI archival remain mandatory final-submission requirements for independent long-term reproducibility.

## Conclusions
TruthCert PairwisePro (Work Build) provides reproducible core functionality with explicit validation artifacts and clear caveat reporting. It is publication-ready as a software tool once final metadata and release positioning are finalized.

<!-- FLOWCHART_BLOCK_START -->
## Workflow Figure Blueprint

### Figure FA1. End-to-end analytical flowchart
Recommended node sequence:
1. Data input and schema checks
2. Model setup and assumptions
3. Primary estimation
4. Diagnostics and heterogeneity review
5. Sensitivity and robustness analysis
6. Export, reporting, and reproducibility checks

Design specifications:
- Use clean vector geometry, no decorative backgrounds.
- Keep labels short, method-focused, and assumption-aware.
- Ensure grayscale legibility for print workflows.
- Keep scientific claims in manuscript text/tables; flowchart is explanatory only.

Proposed figure files:
- `figures/figure00_workflow_flowchart.png` (working draft)
- `figures/figure00_workflow_flowchart.tiff` (submission-ready raster)
- `figures/figure00_workflow_flowchart.eps` (submission-ready vector)

### Infographic-style quick panel
If needed, add a one-panel “study at a glance” infographic summarizing:
- Problem context
- Workflow contribution
- Validation evidence anchor
- Claim boundary statement
<!-- FLOWCHART_BLOCK_END -->

## Figures and visual walkthrough
Figure 1. Full-page interface overview.

Figure 2. Full-page model/analysis workflow view.

Figure 3. Full-page results view.

Figure 4. Full-page bias/sensitivity or robustness view.

Figure 5. Full-page reporting/export or advanced workflow view.

Additional workflow and architecture visuals are presented in-document through the visual abstract and structured tables.

### Submission figure files (separate, 300 DPI; screenshots only)
Only full-page screenshots (Figures 1-5) are submitted as separate figure files.

- `figures/figure01_overview_fullpage.tiff` and `figures/figure01_overview_fullpage.eps`
- `figures/figure02_model_fullpage.tiff` and `figures/figure02_model_fullpage.eps`
- `figures/figure03_results_fullpage.tiff` and `figures/figure03_results_fullpage.eps`
- `figures/figure04_bias_fullpage.tiff` and `figures/figure04_bias_fullpage.eps`
- `figures/figure05_report_fullpage.tiff` and `figures/figure05_report_fullpage.eps`

### Table 3. Reproducibility and submission readiness map
| Item | Local artifact | Current status | Action before external submission |
|---|---|---|---|
| Example walkthrough dataset | `PAIRWISE_BENCHMARK_2026-02-26.md` | Present | Verify rerun on clean machine |
| Validation summary | `f1000_artifacts/validation_summary.md` | Present | Confirm numbers and paths |
| User walkthrough | `f1000_artifacts/tutorial_walkthrough.md` | Present | Align screenshots/captions |
| Repository metadata | `[TO_BE_ADDED_GITHUB_OR_GITLAB_URL]` | Placeholder | Replace after final tagging |
| DOI metadata | `[TO_BE_ADDED_ZENODO_DOI]` | Placeholder | Replace after Zenodo archive creation |

## Software availability
- Local source package: `Pairwiseai` under `C:\HTML apps`.
- Public repository (placeholder): `[TO_BE_ADDED_GITHUB_OR_GITLAB_URL]`
- Zenodo DOI (placeholder): `[TO_BE_ADDED_ZENODO_DOI]`
- Version: see manuscript title and application UI version label.
- Reproducibility walkthrough: `f1000_artifacts/tutorial_walkthrough.md`
- Validation summary: `f1000_artifacts/validation_summary.md`
- License: see package `LICENSE` file.
- Note: repository and DOI placeholders are intentionally retained until release archival is finalized.
## Data availability
No new participant-level clinical data were generated for this software article package. Example dataset for reviewer walkthrough: `PAIRWISE_BENCHMARK_2026-02-26.md`. Additional project data assets, where present, remain available within the local package tree.
## Reporting guidelines
Real-peer-review-aligned checklist included: `F1000_Submission_Checklist_RealReview.md`. This checklist directly addresses the criticisms documented in `C:\HTML apps\reviewer Report.txt`.
## Declarations
### Competing interests
The author declares that no competing interests were disclosed.

### Grant information
No specific grant was declared for this manuscript draft.

### Author contributions (CRediT)
| Author | CRediT roles |
|---|---|
| Mahmood Ahmad | Conceptualization; Software; Validation; Data curation; Writing - original draft; Writing - review and editing |
| Niraj Kumar | Conceptualization |
| Bilaal Dar | Conceptualization |
| Laiba Khan | Conceptualization |
| Andrew Woo | Conceptualization |

### Acknowledgements
The author acknowledges contributors to open statistical methods and browser-based scientific visualization ecosystems.

## References
1. DerSimonian R, Laird N. Meta-analysis in clinical trials. Controlled Clinical Trials. 1986;7(3):177-188.
2. Higgins JPT, Thompson SG. Quantifying heterogeneity in a meta-analysis. Statistics in Medicine. 2002;21(11):1539-1558.
3. Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ. 2021;372:n71.
4. Guyatt GH, Oxman AD, Vist GE, et al. GRADE: an emerging consensus on rating quality of evidence and strength of recommendations. BMJ. 2008;336(7650):924-926.
