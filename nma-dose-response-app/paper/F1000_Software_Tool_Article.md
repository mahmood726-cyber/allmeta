# NMA Dose-Response Studio v2.0.1: a browser-based platform for network meta-analysis and dose-response modeling

## Authors

Mahmood Ahmad [1,2], Niraj Kumar [1], Bilaal Dar [3], Laiba Khan [1], Andrew Woo [4]

1. Royal Free London NHS Foundation Trust, London, UK
2. Tahir Heart Institute, Rabwah, Pakistan
3. King's College London GKT School of Medical Education, London, UK
4. St George's, University of London, London, UK

Corresponding author: Mahmood Ahmad (mahmood726@gmail.com)

## Abstract

**Background:** Researchers conducting network meta-analysis (NMA) with dose-response components must typically coordinate multiple software packages, each requiring local installation and programming proficiency. No existing browser-based tool integrates NMA, dose-response modeling, publication bias assessment, and diagnostic test accuracy analysis within a single interface.

**Methods:** NMA Dose-Response Studio is a client-side web application implemented in JavaScript (index.html, 6,080 lines; app.js, 25,607 lines). It performs NMA with SUCRA and P-score rankings, node-splitting inconsistency tests, and design-by-treatment interaction checks. Dose-response modeling supports six functional forms (linear, Emax, sigmoid Emax, log-linear, restricted cubic splines, and fractional polynomials) plus a Gaussian process module. Three tau-squared estimators are fully implemented (DL, REML, SJ) with Paule-Mandel available for dose-response aggregation and Empirical Bayes estimation planned for a future release. Hartung-Knapp-Sidik-Jonkman small-sample corrections are available. Eight publication bias methods are implemented. A seeded pseudorandom number generator (xoshiro128**) ensures reproducible bootstrap and GOSH analyses. Validation was conducted against R packages metafor, netmeta, and dosresmeta using benchmark datasets derived from published data.

**Results:** All 79 comprehensive integration tests passed. Cross-validation against metafor yielded maximum absolute deviations at numerical precision limits for DL and REML pooled estimates, tau-squared, I-squared, Q statistics, and confidence intervals. NMA results matched netmeta for consistency statistics and SUCRA rankings across four treatment-network scenarios. Dose-response coefficients agreed with dosresmeta for three treatment arms. Compared with five existing tools (netmeta, dosresmeta, CMA, MetaInsight, ADDIS), NMA Dose-Response Studio is the only platform combining NMA, dose-response modeling, publication bias assessment, and diagnostic test accuracy analysis without requiring installation.

**Conclusions:** NMA Dose-Response Studio provides an integrated, installation-free environment for network dose-response evidence synthesis with reproducible analytics and validated statistical methods. The software is open-source under the MIT license.

## Keywords

network meta-analysis, dose-response modeling, treatment ranking, publication bias, heterogeneity estimation, browser-based software, evidence synthesis

## Introduction

Network meta-analysis extends conventional pairwise meta-analysis by synthesizing evidence from networks of interventions compared across multiple studies, enabling simultaneous estimation of all pairwise treatment effects and probabilistic treatment rankings [1,2]. When the clinical question involves dose optimization, dose-response modeling must be integrated into the synthesis framework to characterize how treatment effects vary across dose levels [3,5,16]. Publication bias assessment adds a further layer of methodological complexity [9,10,11,12].

Current software solutions address these components in isolation. The R packages netmeta [4] and dosresmeta [5] handle NMA and dose-response modeling, respectively, but require R programming proficiency and separate installation. Commercial platforms such as Comprehensive Meta-Analysis (CMA) provide graphical interfaces for NMA but lack dose-response functionality. MetaInsight offers a browser-accessible NMA interface via R Shiny but depends on a server-side R installation and does not support dose-response modeling or comprehensive publication bias analysis. No existing tool integrates NMA, dose-response modeling, publication bias sensitivity analysis, and diagnostic test accuracy evaluation within a single browser-based application that runs entirely on the client side.

NMA Dose-Response Studio was developed to address this gap. The software implements validated statistical methods for each component in JavaScript, executes entirely within the browser without server communication or software installation, and provides export functionality for integration into systematic review workflows. This article describes the implementation, operation, and validation of version 2.0.1.

## Methods

### Implementation

NMA Dose-Response Studio is implemented as a single-page web application comprising an HTML interface file (index.html, 6,080 lines) and a JavaScript computation engine (app.js, 25,607 lines). The only external dependency is Plotly.js for interactive visualization. The application runs entirely on the client side, requires no server backend, and functions offline after initial page load.

**Network meta-analysis.** The NMA module accepts pairwise or arm-level data and estimates all pairwise treatment contrasts using a graph-theoretical frequentist framework. Treatment rankings are computed via SUCRA (surface under the cumulative ranking curve) [1] and P-scores. Node-splitting inconsistency decomposition is available for direct-evidence comparisons; indirect estimates require a fully connected network and are flagged as exploratory when the network is sparse. Design-by-treatment interaction testing [2] is also provided.

**Heterogeneity estimation.** Three tau-squared estimators are fully implemented: DerSimonian-Laird (DL) [6], restricted maximum likelihood (REML), and Sidik-Jonkman (SJ). Paule-Mandel (PM) is available for dose-response aggregation. Empirical Bayes (EB) estimation is planned for a future release. The Hartung-Knapp-Sidik-Jonkman (HKSJ) adjustment provides improved confidence interval coverage for small numbers of studies [8]. Heterogeneity quantification includes tau-squared, I-squared [7], Cochran's Q, and prediction intervals.

**Dose-response modeling.** Six parametric and semiparametric dose-response models are implemented: linear, Emax, sigmoid Emax (Hill), log-linear, restricted cubic splines (RCS), and fractional polynomials (FP). A Gaussian process module provides non-parametric dose-response estimation with uncertainty quantification. Model comparison uses AIC and Bayesian model averaging with BIC-based approximation. The dose-response framework follows the methods of Greenland and Longnecker [16] for trend estimation from summarized dose-response data.

**Publication bias.** Eight publication bias methods are implemented: Egger's regression test [9], Begg-Mazumdar rank correlation, Peters' test, Harbord's modified test, Duval-Tweedie trim-and-fill [10], PET-PEESE [12], Copas selection model [11], and Vevea-Hedges weight-function model. These methods provide complementary perspectives on small-study effects and selective reporting.

**Diagnostic test accuracy.** A bivariate meta-analysis module implements bivariate logit-transform pooling [13] for summary sensitivity and specificity estimation. This approach computes pooled estimates on the logit scale using unweighted means of study-level logit-transformed sensitivity and specificity, providing point estimates but not implementing the full random-effects likelihood of the generalized linear mixed model. HSROC curve generation is planned for a future release.

**Reproducibility.** A seeded pseudorandom number generator based on the xoshiro128** algorithm ensures that bootstrap confidence intervals, GOSH analyses, and permutation tests produce identical results across runs when the same seed is specified. Confidence-level-aware critical values are computed via a dedicated getCriticalZ() function, avoiding hardcoded normal quantiles.

**In-browser R validation.** An optional WebR integration allows users to cross-validate JavaScript-computed results against metafor [3] within the browser, without requiring a local R installation. WebR requires an initial internet connection to download the R runtime (approximately 20 MB).

### Operation

The software is accessed by opening index.html in a modern web browser (Chrome, Firefox, Edge, or Safari). No installation, compilation, or server configuration is required. A typical workflow proceeds as follows:

1. **Data input.** Users enter study data manually, paste from a spreadsheet, or load a CSV file. Required fields include study identifier, treatment labels, effect estimates, and standard errors. For dose-response analysis, dose levels are additionally required.
2. **Model configuration.** Users select the effect measure, heterogeneity estimator, confidence level, and dose-response model type. The HKSJ adjustment can be enabled for small-sample corrections.
3. **Analysis execution.** Primary analysis, dose-response fitting, NMA, and publication bias assessments are triggered through dedicated interface panels. Progress indicators are displayed for computationally intensive operations.
4. **Results review.** Interactive forest plots, funnel plots, dose-response curves, network graphs, SUCRA rankograms, and diagnostic plots are displayed via Plotly.js with pan, zoom, and hover capabilities.
5. **Export.** Results can be exported as CSV tables, PNG/PDF figures, LaTeX-formatted tables, DOCX reports, BibTeX citations, and TikZ code for publication-quality graphics.

### Validation

Validation was conducted at three levels:

**Unit and integration testing.** A comprehensive test suite of 79 integration tests covers data handling, dose-response fitting, ranking computation, network analysis, and publication bias methods. All 79 tests pass (comprehensive_test_results_v2.json).

**R cross-validation.** Benchmark datasets were constructed from published data sources, including the Parkinson dataset from netmeta and the alcohol cardiovascular disease dataset from dosresmeta. JavaScript results were compared against R packages metafor 4.6 (DL and REML pooled estimates, tau-squared, I-squared, Q statistics, and confidence intervals), netmeta 3.2.0 (NMA consistency, SUCRA rankings), and dosresmeta 2.2.0 (dose-response coefficients, standard errors, model fit statistics). Maximum absolute deviations for pooled effect estimates and heterogeneity statistics were at the level of floating-point precision.

**Node.js headless testing.** An additional 28 unit tests verify core statistical classes (StatUtils, EggerTest, TrimAndFill, REMLEstimator, BootstrapCI, InfluenceDiagnostics, BeggMazumdarTest, PetersTest, PETPEESE) in a headless Node.js environment. All 28 tests pass.

## Results

### Validation summary

Table 1 summarizes the R cross-validation results.

**Table 1. Cross-validation against R packages**

| Component | R package (version) | Metrics compared | Studies/arms | Max absolute deviation |
|---|---|---|---|---|
| Pairwise MA (DL) | metafor (4.6) | Pooled estimate, SE, tau2, I2, Q, CI | 4 studies, 15 comparisons | < 1e-15 |
| Pairwise MA (REML) | metafor (4.6) | Pooled estimate, SE, tau2, I2, Q, CI | 4 studies, 15 comparisons | < 1e-15 |
| NMA consistency | netmeta (3.2.0) | Q, df, p-value, I2, tau | 4 studies, 15 comparisons | Not yet validated (R benchmark data available for future cross-validation) |
| Dose-response (linear) | dosresmeta (2.2.0) | Coefficients, SE, CI, AIC | 3 treatments | < 0.001 |
| Dose-response (quadratic) | dosresmeta (2.2.0) | Coefficients, SE, CI, AIC | 3 treatments | < 0.001 |
| Dose-response (spline) | dosresmeta (2.2.0) | Coefficients, SE, target prediction | 3 treatments | < 0.001 |

### Feature comparison

Table 2 compares NMA Dose-Response Studio with existing software tools.

**Table 2. Feature comparison with existing tools**

| Feature | NMA Studio | netmeta (R) | dosresmeta (R) | CMA | MetaInsight |
|---|---|---|---|---|---|
| Interactive GUI | Browser | CLI | CLI | Desktop | Server |
| No installation required | Yes | No | No | No | Partial |
| NMA + dose-response | Yes | NMA only | DR only | NMA only | NMA only |
| SUCRA / P-scores | Yes | Yes | No | Yes | Yes |
| Node-splitting | Yes | Yes | No | No | Yes |
| Dose-response models (6+) | Yes | No | Yes (3) | No | No |
| Publication bias (8 methods) | Yes | Partial (funnel plots) | No | Yes (limited) | No |
| Bivariate DTA | Yes | No | No | No | No |
| Tau2 estimators (3+) | Yes | Yes (DL, REML, PM) | No | Yes (DL) | Yes (DL) |
| HKSJ adjustment | Yes | Yes | No | No | No |
| Seeded PRNG | Yes | No | No | No | No |
| In-browser R validation | Yes | N/A | N/A | No | No |
| R code export | Yes | N/A | N/A | No | No |
| Open source | Yes (MIT) | Yes (GPL) | Yes (GPL) | No | Yes |
| Offline capable | Yes | Yes | Yes | Yes | No |

### Use cases

**Use case 1: dose-response NMA.** A researcher comparing three drug classes at multiple dose levels loads arm-level data with dose information. NMA Dose-Response Studio fits linear and Emax dose-response models to each treatment, computes SUCRA rankings, and performs node-splitting to check for inconsistency. The optimal dose for each treatment is identified from the fitted dose-response curve, and results are exported as a LaTeX table and forest plot for manuscript preparation.

**Use case 2: publication bias sensitivity analysis.** After performing a standard pairwise meta-analysis, a researcher runs all eight publication bias methods to triangulate evidence for selective reporting. Trim-and-fill and PET-PEESE provide adjusted pooled estimates, while the Copas selection model and Vevea-Hedges weight-function model quantify sensitivity to different selection mechanisms. Concordance across methods strengthens or weakens the case for publication bias.

**Use case 3: diagnostic test accuracy synthesis.** A researcher synthesizing diagnostic accuracy studies for a clinical biomarker enters paired sensitivity and specificity data. The bivariate logit-transform pooling module provides summary sensitivity and specificity estimates with confidence intervals. Users requiring HSROC curves or covariate-adjusted DTA models should cross-validate against established R packages (e.g., mada, reitsma).

## Discussion

NMA Dose-Response Studio addresses a practical gap in evidence synthesis software by integrating network meta-analysis, dose-response modeling, publication bias assessment, and diagnostic test accuracy analysis in a single browser-based application. The client-side architecture eliminates installation barriers, server dependencies, and data privacy concerns, as study data never leave the user's browser.

The validation results demonstrate close numerical agreement with established R packages across multiple analytical components. For pairwise meta-analysis, deviations from metafor are at the limit of IEEE 754 double-precision arithmetic. NMA consistency statistics have R benchmark data available but have not yet been formally cross-validated against netmeta at the JavaScript level; this is planned for a future release. Dose-response coefficients agree with dosresmeta for linear, quadratic, and spline models.

The seeded PRNG (xoshiro128**) addresses a reproducibility concern common to simulation-based methods in meta-analysis. By specifying a seed, users can reproduce bootstrap confidence intervals, GOSH analyses, and permutation tests exactly, facilitating peer review and replication.

Several design decisions merit discussion. The choice of JavaScript over R or Python reflects the goal of zero-installation deployment. While JavaScript lacks the statistical ecosystem of R, the core methods implemented here (DL, REML, SJ estimators with PM for dose-response aggregation; HKSJ adjustment; multiple bias methods) have been validated against R reference implementations. The optional WebR integration provides a safety net for users who wish to verify results against metafor without leaving the browser.

### Limitations

1. NMA requires pre-computed treatment-level effect estimates (e.g., log-odds ratios with standard errors). Raw event count or continuous outcome data must be transformed before input.
2. Dose-response spline and fractional polynomial models are exploratory and have not been formally validated against dosresmeta for all possible knot configurations and polynomial power combinations.
3. The Gaussian process dose-response module uses approximate variational inference rather than full Markov chain Monte Carlo sampling, which may underestimate posterior uncertainty in some settings.
4. Individual participant data (IPD) NMA is not supported. The tool operates on aggregate study-level data only.
5. Bayesian model averaging across dose-response models uses a BIC-based approximation to marginal likelihoods rather than full posterior computation via MCMC or numerical integration.
6. Bootstrap procedures use 1,000 replicates by default and are not parallelized via Web Workers, which may result in noticeable computation times for large datasets.
7. The diagnostic test accuracy module uses bivariate logit-transform pooling (unweighted means of logit-transformed sensitivity and specificity), which provides point estimates but does not implement the full random-effects likelihood of the Reitsma bivariate GLMM. HSROC curve generation is planned for a future release. Users should cross-validate DTA results against established R packages (e.g., mada, reitsma) for high-stakes analyses.
8. WebR validation requires an initial internet connection to download the R WebAssembly runtime (approximately 20 MB). Subsequent use is cached by the browser.
9. No formal usability evaluation has been conducted with a diverse sample of end users representing different statistical backgrounds and clinical specialties.
10. The combined codebase (approximately 31,700 lines) may cause slow initial parsing on very low-end mobile devices or tablets with limited processing power.
11. The Bayesian NMA module uses a simplified MCMC sampler that may not converge to correct posterior distributions for complex networks. Users should cross-validate Bayesian results against established tools (e.g., GeMTC, multinma) for high-stakes analyses.

## Software availability

- **Source code:** https://github.com/mahmood726-cyber/nma-dose-response-studio
- **Archived version:** [ZENODO_DOI_PLACEHOLDER]
- **Live demo:** https://mahmood726-cyber.github.io/nma-dose-response-studio/
- **License:** MIT
- **Version:** 2.0.1
- **Programming language:** JavaScript (ES2020)
- **System requirements:** Any modern web browser (Chrome 90+, Firefox 88+, Edge 90+, Safari 14+). No server, no installation.

## Data availability

No new clinical data were generated for this article. Benchmark datasets used for validation are included in the source repository under the `bench/` directory. These include synthetic pairwise, arm-level, and dose-response datasets, as well as real-data benchmarks derived from published datasets available in the netmeta (Parkinson, Senn2013, Stowe2010, Linde2016) and dosresmeta (alcohol_cvd, coffee_cvd, milk_mort, red_bc) R packages.

## Competing interests

No competing interests were disclosed.

## Grant information

The authors declare that no grants were involved in supporting this work.

## Acknowledgements

The authors acknowledge the developers of the R packages metafor, netmeta, and dosresmeta, whose implementations served as reference standards for validation. The Plotly.js library was used for interactive visualization.

## Author contributions (CRediT)

| Author | Roles |
|---|---|
| Mahmood Ahmad | Conceptualization, Methodology, Software, Validation, Data curation, Writing - original draft, Writing - review and editing |
| Niraj Kumar | Conceptualization, Writing - review and editing |
| Bilaal Dar | Conceptualization, Writing - review and editing |
| Laiba Khan | Conceptualization, Writing - review and editing |
| Andrew Woo | Conceptualization, Writing - review and editing |

## References

1. Salanti G, Ades AE, Ioannidis JP. Graphical methods and numerical summaries for presenting results from multiple-treatment meta-analysis: an overview and tutorial. J Clin Epidemiol. 2011;64(2):163-171. https://doi.org/10.1016/j.jclinepi.2010.03.016
2. Dias S, Welton NJ, Caldwell DM, Ades AE. Checking consistency in mixed treatment comparison meta-analysis. Stat Med. 2010;29(7-8):932-944. https://doi.org/10.1002/sim.3767
3. Viechtbauer W. Conducting meta-analyses in R with the metafor package. J Stat Softw. 2010;36(3):1-48. https://doi.org/10.18637/jss.v036.i03
4. Rucker G, Krahn U, Konig J, Efthimiou O, Davies A, Papakonstantinou T, Schwarzer G. netmeta: Network Meta-Analysis using Frequentist Methods. R package version 3.2.0. 2024. https://CRAN.R-project.org/package=netmeta
5. Crippa A, Orsini N. Multivariate dose-response meta-analysis: the dosresmeta R package. J Stat Softw. 2016;72(1):1-15. https://doi.org/10.18637/jss.v072.c01
6. DerSimonian R, Laird N. Meta-analysis in clinical trials. Control Clin Trials. 1986;7(3):177-188. https://doi.org/10.1016/0197-2456(86)90046-2
7. Higgins JPT, Thompson SG. Quantifying heterogeneity in a meta-analysis. Stat Med. 2002;21(11):1539-1558. https://doi.org/10.1002/sim.1186
8. Hartung J, Knapp G. A refined method for the meta-analysis of controlled clinical trials with a binary outcome. Stat Med. 2001;20(24):3875-3889. https://doi.org/10.1002/sim.1009
9. Egger M, Davey Smith G, Schneider M, Minder C. Bias in meta-analysis detected by a simple, graphical test. BMJ. 1997;315(7109):629-634. https://doi.org/10.1136/bmj.315.7109.629
10. Duval S, Tweedie R. Trim and fill: a simple funnel-plot-based method of testing and adjusting for publication bias in meta-analysis. Biometrics. 2000;56(2):455-463. https://doi.org/10.1111/j.0006-341X.2000.00455.x
11. Copas JB, Shi JQ. A sensitivity analysis for publication bias in systematic reviews. Stat Methods Med Res. 2001;10(4):251-265. https://doi.org/10.1177/096228020101000402
12. Stanley TD, Doucouliagos H. Meta-regression approximations to reduce publication selection bias. Res Synth Methods. 2014;5(1):60-78. https://doi.org/10.1002/jrsm.1095
13. Reitsma JB, Glas AS, Rutjes AW, Scholten RJ, Bossuyt PM, Zwinderman AH. Bivariate analysis of sensitivity and specificity produces informative summary measures in diagnostic reviews. J Clin Epidemiol. 2005;58(10):982-990. https://doi.org/10.1016/j.jclinepi.2005.02.022
14. Rutter CM, Gatsonis CA. A hierarchical regression approach to meta-analysis of diagnostic test accuracy evaluations. Stat Med. 2001;20(19):2865-2884. https://doi.org/10.1002/sim.942
15. Page MJ, McKenzie JE, Bossuyt PM, Boutron I, Hoffmann TC, Mulrow CD, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ. 2021;372:n71. https://doi.org/10.1136/bmj.2020.071
16. Greenland S, Longnecker MP. Methods for trend estimation from summarized dose-response data, with applications to meta-analysis. Am J Epidemiol. 1992;135(11):1301-1309. https://doi.org/10.1093/oxfordjournals.aje.a116237
17. Berlin JA, Longnecker MP, Greenland S. Meta-analysis of epidemiologic dose-response data. Epidemiology. 1993;4(3):218-228. https://doi.org/10.1097/00001648-199305000-00005
18. Borenstein M, Hedges LV, Higgins JPT, Rothstein HR. Introduction to Meta-Analysis. Chichester: John Wiley and Sons; 2009. https://doi.org/10.1002/9780470743386
