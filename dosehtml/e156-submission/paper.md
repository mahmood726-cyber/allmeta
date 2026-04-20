Mahmood Ahmad
Tahir Heart Institute
mahmood.ahmad2@nhs.net

Dose Response Pro: Browser-Based Dose-Response Meta-Analysis Matching R Accuracy

Can browser-based dose-response meta-analysis match the numerical accuracy of established R packages while providing interactive visualization? Dose Response Pro v18.1 is a 10,022-line single-file HTML application implementing the Greenland-Longnecker two-stage method for dose-response meta-analysis with linear, quadratic, and restricted cubic spline models, plus leave-one-out sensitivity analysis. The tool provides interactive dose-response curve plotting, CSV import with flexible column detection, R code export for reproducibility checks, and a command-line interface for batch processing alongside the browser application. Strict benchmarking against the R dosresmeta package showed exact parity on 120 of 120 comparable datasets with a median runtime speedup of 1.92x over the R implementation. Deterministic CLI validation confirmed three-of-three passed checks including grid-based coefficient verification against independently computed reference values. This demonstrates that client-side JavaScript can deliver publication-quality dose-response synthesis with performance exceeding dedicated statistical environments. However, the limitation of exploratory spline model status means complex non-linear relationships require independent validation before clinical interpretation of inflection points.

Outside Notes

Type: methods
Primary estimand: Dose-response trend coefficient
App: Dose Response Pro v18.1
Data: 120 R dosresmeta benchmark datasets
Code: https://github.com/mahmood726-cyber/dosehtml
Version: 18.1
Validation: DRAFT

References

1. Crippa A, Orsini N. Dose-response meta-analysis of differences in means. BMC Med Res Methodol. 2016;16:91.
2. Greenland S, Longnecker MP. Methods for trend estimation from summarized dose-response data, with applications to meta-analysis. Am J Epidemiol. 1992;135(11):1301-1309.
3. Borenstein M, Hedges LV, Higgins JPT, Rothstein HR. Introduction to Meta-Analysis. 2nd ed. Wiley; 2021.
