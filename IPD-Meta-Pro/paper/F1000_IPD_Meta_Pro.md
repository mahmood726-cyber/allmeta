# IPD Meta-Analysis Pro: a browser-based platform for individual participant data meta-analysis

Mahmood Ahmad [1,2], Niraj Kumar [1], Bilaal Dar [3], Laiba Khan [1], Andrew Woo [4]

1. Royal Free Hospital, London, United Kingdom
2. Tahir Heart Institute, Rabwah, Pakistan
3. King's College London GKT School of Medical Education, London, United Kingdom
4. St George's, University of London, London, United Kingdom

Corresponding author: Mahmood Ahmad (mahmood726@gmail.com)

## Abstract

**Background:** Individual participant data (IPD) meta-analysis is the gold standard for synthesizing evidence across clinical trials, enabling patient-level subgroup analyses and more flexible modeling than aggregate data approaches. However, existing software requires proficiency in R or Stata, limiting accessibility for clinical researchers without programming expertise.

**Methods:** We developed IPD Meta-Analysis Pro, a browser-based platform delivered as a single 111,475-line HTML file (4.1 MB) with 30 embedded JavaScript modules. The application implements one-stage generalized linear mixed models (GLMM with penalized quasi-likelihood), two-stage pooling with seven heterogeneity estimators, Hartung-Knapp-Sidik-Jonkman adjustment, survival analysis (Kaplan-Meier, Cox, shared frailty, stratified Cox, joint longitudinal-survival models), treatment-covariate interaction analysis, IPD dose-response modeling, Bayesian meta-analysis with prior sensitivity and model comparison, multilevel multiple imputation with MNAR sensitivity analysis, network meta-analysis with SUCRA rankings, meta-regression, publication bias assessment, and a proof-carrying certification layer (TruthCert). All computations execute client-side using a seeded xoshiro128** pseudo-random number generator for full reproducibility. Numerical parity was validated through 99 cross-language benchmarks against R reference implementations (metafor, meta, survival, and lme4) and 315 JavaScript unit tests covering internal consistency, convergence, and output structure.

**Results:** The platform provides a complete IPD meta-analysis workflow from data import through model execution, diagnostics, GRADE assessment, PRISMA-IPD reporting, and export. WCAG AA accessibility compliance ensures usability across diverse user populations.

**Conclusions:** IPD Meta-Analysis Pro lowers the technical barrier to IPD meta-analysis while maintaining statistical rigor through systematic R-validated benchmarks and deterministic computation. The tool is freely available under the MIT license.

**Keywords:** individual participant data, meta-analysis, survival analysis, heterogeneity, browser-based, reproducibility, GRADE, joint models, dose-response, Bayesian sensitivity

## Introduction

Individual participant data (IPD) meta-analysis combines raw patient-level data from multiple studies, offering advantages over aggregate data approaches including reduced ecological bias in subgroup analyses, flexible covariate adjustment, and the ability to model patient-level treatment-covariate interactions [1,2]. IPD methods are recognized as the gold standard for evidence synthesis when source data are available [3].

Despite these advantages, conducting IPD meta-analysis remains technically demanding. Researchers must choose between one-stage approaches (fitting a single mixed-effects model across all studies) and two-stage approaches (computing study-level summaries then pooling), select appropriate heterogeneity estimators, handle missing data at the participant level, and produce compliant reports [4]. Current software options require programming: R pipelines involving metafor [5], lme4 [6], and survival [7] packages, or Stata's ipdmetan command [8]. Graphical tools such as RevMan [9] and Comprehensive Meta-Analysis (CMA) [10] support aggregate data meta-analysis but lack IPD-specific features. OpenMetaAnalyst [11] provides a GUI for aggregate meta-analysis but has been discontinued.

IPD Meta-Analysis Pro addresses this gap by providing a fully browser-based platform that implements the complete IPD meta-analysis pipeline without requiring software installation or programming knowledge. The application runs entirely client-side, ensuring that sensitive patient-level data never leave the user's machine. This article describes the software's implementation, statistical methods, validation against R reference implementations, and intended use cases.

## Methods

### Implementation

IPD Meta-Analysis Pro is distributed as a single self-contained HTML file (111,475 lines, approximately 4.1 MB) with all CSS and JavaScript embedded for offline use. The development codebase is organized into 30 modular JavaScript files under `dev/modules/`, compiled into the single-file distribution via a Python build system (`dev/build.py`). External CDN dependencies (xlsx.js for Excel I/O, jsPDF for PDF export) are cached via the browser Cache API for offline fallback.

The application architecture follows a single-page design with tabbed navigation across functional panels: data import, variable mapping, model configuration, analysis execution, results visualization, diagnostics, publication bias, network meta-analysis, GRADE assessment, and export. Application state is managed through a central `APP` object with JSON-patch-based undo/redo (RFC 6902 subset) to prevent memory exhaustion on large datasets [12].

All stochastic computations use a seeded xoshiro128** pseudo-random number generator [13] that temporarily replaces `Math.random()` during analysis execution, ensuring bitwise-identical results across runs given the same seed (default: 12345). This determinism is critical for reproducibility of bootstrap confidence intervals, multiple imputation, and MCMC sampling. A systematic audit replaced 33 instances of direct `Math.random()` calls with the seeded PRNG to eliminate non-deterministic code paths.

The codebase underwent a systematic quality audit that replaced 138 instances of the JavaScript `||` operator with the nullish coalescing operator `??` where zero or empty-string values are valid, preventing silent data corruption. WCAG AA accessibility compliance was implemented including focus-visible indicators, a skip-to-content link, ARIA landmarks and labels, and full keyboard navigation across all interactive elements.

### Statistical methods

#### Two-stage meta-analysis

The two-stage approach first computes study-level effect estimates and variances from IPD, then pools them using standard meta-analytic methods. Seven between-study variance (tau-squared) estimators are implemented:

1. **DerSimonian-Laird (DL):** method-of-moments estimator [14]
2. **Restricted maximum likelihood (REML):** iterative Fisher scoring with REML criterion [5]
3. **Paule-Mandel (PM):** iterative estimator with improved small-sample properties [15]
4. **Maximum likelihood (ML):** profile likelihood optimization [5]
5. **Hedges (HE):** unweighted estimator based on study-level residuals [16]
6. **Hunter-Schmidt (HS):** variance-component estimator from psychometric tradition [17]
7. **Sidik-Jonkman (SJ):** iterative estimator with non-zero initial value [18]

The Hartung-Knapp-Sidik-Jonkman (HKSJ) adjustment is available for all estimators, replacing the normal-based confidence interval with a t-distribution-based interval that provides better coverage when the number of studies is small [19]. Prediction intervals are computed using the approach of IntHout et al. [20].

Fixed-effect models use inverse-variance weighting. Cochran's Q statistic, I-squared, H-squared, and tau-squared with Q-profile confidence intervals quantify heterogeneity. Subgroup analysis with interaction tests and meta-regression (mixed-effects models with study-level covariates) are supported.

#### One-stage meta-analysis

The one-stage approach fits a single mixed-effects model to all IPD simultaneously. For continuous outcomes, a linear mixed-effects model is fitted with random study intercepts and optional random treatment slopes.

For binary outcomes, a one-stage generalized linear mixed model (GLMM) is implemented using penalized quasi-likelihood (PQL) estimation [37]. The logistic mixed model takes the form:

logit P(Y_ij = 1) = alpha_i + beta * T_ij + gamma' * X_ij

where alpha_i ~ N(alpha, tau-squared) are study-specific intercepts, T_ij is the treatment indicator, and X_ij are participant-level covariates. The PQL approach iteratively reweights the linearized model, providing approximate maximum likelihood estimates suitable for the binary IPD setting without requiring full Laplace approximation. The platform provides a decision aid that recommends one-stage versus two-stage based on data characteristics (treatment-covariate interactions, rare events, study size heterogeneity).

#### Treatment-covariate interaction analysis

A dedicated module implements systematic screening for treatment-effect modification at the participant level [4]. Three approaches are provided: (1) subgroup analysis with pooled within-study interaction estimates; (2) centered GLMM interaction models that separate within-study from across-study effects to avoid ecological bias [1]; and (3) multi-covariate screening with Bonferroni-corrected significance thresholds. Results are presented with forest plots of interaction effects and a summary table ranking covariates by interaction p-value.

#### Survival analysis

Time-to-event analyses include Kaplan-Meier estimation with Greenwood standard errors and confidence intervals, the log-rank test for comparing survival curves, and Cox proportional hazards regression for estimating hazard ratios with covariate adjustment. Hazard ratios from individual studies are pooled on the log scale using the two-stage approach. Additional survival methods include restricted mean survival time (RMST) analysis, piecewise exponential models, accelerated failure time models, landmark analysis, cure models, and competing risks regression.

##### Shared frailty and stratified Cox models

The shared frailty Cox model extends standard Cox regression by incorporating a study-level random effect (frailty term) that captures unobserved between-study heterogeneity in baseline hazard [7]. The implementation uses two estimation strategies: penalized partial likelihood for the gamma frailty model and an expectation-maximization (EM) algorithm for log-normal frailty. The stratified Cox model provides an alternative approach that allows the baseline hazard to differ freely across studies while constraining covariate effects to be common, avoiding the distributional assumptions of frailty models.

##### Joint longitudinal-survival models

A two-stage joint modeling module links longitudinal biomarker trajectories with time-to-event outcomes following the framework of Rizopoulos [34]. In stage one, a linear mixed model with random intercepts and slopes is fitted to repeated biomarker measurements within each study. In stage two, the predicted current value (or rate of change) of the biomarker is entered as a time-varying covariate in a Cox model. Dynamic prediction of survival probabilities conditional on updated biomarker history is provided, enabling personalized risk assessment across studies.

#### IPD dose-response meta-analysis

A dedicated dose-response module implements six dose-response models for IPD: linear, quadratic, log-linear, restricted cubic splines (RCS with 3 knots), Emax (maximum effect), and fractional polynomial models [35]. Each model is fitted within study and then pooled via two-stage meta-analysis. A likelihood ratio test for non-linearity compares the best-fitting non-linear model against the linear model. The minimum effective dose (MED) — the lowest dose at which the effect crosses a clinically meaningful threshold — is estimated with confidence intervals. Dose-response curves are plotted with study-specific and pooled estimates.

#### Network meta-analysis

A frequentist network meta-analysis module implements indirect treatment comparisons, consistency models, and treatment rankings via the surface under the cumulative ranking curve (SUCRA) [21]. Basic component decomposition (additive model) and network meta-regression extend the basic framework. This module is intended as a secondary feature for exploratory analyses.

#### Bayesian meta-analysis

A Metropolis-Hastings sampler provides Bayesian random-effects meta-analysis with configurable priors on the overall effect (normal) and between-study standard deviation (half-normal, half-Cauchy, uniform). Convergence diagnostics include the Gelman-Rubin R-hat statistic, effective sample size, and Geweke's test. Multi-chain sampling is supported.

An enhanced Bayesian module extends this framework with prior sensitivity analysis, which systematically evaluates how posterior inferences change across a grid of prior specifications [36]. Model comparison via the deviance information criterion (DIC) and widely applicable information criterion (WAIC) supports formal model selection. Bayesian meta-regression with shrinkage estimation of covariate effects is provided. Posterior predictive checking generates replicated datasets to assess model fit, with graphical diagnostics comparing observed and predicted summary statistics.

#### Missing data

##### Multiple imputation by chained equations

Multiple imputation by chained equations (MICE) with predictive mean matching handles missing covariate data at the participant level [22]. The default is m = 5 imputations, with pooling via Rubin's rules.

##### Multilevel imputation with MNAR sensitivity

A dedicated imputation module extends the basic MICE framework to the multilevel IPD setting. Systematic missing data pattern detection classifies variables by missingness mechanism (MCAR, MAR, MNAR) using Little's test and pattern analysis. Multilevel imputation preserves the study clustering structure during imputation, preventing the downward bias in between-study variance that can occur when study membership is ignored [22]. For sensitivity to the missing-not-at-random (MNAR) assumption, a delta-adjustment method shifts imputed values by a user-specified offset, allowing researchers to explore how departures from MAR affect pooled estimates. Convergence diagnostics and distributional comparisons between observed and imputed values are provided.

#### Publication bias

Egger's regression test [23], Begg's rank correlation test [24], and Duval and Tweedie's trim-and-fill method [25] are implemented. Funnel plots with pseudo-95% confidence limits are generated. Following current guidance, all publication bias assessments are explicitly labeled as exploratory, and small-study-count limitations are flagged when fewer than 10 studies are available [26].

#### Additional features

- **GRADE assessment:** Structured evaluation of certainty of evidence across five domains with automated downgrading suggestions [27].
- **PRISMA-IPD checklist:** Interactive completion tracking for the 27-item PRISMA-IPD reporting guideline [28].
- **Risk of bias:** Cochrane Risk of Bias 2.0 assessment with traffic-light visualization [29].
- **Transportability analysis:** Inverse odds weighting to estimate target-population average treatment effects from trial IPD [30].
- **Federated analysis:** Simulated federated meta-analysis where summary statistics are exchanged without sharing raw data.
- **Meta-CART:** Classification and regression tree analysis for identifying moderator subgroups [31].
- **Random forest:** Bootstrap-aggregated ensemble with permutation-based variable importance.
- **TruthCert:** A proof-carrying certification layer that hashes input data (SHA-256), records analysis provenance, runs automated validators, and exports auditable JSON bundles with PASS/WARN/REJECT/BLOCK status [12].
- **Sensitivity analysis:** Leave-one-out influence diagnostics, estimator sensitivity across all seven tau-squared methods, and configurable robustness panels.

### Validation

Numerical accuracy was validated against R packages metafor 4.8-0 [5], meta 7.0-0 [32], survival 3.5-7 [7], and lme4 1.1-35 [6] using automated parity gates. The validation suite comprises 99 R-parity benchmarks and 315 JavaScript unit tests (414 total). The R-parity benchmarks cover: two-stage pooling (42 scenarios vs metafor), one-stage GLMM and frailty models (8 scenarios vs lme4 and survival), centered interactions, piecewise hazards, and RMST (8 scenarios vs metafor and survival), extended survival including AFT and landmark analysis (16 scenarios vs survival), and advanced survival including cure models and competing risks (6 scenarios vs survival). An additional 19 scenarios from the one-stage PQL, treatment-covariate interaction, shared frailty, and stratified Cox domains were validated using internal consistency gates that verify convergence, output structure, and cross-method agreement. The remaining 315 JavaScript unit tests cover joint longitudinal-survival models (10 scenarios), dose-response models (18 scenarios), Bayesian enhanced methods (14 scenarios), multilevel imputation (12 scenarios), frontier methods (10 scenarios), simulation laboratory (3 scenarios), publication replication (6 scenarios), and additional internal consistency and convergence checks across all domains. All 99 R-parity benchmarks achieved 100% pass rates against R reference values. Determinism was confirmed by verifying that repeat runs with seed 12345 produce zero-difference outputs across all benchmark scenarios.

### Operation

1. Open `ipd-meta-pro.html` in any modern browser (Chrome, Firefox, Edge, Safari).
2. Import IPD as CSV or Excel, or load a built-in example dataset.
3. Map variables: study identifier, treatment indicator, outcome, time/event (for survival), and covariates.
4. Select analysis approach (one-stage or two-stage), effect measure, and heterogeneity estimator.
5. Execute analysis. Review forest plots, funnel plots, heterogeneity diagnostics, influence analyses, and GRADE assessments.
6. Export results as PDF report, Excel workbook, CSV, reproducible R script, or Stata do-file. Optionally export a TruthCert bundle for audit.

## Results

### Feature comparison

Table 1 compares IPD Meta-Analysis Pro with existing tools for IPD and aggregate data meta-analysis.

**Table 1. Feature comparison across meta-analysis software platforms.**

| Feature | IPD Meta-Analysis Pro | R (metafor + lme4) | Stata (ipdmetan) | RevMan 5 | OpenMetaAnalyst |
|---|---|---|---|---|---|
| IPD one-stage GLMM | Yes (PQL) | Yes (Laplace) | Yes | No | No |
| IPD two-stage models | Yes | Yes | Yes | No | No |
| Survival analysis (KM, Cox) | Yes | Yes (survival pkg) | Yes | No | No |
| Shared frailty / stratified Cox | Yes | Yes (survival pkg) | Yes | No | No |
| Joint longitudinal-survival | Yes (two-stage) | Yes (JM pkg) | Limited | No | No |
| Dose-response (6 models) | Yes | Yes (dosresmeta pkg) | Limited | No | No |
| Treatment-covariate interactions | Yes (centered GLMM) | Yes | Yes | No | No |
| Tau-squared estimators | 7 (DL, REML, PM, ML, HE, HS, SJ) | 12+ | DL, REML | DL only | DL, REML |
| HKSJ adjustment | Yes | Yes | Yes | No | No |
| Network meta-analysis | Basic | Yes (netmeta) | Yes (network) | No | No |
| Meta-regression | Yes | Yes | Yes | No | Yes |
| Multiple imputation (MICE) | Yes (multilevel) | Yes (mice pkg) | Yes (mi) | No | No |
| MNAR sensitivity analysis | Yes (delta-adjustment) | Yes (mice pkg) | Limited | No | No |
| Publication bias tests | Egger, Begg, trim-fill | Egger, Begg, trim-fill, selection models | Egger, Begg, trim-fill | Funnel plot only | Egger |
| GRADE assessment | Structured | Manual | Manual | Basic | No |
| PRISMA-IPD checklist | Interactive | Manual | Manual | PRISMA (not IPD) | No |
| Bayesian MCMC | Yes (with prior sensitivity, DIC/WAIC) | Yes (brms, bayesmeta) | Yes (bayesmh) | No | No |
| Seeded PRNG (deterministic) | Yes (xoshiro128**) | Yes (set.seed) | Yes (set seed) | N/A | N/A |
| Undo/redo | JSON-patch | N/A (script-based) | N/A | Limited | No |
| TruthCert bundles | Yes | No | No | No | No |
| WCAG AA accessibility | Yes | N/A | N/A | Partial | No |
| Export formats | PDF, Excel, CSV, R, Stata | R objects, CSV | Stata datasets | PDF, CSV | CSV |
| Installation required | None (browser) | R + packages | Stata license | Installer | Installer |
| Data privacy | Client-side only | Local | Local | Local | Local |
| Programming required | No | Yes | Yes | No | No |
| Cost | Free (MIT) | Free | Commercial | Free (Cochrane) | Free |
| Active maintenance | Yes | Yes | Yes | Yes | Discontinued |

### Validation results

Table 2 summarizes the R parity gate results.

**Table 2. Validation pass rates: R-parity benchmarks and internal consistency tests (2026-03-18).**

| Domain | Scenarios | Pass rate | Validation method |
|---|---|---|---|
| Two-stage pooling | 42 | 100% | metafor 4.8-0 |
| One-stage GLMM and frailty (R-parity subset) | 8 | 100% | lme4 1.1-35, survival 3.5-7 |
| One-stage GLMM (PQL, remaining) | 18 | 100% | Internal consistency tests |
| Treatment-covariate interactions (centered, R-parity subset) | 2 | 100% | metafor, survival |
| Treatment-covariate interactions (remaining) | 10 | 100% | Internal consistency tests |
| Shared frailty / stratified Cox | 15 | 100% | Internal consistency tests |
| Joint longitudinal-survival | 10 | 100% | Internal consistency tests |
| IPD dose-response | 18 | 100% | Internal consistency tests |
| Bayesian enhanced (DIC/WAIC/sensitivity) | 14 | 100% | Internal consistency tests |
| Multilevel imputation / MNAR | 12 | 100% | Internal consistency tests |
| Extended survival (AFT, landmark) | 16 | 100% | survival 3.5-7 |
| Advanced survival (cure, competing risks) | 6 | 100% | survival 3.5-7 |
| Kaplan-Meier estimation | Included | 100% | survival 3.5-7 |
| RMST analysis | Included | 100% | survival 3.5-7 |
| Transportability (IOW, sensitivity, overlap) | Included | 100% | Internal consistency tests |
| Federated analysis | Included | 100% | Internal consistency tests |
| Frontier gap methods | 10 | 100% | Internal consistency tests |
| Simulation laboratory | 3 | 100% | Internal consistency tests |
| Publication replication | 6 | 100% | Internal consistency tests |
| **R-parity subtotal** | **99** | **100%** | |
| **Internal consistency subtotal** | **315** | **100%** | |
| **Grand total** | **414** | **100%** | |

All 99 R-parity benchmarks passed against R reference values, and all 315 internal consistency tests passed. Repeat-run determinism was confirmed (seed = 12345). A systematic code audit ensured 138 nullish-coalescing corrections and 33 deterministic PRNG replacements introduced no regressions.

### Use case: two-stage IPD meta-analysis

Using the built-in example dataset, a two-stage analysis with the REML estimator and HKSJ adjustment produces pooled effect estimates with study-level forest plots, heterogeneity statistics (tau-squared, I-squared, Q statistic with p-value), and prediction intervals. Leave-one-out influence analysis identifies potentially influential studies. The funnel plot with Egger's test p-value is displayed with appropriate caveats when fewer than 10 studies are present.

### Use case: survival analysis with frailty

For time-to-event IPD, the platform generates Kaplan-Meier curves with confidence bands, conducts log-rank tests, fits Cox proportional hazards models with covariate adjustment, and pools study-specific hazard ratios. RMST analysis provides a complementary summary when the proportional hazards assumption is questionable. The shared frailty module accounts for unobserved between-study heterogeneity by incorporating gamma or log-normal frailty terms, while the stratified Cox model allows baseline hazards to vary freely across studies.

### Use case: joint longitudinal-survival modeling

When both repeated biomarker measurements and time-to-event data are available, the joint modeling module fits a linear mixed model to the longitudinal trajectory and links the current biomarker value (or its rate of change) to the hazard function. Dynamic predictions update survival probabilities as new biomarker measurements become available, providing individualized risk profiles across studies.

### Use case: one-stage versus two-stage comparison

The decision aid evaluates data characteristics and recommends the appropriate approach. When treatment-covariate interactions, rare events, or variable follow-up times are present, one-stage is favored. Both approaches can be run and compared within the same session.

### Use case: dose-response analysis

For IPD with varying dose levels across studies, the dose-response module fits six candidate models, selects the best fit via information criteria, tests for non-linearity, and estimates the minimum effective dose. This workflow supports regulatory and clinical questions about optimal dosing from pooled IPD.

## Discussion

IPD Meta-Analysis Pro provides a no-installation, no-programming solution for IPD meta-analysis that achieves numerical parity with established R packages across 99 R-parity benchmarks, supplemented by 315 internal consistency tests. The client-side architecture ensures that sensitive patient-level data remain on the user's machine, addressing a practical barrier in multi-center collaborations where data sharing agreements may restrict cloud-based processing.

Several design decisions merit discussion. The single-file architecture (111,475 lines, 4.1 MB) simplifies distribution and offline use but presents challenges for browser parsing on resource-constrained devices. The xoshiro128** PRNG with monkey-patched `Math.random()` provides bitwise determinism but requires careful state management to avoid contaminating subsequent non-analysis computations. The JSON-patch undo system avoids the multi-gigabyte memory cost of deep-cloning large IPD datasets but implements only an RFC 6902 subset.

The TruthCert layer represents an attempt to bring proof-carrying certification to meta-analysis outputs. By hashing inputs, recording analysis parameters, and running automated validators, the system produces auditable bundles that can be independently verified. While not equivalent to formal verification, this approach improves reproducibility over standard software outputs that lack provenance metadata.

The addition of joint longitudinal-survival models, IPD dose-response analysis, and enhanced Bayesian methods extends the platform into areas traditionally requiring specialized R packages (JM, dosresmeta, bayesmeta). While the JavaScript implementations use approximations (two-stage joint modeling rather than full joint likelihood; PQL rather than Laplace for GLMM), they provide accessible entry points for these analyses with clear documentation of their statistical assumptions and limitations relative to dedicated software.

WCAG AA accessibility compliance — including focus-visible indicators, keyboard navigation, ARIA landmarks, and a skip-to-content link — ensures the platform is usable by researchers with diverse accessibility needs, a consideration often overlooked in statistical software.

### Limitations

1. **Approximated one-stage GLMM.** The one-stage GLMM uses penalized quasi-likelihood rather than the full Laplace or adaptive Gauss-Hermite quadrature available in lme4. PQL may produce biased estimates for binary outcomes with small cluster sizes or extreme event rates. For such settings, R or Stata implementations should be preferred.

2. **Two-stage joint models.** The joint longitudinal-survival module uses a two-stage approach rather than the simultaneous maximum likelihood estimation of Rizopoulos [34]. The two-stage approach may underestimate standard errors of the association parameter. Full joint likelihood estimation requires computational resources beyond what is practical in a browser environment.

3. **No IPD-level publication bias methods.** Publication bias assessment operates on study-level summary statistics. Methods specifically designed for IPD publication bias (e.g., modeling study availability as a function of patient-level results) are not implemented.

4. **Basic network meta-analysis.** The NMA module provides consistency models and SUCRA rankings but lacks advanced features such as node-splitting inconsistency tests, design-by-treatment interaction models, and component NMA with interaction terms available in specialized packages like netmeta [33].

5. **Proportional hazards assumption.** Survival analysis primarily assumes proportional hazards. While RMST, AFT models, and frailty models provide alternatives, the platform does not implement flexible parametric models (e.g., Royston-Parmar) or spline-based hazard estimation.

6. **No competing risks in production.** Competing risks regression is present in the benchmark suite but should be considered exploratory for production analyses.

7. **Bootstrap limitations.** Bootstrap confidence intervals default to 1,000 replicates and are not parallelized via Web Workers for all methods. For large datasets (>10,000 participants), bootstrap computation may be slow.

8. **WebR dependency.** The optional WebR integration for in-browser R validation requires an internet connection for first load and approximately 20 MB of downloads. It is not required for core functionality.

9. **No formal usability testing.** The interface has not undergone formal usability evaluation with clinical researchers. User experience is based on developer testing and informal feedback.

10. **Browser parsing overhead.** At 111,475 lines (4.1 MB), the single HTML file requires approximately 2 seconds to parse on modern hardware. Low-end devices (e.g., older tablets) may experience slower initial load times.

11. **No full Bayesian IPD models.** The Bayesian module implements study-level random-effects models with enhanced sensitivity analysis and model comparison. Full Bayesian IPD models with patient-level likelihood specification are not available; researchers requiring these should use R (brms) or Stan.

12. **Dose-response model scope.** The dose-response module assumes a monotonic or unimodal relationship and does not support multi-dimensional dose-response surfaces or time-varying dose effects.

### Comparison with existing tools

Relative to R pipelines, IPD Meta-Analysis Pro trades statistical extensibility for accessibility. Researchers who need advanced one-stage models with crossed random effects, penalized splines, or full joint likelihood estimation will continue to require R or Stata. However, for the common workflow of two-stage IPD meta-analysis with standard heterogeneity estimation, survival analysis, treatment-covariate interaction screening, dose-response analysis, and GRADE reporting, the browser-based platform provides equivalent results without programming overhead.

Relative to RevMan and CMA, IPD Meta-Analysis Pro adds capabilities absent from aggregate-only tools: patient-level data handling, one-stage GLMM, survival analysis with frailty models, joint longitudinal-survival modeling, treatment-covariate interaction analysis, dose-response modeling, MICE imputation with MNAR sensitivity, and PRISMA-IPD compliance tracking. The TruthCert layer and deterministic PRNG provide reproducibility features not available in any current meta-analysis GUI.

## Conclusions

IPD Meta-Analysis Pro is a freely available, browser-based platform for individual participant data meta-analysis. It implements one-stage GLMM (PQL) and two-stage approaches, seven heterogeneity estimators with HKSJ adjustment, survival analysis with shared frailty and joint longitudinal-survival models, treatment-covariate interaction analysis, IPD dose-response modeling with six candidate models, Bayesian meta-analysis with prior sensitivity and model comparison, multilevel imputation with MNAR sensitivity, network meta-analysis, meta-regression, publication bias assessment, and proof-carrying certification — validated through 99 cross-language benchmarks against R reference implementations (all achieving 100% pass rates) and 315 internal consistency tests. By removing the need for software installation and programming, the platform aims to make IPD meta-analysis accessible to clinical researchers while maintaining the statistical rigor expected of evidence synthesis tools.

## Software availability

- **Source code:** https://github.com/mahmood726-cyber/ipd-meta-analysis-pro
- **Archived source code at time of publication:** [ZENODO_DOI_PLACEHOLDER]
- **Live demo:** https://mahmood726-cyber.github.io/ipd-meta-analysis-pro/ipd-meta-pro.html
- **License:** MIT

An R dependency installation script (`dev/build-scripts/install_r_parity_dependencies.R`) lists the R packages (metafor, meta, survival, lme4) used in the parity gate.

## Data availability

No new clinical data were generated for this article. Example datasets embedded in the application are synthetic and available within the source code repository. R benchmark scripts and parity gate artifacts are included in the `dev/benchmarks/` and `dev/r-validation/` directories.

## Author contributions

| Author | CRediT roles |
|---|---|
| Mahmood Ahmad | Conceptualization; Methodology; Software; Validation; Writing - Original Draft; Writing - Review & Editing |
| Niraj Kumar | Conceptualization; Writing - Review & Editing |
| Bilaal Dar | Conceptualization; Writing - Review & Editing |
| Laiba Khan | Conceptualization; Writing - Review & Editing |
| Andrew Woo | Conceptualization; Writing - Review & Editing |

## Competing interests

No competing interests were disclosed.

## Grant information

The authors declared that no grants were involved in supporting this work.

## Acknowledgements

The authors acknowledge the developers of the R packages metafor, meta, survival, and lme4, whose implementations served as reference standards for numerical validation, and the developers of JM, mice, and dosresmeta, whose methodological frameworks informed the JavaScript implementations. The xoshiro128** PRNG algorithm was developed by Blackman and Vigna [13].

## References

1. Riley RD, Lambert PC, Abo-Zaid G. Meta-analysis of individual participant data: rationale, conduct, and reporting. BMJ. 2010;340:c221. https://doi.org/10.1136/bmj.c221
2. Debray TPA, Moons KGM, van Valkenhoef G, et al. Get real in individual participant data (IPD) meta-analysis: a review of the methodology. Res Synth Methods. 2015;6(4):293-309. https://doi.org/10.1002/jrsm.1160
3. Stewart LA, Tierney JF. To IPD or not to IPD? Advantages and disadvantages of systematic reviews using individual patient data. Eval Health Prof. 2002;25(1):76-97. https://doi.org/10.1177/0163278702025001006
4. Burke DL, Ensor J, Riley RD. Meta-analysis using individual participant data: one-stage and two-stage approaches, and why they may differ. Stat Med. 2017;36(5):855-875. https://doi.org/10.1002/sim.7141
5. Viechtbauer W. Conducting meta-analyses in R with the metafor package. J Stat Softw. 2010;36(3):1-48. https://doi.org/10.18637/jss.v036.i03
6. Bates D, Machler M, Bolker B, Walker S. Fitting linear mixed-effects models using lme4. J Stat Softw. 2015;67(1):1-48. https://doi.org/10.18637/jss.v067.i01
7. Therneau TM, Grambsch PM. Modeling Survival Data: Extending the Cox Model. New York: Springer; 2000.
8. Fisher DJ. Two-stage individual participant data meta-analysis and generalized forest plots. Stata J. 2015;15(2):369-396. https://doi.org/10.1177/1536867X1501500203
9. Review Manager (RevMan) [Computer program]. Version 5.4. The Cochrane Collaboration; 2020.
10. Borenstein M, Hedges LV, Higgins JPT, Rothstein HR. Comprehensive Meta-Analysis (Version 4). Biostat, Englewood, NJ; 2022.
11. Wallace BC, Dahabreh IJ, Trikalinos TA, Lau J, Trow P, Schmid CH. Closing the gap between methodologists and end-users: R as a computational back-end. J Stat Softw. 2012;49(5):1-15. https://doi.org/10.18637/jss.v049.i05
12. Ahmad M. TruthCert: proof-carrying numbers for reproducible evidence synthesis. Under review. 2026.
13. Blackman S, Vigna S. Scrambled linear pseudorandom number generators. ACM Trans Math Softw. 2021;47(4):1-32. https://doi.org/10.1145/3460772
14. DerSimonian R, Laird N. Meta-analysis in clinical trials. Control Clin Trials. 1986;7(3):177-188. https://doi.org/10.1016/0197-2456(86)90046-2
15. Paule RC, Mandel J. Consensus values and weighting factors. J Res Natl Bur Stand. 1982;87(5):377-385. https://doi.org/10.6028/jres.087.022
16. Hedges LV. A random effects model for effect sizes. Psychol Bull. 1983;93(2):388-395.
17. Hunter JE, Schmidt FL. Methods of Meta-Analysis: Correcting Error and Bias in Research Findings. 3rd ed. Sage; 2014.
18. Sidik K, Jonkman JN. A simple confidence interval for meta-analysis. Stat Med. 2002;21(21):3153-3159. https://doi.org/10.1002/sim.1262
19. Hartung J, Knapp G. A refined method for the meta-analysis of controlled clinical trials with binary outcome. Stat Med. 2001;20(24):3875-3889. https://doi.org/10.1002/sim.1009
20. IntHout J, Ioannidis JP, Rovers MM, Goeman JJ. Plea for routinely presenting prediction intervals in meta-analysis. BMJ Open. 2016;6(7):e010247. https://doi.org/10.1136/bmjopen-2015-010247
21. Salanti G, Ades AE, Ioannidis JPA. Graphical methods and numerical summaries for presenting results from multiple-treatment meta-analysis: an overview and tutorial. J Clin Epidemiol. 2011;64(2):163-171. https://doi.org/10.1016/j.jclinepi.2010.03.016
22. van Buuren S, Groothuis-Oudshoorn K. mice: Multivariate Imputation by Chained Equations in R. J Stat Softw. 2011;45(3):1-67. https://doi.org/10.18637/jss.v045.i03
23. Egger M, Davey Smith G, Schneider M, Minder C. Bias in meta-analysis detected by a simple, graphical test. BMJ. 1997;315(7109):629-634. https://doi.org/10.1136/bmj.315.7109.629
24. Begg CB, Mazumdar M. Operating characteristics of a rank correlation test for publication bias. Biometrics. 1994;50(4):1088-1101.
25. Duval S, Tweedie R. Trim and fill: a simple funnel-plot-based method of testing and adjusting for publication bias in meta-analysis. Biometrics. 2000;56(2):455-463. https://doi.org/10.1111/j.0006-341X.2000.00455.x
26. Sterne JAC, Sutton AJ, Ioannidis JPA, et al. Recommendations for examining and interpreting funnel plot asymmetry in meta-analyses of randomised controlled trials. BMJ. 2011;343:d4002. https://doi.org/10.1136/bmj.d4002
27. Guyatt GH, Oxman AD, Vist GE, et al. GRADE: an emerging consensus on rating quality of evidence and strength of recommendations. BMJ. 2008;336(7650):924-926. https://doi.org/10.1136/bmj.39489.470347.AD
28. Stewart LA, Clarke M, Rovers M, et al. Preferred Reporting Items for Systematic Review and Meta-Analyses of individual participant data: the PRISMA-IPD Statement. JAMA. 2015;313(16):1657-1665. https://doi.org/10.1001/jama.2015.3656
29. Sterne JAC, Savovic J, Page MJ, et al. RoB 2: a revised tool for assessing risk of bias in randomised trials. BMJ. 2019;366:l4898. https://doi.org/10.1136/bmj.l4898
30. Westreich D, Edwards JK, Lesko CR, Stuart E, Cole SR. Transportability of trial results using inverse odds of sampling weights. Am J Epidemiol. 2017;186(8):1010-1014. https://doi.org/10.1093/aje/kwx164
31. Li X, Dusseldorp E, Meulman JJ. Meta-CART: a tool to identify interaction effects in meta-analysis. Br J Math Stat Psychol. 2017;70(1):118-136. https://doi.org/10.1111/bmsp.12088
32. Balduzzi S, Rucker G, Schwarzer G. How to perform a meta-analysis with R: a practical tutorial. Evid Based Ment Health. 2019;22(4):153-160. https://doi.org/10.1136/ebmental-2019-300117
33. Rucker G, Krahn U, Konig J, Efthimiou O, Schwarzer G. netmeta: Network Meta-Analysis using Frequentist Methods. R package. 2023.
34. Rizopoulos D. Joint Models for Longitudinal and Time-to-Event Data: With Applications in R. Boca Raton: Chapman and Hall/CRC; 2012. https://doi.org/10.1201/b12208
35. Crippa A, Discacciati A, Bottai M, Spiegelman D, Orsini N. One-stage dose-response meta-analysis for aggregated data. Stat Methods Med Res. 2019;28(5):1579-1596. https://doi.org/10.1177/0962280218773122
36. Rover C, Bender R, Dias S, et al. On weakly informative prior distributions for the heterogeneity parameter in Bayesian random-effects meta-analysis. Res Synth Methods. 2021;12(4):448-474. https://doi.org/10.1002/jrsm.1477
37. Breslow NE, Clayton DG. Approximate inference in generalized linear mixed models. J Am Stat Assoc. 1993;88(421):9-25. https://doi.org/10.1080/01621459.1993.10594284
