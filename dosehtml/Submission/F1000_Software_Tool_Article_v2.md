# Dose Response Pro v18.1: a browser-based tool for dose-response meta-analysis

## Authors
Mahmood Ahmad [1,2], Niraj Kumar [1], Bilaal Dar [3], Laiba Khan [1], Andrew Woo [4]

### Affiliations
1. Royal Free London NHS Foundation Trust, London, United Kingdom
2. Tahir Heart Institute, Rabwah, Pakistan
3. King's College London GKT School of Medical Education, London, United Kingdom
4. St George's, University of London, London, United Kingdom

Corresponding author: Mahmood Ahmad (mahmood726@gmail.com)

## Abstract

**Background:** Dose-response meta-analysis synthesises evidence on how the magnitude of an exposure relates to the risk of an outcome across multiple studies. Existing software for this purpose requires proficiency in R or commercial statistical packages, limiting accessibility for clinical researchers.

**Methods:** We developed Dose Response Pro v18.1, an open-source browser-based application that implements the Greenland and Longnecker two-stage generalized least squares (GLS) method for dose-response meta-analysis. The tool is written entirely in HTML and JavaScript and requires no installation or server infrastructure. It provides interactive data entry, CSV import, model fitting (linear and quadratic), heterogeneity assessment, sensitivity analysis, subgroup analysis, publication bias diagnostics, and export of R-compatible code. Numerical accuracy was validated against the R packages dosresmeta (version 2.2.0), metafor (version 4.8.0), and mvmeta (version 1.0.3) using three benchmark scenarios.

**Results:** All three validation scenarios passed with maximum absolute differences of 7.56 x 10^-6 for regression coefficients, 4.38 x 10^-6 for standard errors, and 6.65 x 10^-9 for the between-study variance estimate (tau-squared). Grid-level predictions across 41 dose points per scenario showed maximum log-relative risk differences of 4.0 x 10^-6 and maximum standard error differences of 1.1 x 10^-5. The application runs entirely client-side in Chrome, Firefox, Safari, and Edge, with typical analysis completion times under two seconds for datasets of 20 or fewer studies.

**Conclusions:** Dose Response Pro v18.1 provides an accessible, validated, and open-source alternative for dose-response meta-analysis that eliminates the requirement for statistical programming expertise. Source code, validation scripts, sample datasets, and a live demo are freely available.

## Keywords
dose-response meta-analysis, evidence synthesis, Greenland-Longnecker method, generalized least squares, browser application, open-source software

## Introduction

Dose-response meta-analysis combines results from multiple epidemiological studies to estimate the shape of the relationship between an exposure level and an outcome risk [1,2]. This approach is central to nutritional epidemiology, pharmacology, environmental health, and clinical medicine, where understanding whether risk increases linearly, reaches a threshold, or follows a non-linear pattern directly informs clinical guidelines and public health policy [3].

The standard statistical framework for dose-response meta-analysis was established by Greenland and Longnecker [1], who proposed a two-stage generalized least squares (GLS) method. In the first stage, within-study covariance matrices are estimated from reported dose-specific counts. In the second stage, study-specific dose-response slopes are pooled using a random-effects model that accounts for both within-study and between-study variability. This method is implemented in the R package dosresmeta [4], which extends the multivariate meta-analysis framework of mvmeta [5]. Other implementations are available through metafor [6], Stata macros [7], and commercial software such as Comprehensive Meta-Analysis [8].

Despite the maturity of these tools, several barriers limit their adoption among clinical researchers. R-based workflows require programming proficiency, and troubleshooting package installation and version compatibility can present challenges [9]. Commercial alternatives involve licensing costs and may not expose their computational methods for independent verification. Web-based meta-analysis platforms such as MetaInsight [10] and the CRSU Shiny apps [11] address some of these barriers but do not currently include dose-response meta-analysis capabilities.

Dose Response Pro v18.1 was developed to address this gap. It is a standalone HTML/JavaScript application that executes entirely in the user's browser with no installation, no server dependency, and no programming required. The application implements the Greenland-Longnecker GLS method and provides interactive data entry, model fitting, heterogeneity diagnostics, sensitivity analysis, subgroup analysis, publication bias assessment, and R code export. This article describes the implementation, demonstrates its use with example datasets, and reports numerical validation against established R packages.

## Methods

### Implementation

Dose Response Pro v18.1 is implemented as a single HTML file containing embedded JavaScript and CSS. The application runs entirely client-side in the browser, with no data transmitted to external servers. This design ensures data privacy and enables use in environments without internet access.

The statistical engine implements the following components:

**Dose-response model.** The application fits dose-response meta-regression models of the form:

y_i = beta_1 * d_i + beta_2 * d_i^2 + u_i + epsilon_i

where y_i is the log-relative risk at dose d_i relative to the referent category, beta_1 and beta_2 are the linear and quadratic regression coefficients, u_i ~ N(0, tau^2) is the between-study random effect, and epsilon_i ~ N(0, v_i) is the within-study error with known variance v_i [1].

**Covariance estimation.** Within-study covariance matrices are estimated from marginal counts using the Greenland-Longnecker method [1], which accounts for the correlation between log-relative risks within a study that share a common referent category.

**Pooled estimation.** The pooled dose-response coefficients are estimated as:

beta_hat = (sum X_i^T W_i X_i)^{-1} (sum X_i^T W_i y_i)

where W_i = (S_i + tau^2 * I)^{-1}, S_i is the within-study covariance matrix for study i, and tau^2 is the between-study variance estimated by the DerSimonian-Laird method [12] or restricted maximum likelihood (REML).

**Heterogeneity assessment.** The application reports Cochran's Q statistic, I-squared [13], tau-squared, and prediction intervals.

### Operation

The user workflow consists of four steps:

1. **Data input.** Users either enter data manually through the interface or import a CSV file. Required fields are study identifier, dose level, number of cases (or events), and total sample size (or person-years). The application validates input types and flags missing or invalid entries before proceeding.

2. **Model configuration.** Users select the functional form (linear or quadratic), the heterogeneity estimator (DerSimonian-Laird or REML), and optional settings for sensitivity and subgroup analyses.

3. **Analysis execution.** Clicking "Run Analysis" executes the GLS estimation, generates the dose-response curve with confidence and prediction intervals, and populates diagnostic panels including heterogeneity statistics, influence diagnostics, and publication bias assessments.

4. **Export.** Users can export results as downloadable reports, figures, and R-compatible code that reproduces the analysis using the metafor package [6].

### Validation

Numerical accuracy was assessed by comparing Dose Response Pro output against the R package dosresmeta (version 2.2.0) [4] running on R 4.5.2, with metafor 4.8.0 [6] and mvmeta 1.0.3 [5] as supporting packages. Three benchmark scenarios were used:

1. **Simple linear trend** (3 studies, 3 dose levels each): a straightforward dose-response relationship to verify baseline accuracy.
2. **Quadratic trend** (4 studies, 3 dose levels each): a non-linear relationship testing the quadratic model component.
3. **High heterogeneity** (5 studies, 3 dose levels each): a scenario with substantial between-study variability to test the random-effects variance estimator.

For each scenario, we compared the estimated regression coefficients (beta), their standard errors, the between-study variance (tau-squared), and grid-level predicted log-relative risks at 41 equally spaced dose points. Agreement was assessed using absolute differences, with pre-specified tolerances of 0.02 for coefficients, 0.05 for standard errors, and 0.02 for tau-squared.

The validation script (`tests/validate_dose_response_pro.R`) and full results (`tests/r_validation_results.json`) are included in the repository for independent verification.

## Results

### Validation results

All three benchmark scenarios passed validation. Table 1 summarises the agreement between Dose Response Pro and the R dosresmeta package.

**Table 1. Validation results: Dose Response Pro versus R dosresmeta**

| Scenario | Studies | Dose levels | Max |beta diff| | Max |SE diff| | Max |tau^2 diff| | Grid points | Max |logRR diff| | Max grid |SE diff| | Result |
|----------|---------|-------------|---------------------|-----------------|---------------------|-------------|---------------------|---------------------|--------|
| Simple linear | 3 | 3 per study | 2.0 x 10^-6 | 4.0 x 10^-6 | < 10^-9 | 41/41 pass | 2.0 x 10^-6 | 9.0 x 10^-6 | PASS |
| Quadratic | 4 | 3 per study | 2.0 x 10^-6 | 3.0 x 10^-6 | < 10^-9 | 41/41 pass | 2.0 x 10^-6 | 7.0 x 10^-6 | PASS |
| High heterogeneity | 5 | 3 per study | 8.0 x 10^-6 | 1.2 x 10^-5 | < 10^-9 | 41/41 pass | 4.0 x 10^-6 | 1.1 x 10^-5 | PASS |

Across all scenarios, the maximum absolute difference in any regression coefficient was 7.56 x 10^-6, in any standard error was 1.2 x 10^-5, and in tau-squared was less than 10^-9. All 123 grid-level predictions (41 points x 3 scenarios) were within tolerance.

### Feature overview

Table 2 compares the features of Dose Response Pro with established alternatives.

**Table 2. Feature comparison with existing dose-response meta-analysis tools**

| Feature | Dose Response Pro v18.1 | dosresmeta (R) | metafor (R) | CMA (commercial) |
|---------|------------------------|----------------|-------------|-------------------|
| Greenland-Longnecker GLS | Yes | Yes | Manual setup | Yes |
| Interactive GUI | Yes (browser) | No (command line) | No (command line) | Yes (desktop) |
| Real-time visualisation | Yes | No | No | Yes |
| No installation required | Yes | No | No | No |
| Sensitivity analysis (GUI) | Yes | Manual scripting | Manual scripting | Yes |
| Subgroup analysis (GUI) | Yes | Manual scripting | Manual scripting | Yes |
| Publication bias diagnostics | Yes | Manual scripting | Yes | Yes |
| R code export | Yes | N/A | N/A | No |
| Open source | Yes (MIT) | Yes (GPL) | Yes (GPL) | No |
| Cost | Free | Free | Free | Licensed |
| Offline use | Yes | Yes | Yes | Yes |

### Use case 1: Linear dose-response analysis

To demonstrate a typical workflow, we used the included sample dataset (`sample_dose_response_data.csv`), which contains three studies (Study1, Study2, Study3) each reporting cases and total counts at three dose levels (0, 5-10, 15-20 units). Users load this dataset via the "Load Demo Data" button or CSV import, select the linear model with DerSimonian-Laird heterogeneity estimation, and click "Run Analysis." The application produces a dose-response curve with 95% confidence and prediction intervals, along with a results panel displaying the pooled linear and quadratic coefficients, standard errors, p-values, I-squared, tau-squared, and Cochran's Q statistic. Figure 1 shows the main application interface with results displayed. Figure 2 shows the dose-response curve output.

### Use case 2: Sensitivity and bias assessment

Using the same dataset, we performed a leave-one-out sensitivity analysis by selecting the Sensitivity tab. The application sequentially removed each study and re-estimated the model, displaying the change in the pooled estimate and associated influence statistics (analogous to Cook's distance). This workflow identifies potentially influential observations and assesses whether the overall conclusion depends on any single study. We also examined the Bias tab, which provides funnel plot asymmetry diagnostics and related tests. Figure 3 shows the bias assessment panel.

### Output interpretation

Users should interpret dose-response results in conjunction with heterogeneity diagnostics. When I-squared exceeds 50% or the prediction interval crosses the null, the pooled curve should be interpreted cautiously. For datasets with fewer than five studies, asymmetry tests (e.g., Egger's test) have limited power and should not be used as definitive evidence of publication bias [13]. When the quadratic coefficient is not statistically significant, users should consider whether the simpler linear model provides an adequate fit. The application displays all relevant statistics to support these judgements, but the user retains responsibility for appropriate model selection and clinical interpretation.

## Discussion

Dose Response Pro v18.1 provides a browser-based implementation of the Greenland-Longnecker dose-response meta-analysis method that eliminates the need for statistical programming. The tool was validated against the R package dosresmeta with agreement at the level of 10^-5 or better for all tested parameters across three benchmark scenarios.

The primary advantage is accessibility. By running entirely in the browser as a single HTML file, the application requires no installation, no package management, and no server infrastructure. This makes it suitable for clinical researchers, evidence synthesis teams, and educational settings where R expertise may be limited. The inclusion of R code export provides a bridge for users who wish to verify or extend their analyses in R.

Several limitations should be noted. First, the current validation covers three benchmark scenarios with linear and quadratic models. While these demonstrate numerical accuracy for the core GLS implementation, additional validation against a wider range of scenarios — including larger datasets, more complex dose patterns, rare events, and edge cases — would strengthen confidence. Users working with sparse data or very small studies should verify results against R independently. Second, the application currently supports the DerSimonian-Laird and REML estimators for between-study variance but does not implement all heterogeneity estimators available in dosresmeta or metafor. Third, restricted cubic spline models are available as an exploratory feature but have not been formally validated against R and should be treated as hypothesis-generating. Fourth, as a browser application, computational performance is limited by the client machine and browser JavaScript engine, though typical analyses complete in under two seconds for datasets with 20 or fewer studies. Fifth, the tool is designed for aggregate-level dose-response data and does not support individual participant data meta-analysis. Sixth, publication bias diagnostics such as funnel plot asymmetry tests have known limitations with small numbers of studies [13] and should be interpreted as exploratory rather than confirmatory.

Dose Response Pro complements rather than replaces established R packages. For routine dose-response meta-analysis with standard models, it provides an accessible and validated alternative. For advanced analyses requiring custom models, extensive simulation, or integration with larger pipelines, R-based workflows remain appropriate.

## Software availability

- **Source code:** https://github.com/mahmood726-cyber/dose-response-pro
- **Archived source code at time of publication:** https://doi.org/10.5281/zenodo.18922680
- **Live demo:** https://mahmood726-cyber.github.io/dose-response-pro/
- **License:** MIT (https://opensource.org/licenses/MIT)

## Data availability

No new clinical data were generated for this article. The sample dataset used in the demonstrations (`sample_dose_response_data.csv`) and teaching datasets are included in the source code repository at https://github.com/mahmood726-cyber/dose-response-pro [15]. The R validation script and full validation output are available at `tests/validate_dose_response_pro.R` and `tests/r_validation_results.json` in the repository. An archived copy of the source code is available at the time of publication [16].

## Competing interests

No competing interests were disclosed.

## Grant information

The authors declared that no grants were involved in supporting this work.

## Acknowledgements

The authors thank the developers of the dosresmeta, metafor, and mvmeta R packages for providing the reference implementations used in validation.

## References

1. Greenland S, Longnecker MP. Methods for trend estimation from summarized dose-response data, with applications to meta-analysis. Am J Epidemiol. 1992;135(11):1301-1309.
2. Orsini N, Li R, Wolk A, Khudyakov P, Spiegelman D. Meta-analysis for linear and nonlinear dose-response relations: examples, an evaluation of approximations, and software. Am J Epidemiol. 2012;175(1):66-73.
3. Berlin JA, Longnecker MP, Greenland S. Meta-analysis of epidemiologic dose-response data. Epidemiology. 1993;4(3):218-228.
4. Crippa A, Orsini N. Dose-response meta-analysis of differences in means. BMC Med Res Methodol. 2016;16:91.
5. Gasparrini A, Armstrong B, Kenward MG. Multivariate meta-analysis for non-linear and other multi-parameter associations. Stat Med. 2012;31(29):3821-3839.
6. Viechtbauer W. Conducting meta-analyses in R with the metafor package. J Stat Softw. 2010;36(3):1-48.
7. Orsini N, Bellocco R, Greenland S. Generalized least squares for trend estimation of summarized dose-response data. Stata J. 2006;6(1):40-57.
8. Borenstein M, Hedges LV, Higgins JPT, Rothstein HR. Introduction to Meta-Analysis. Chichester: Wiley; 2009.
9. Wallace BC, Schmid CH, Lau J, Trikalinos TA. Meta-Analyst: software for meta-analysis of binary, continuous and diagnostic data. BMC Med Res Methodol. 2009;9:80.
10. Owen RK, Bradbury N, Xin Y, Cooper N, Sutton A. MetaInsight: an interactive web-based tool for analyzing, interrogating, and visualizing network meta-analyses using R-shiny and netmeta. Res Synth Methods. 2019;10(4):569-581.
11. Freeman SC, Kerby CR, Patel A, Cooper NJ, Quinn T, Sutton AJ. Development of an interactive web-based tool to conduct and interrogate meta-analysis of diagnostic test accuracy studies: MetaDTA. BMC Med Res Methodol. 2019;19:81.
12. DerSimonian R, Laird N. Meta-analysis in clinical trials. Control Clin Trials. 1986;7(3):177-188.
13. Higgins JPT, Thompson SG. Quantifying heterogeneity in a meta-analysis. Stat Med. 2002;21(11):1539-1558.
14. Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ. 2021;372:n71.
15. Ahmad M, Kumar N, Dar B, Khan L, Woo A. Dose Response Pro v18.1 [Source code]. GitHub. 2026. https://github.com/mahmood726-cyber/dose-response-pro
16. Ahmad M, Kumar N, Dar B, Khan L, Woo A. Dose Response Pro v18.1 (archived source code at time of publication). Zenodo. 2026. https://doi.org/10.5281/zenodo.18922680
