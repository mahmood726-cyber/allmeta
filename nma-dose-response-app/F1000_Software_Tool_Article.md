# NMA Dose Response Studio: a software tool for network meta-analysis with dose-response modeling

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
**Background:** Network meta-analysis with dose-response components is methodologically rich but workflow-intensive. NMA Dose Response Studio was developed to combine model control, robustness diagnostics, and reporting support in one browser environment.

**Methods:** The software is available as a standalone browser build and package-managed source project. Exposed modules include model-family and tau2 controls, selection-bias sensitivity options, PRISMA-oriented checks, Bayesian model averaging output, GOSH analysis, influence diagnostics, and export pathways. A Playwright browser workflow was used on 2026-03-01 to capture representative full-page interface states from the local runnable build.

**Results:** The software completed end-to-end browser workflows for data input, model execution, visual analytics, and export within the domain-specific interface.

**Conclusions:** NMA Dose Response Studio provides a practical browser-native workflow for evidence synthesis; final submission readiness depends on attaching a public repository link and DOI-archived release metadata.

## Keywords
network meta-analysis; dose-response; treatment ranking; GOSH; Bayesian model averaging

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
Network dose-response synthesis combines multi-treatment evidence with dose modeling, creating a high burden for reproducible operational workflows. When steps are split across tools, transparency and review efficiency decline.

NMA Dose Response Studio integrates these tasks in one interface and provides benchmark artifacts for key R package comparisons. This paper presents the implemented workflow with calibrated claims tied to reported benchmark evidence.

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
The application orchestrates model controls, heterogeneity options, ranking routines, and robustness modules through an interactive single-page runtime. It includes dedicated components for bias sensitivity, small-sample corrections, GOSH-style exploration, and export-oriented reporting support.

### Installation and local execution requirements
- Confirm required runtime dependencies listed in `README.md` and project environment files.
- Use a clean environment for first-run verification to avoid hidden local-state effects.
- Run the documented primary entry point and capture logs/screenshots for reproducibility notes.
- If package-specific dependencies are unavailable, record the exact version mismatch and fallback behavior.

### Operation
- Open `nma-studio-standalone.html` and load the demonstration network dataset.
- Configure treatment-dose and heterogeneity settings, then run core model estimation.
- Review ranking outputs together with influence/sensitivity diagnostics and robustness indicators.
- Export outputs and reporting artifacts for manuscript and decision-team use.

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
| E1 | Sampling distribution model | `y_{ik} \sim \mathcal{N}(\delta_{ik}, s_{ik}^2)` | Defines how observed arm-level effects are distributed around the latent treatment effect. |
| E2 | Dose-response network linear predictor | `\delta_{ik} = d_{t(k)} + f_{t(k)}(dose_{ik}) - d_{ref} + u_i, \quad u_i \sim \mathcal{N}(0,\tau^2)` | Combines treatment and dose terms with random effects to estimate arm-level comparative outcomes. |
| E3 | Treatment ranking metric (SUCRA) | `SUCRA_t = \frac{1}{K-1}\sum_{r=1}^{K-1} \left[1 - P(\mathrm{rank}_t \le r)\right]` | Summarizes the probability that each treatment ranks near the top across network comparisons. |

### Reproducibility and validation
All analytic states are controlled through explicit user-configurable parameters and exportable outputs. In this manuscript, demonstration workflows were repeated under fixed settings to confirm stable behavior across reruns, and figure generation was standardized to full-page captures for consistent interpretation.

<!-- R_VALIDATION_TABLE_START -->
#### R validation evidence table
| Validation dimension | Evidence summary | Artifact source |
|---|---|---|
| Comparator environment | R package benchmarks generated with dosresmeta 2.2.0, netmeta 3.2.0. | bench/benchmark_r_packages_results_combined.json |
| Benchmark scope | netmeta: studies=4, comparisons=15; dosresmeta treatments=3. | bench/benchmark_r_packages_results_combined.json |
| Cross-check scope | 4 treatment-model scenarios matched between JS and R benchmark outputs. | bench/benchmark_js_results.json; bench/benchmark_r_results.json |
| Observed differences | max \|target diff\|=7.77e-16; max \|AIC diff\|=12.9; max \|AUC diff\|=2.39. | bench/benchmark_js_results.json; bench/benchmark_r_results.json |
| Run status | Benchmark execution completed; netmeta error=None, dosresmeta error=None. | bench/benchmark_r_packages_results_combined.json |
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
- Dataset profile: Demo network dataset with multi-dose treatment arms
- Rationale: a fixed demo dataset enables reproducible method demonstration and easier reviewer verification.

### Use case 1: Dose-target ranking demonstration
Workflow:
- Import demo network data and choose the target dose strategy.
- Run the primary NMA dose-response model.
- Inspect treatment ranking outputs and uncertainty diagnostics.
- Export model summary for decision-team discussion.
Expected outputs for the manuscript:
- Dose-aware treatment ranking tables
- Primary robustness diagnostics

### Use case 2: Robustness triangulation
Workflow:
- Repeat runs with alternative tau2 and bias-sensitivity settings.
- Compare ranking stability, influence diagnostics, and GOSH outputs.
- Report settings that materially alter conclusions.
Expected outputs for the manuscript:
- Triangulated robustness narrative
- Reproducible sensitivity appendix content

### Screenshot interpretation
- Figure 1 documents the active analysis interface and confirms operational execution in a browser environment.
- During submission, this figure should be paired with a short caption that names the demo dataset and run configuration.

### Reviewer-facing walkthrough (replicable package check)
1. Open the primary application file in `nma-dose-response-app` and load an included demo/example dataset.
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
The platform's practical value lies in linking network setup, dose modeling, and output export inside a single reproducible path. The R-validation table documents benchmark context and observed differences for the current artifact set.

Limitations include benchmark heterogeneity across scenarios and metrics, with some quantities showing larger divergence than others. Interpretation should therefore privilege clinically and methodologically material agreement and clearly report where differences remain.

### Limitations and claim boundaries (review-informed)
- The software is not presented as a universal replacement for all evidence-synthesis platforms.
- Utility claims are limited to demonstrated workflows and validated scenarios reported in this package.
- Interpretation quality still depends on user method expertise, data quality, and appropriate model selection.
- Public repository and DOI archival remain mandatory final-submission requirements for independent long-term reproducibility.

## Conclusions
NMA Dose Response Studio provides an integrated network dose-response workflow with transparent benchmark reporting. It is appropriate for software publication once final repository and DOI metadata are attached.

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
| Example walkthrough dataset | `bench\benchmark.csv` | Present | Verify rerun on clean machine |
| Validation summary | `f1000_artifacts/validation_summary.md` | Present | Confirm numbers and paths |
| User walkthrough | `f1000_artifacts/tutorial_walkthrough.md` | Present | Align screenshots/captions |
| Repository metadata | `[TO_BE_ADDED_GITHUB_OR_GITLAB_URL]` | Placeholder | Replace after final tagging |
| DOI metadata | `[TO_BE_ADDED_ZENODO_DOI]` | Placeholder | Replace after Zenodo archive creation |

## Software availability
- Local source package: `nma-dose-response-app` under `C:\HTML apps`.
- Public repository (placeholder): `[TO_BE_ADDED_GITHUB_OR_GITLAB_URL]`
- Zenodo DOI (placeholder): `[TO_BE_ADDED_ZENODO_DOI]`
- Version: see manuscript title and application UI version label.
- Reproducibility walkthrough: `f1000_artifacts/tutorial_walkthrough.md`
- Validation summary: `f1000_artifacts/validation_summary.md`
- License: see package `LICENSE` file.
- Note: repository and DOI placeholders are intentionally retained until release archival is finalized.
## Data availability
No new participant-level clinical data were generated for this software article package. Example dataset for reviewer walkthrough: `bench\benchmark.csv`. Additional project data assets, where present, remain available within the local package tree.
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
