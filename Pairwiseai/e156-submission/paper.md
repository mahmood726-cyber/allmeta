Mahmood Ahmad
Tahir Heart Institute
mahmood.ahmad2@nhs.net

TruthCert PairwisePro: Browser-Based Pairwise Meta-Analysis with Regional Health-Economic Overlays

Can a unified browser application deliver production-grade pairwise meta-analysis across thirteen regional health-economic contexts simultaneously? TruthCert PairwisePro v1.0 is a 27,076-line single-file HTML application providing random-effects meta-analysis with DerSimonian-Laird, REML, and Paule-Mandel estimators, HKSJ adjustment, prediction intervals, and thirteen country-specific cost-effectiveness overlays for Africa-focused health technology assessment applications. The system implements forest plots, funnel plots, Egger regression, trim-and-fill, leave-one-out sensitivity, and cumulative meta-analysis with automated GRADE certainty assessment, all running client-side without server dependencies or installation. Pooled estimates matched R metafor within 0.0001 for tau-squared across all validation benchmarks, with 101 of 101 regression tests passing on the production bundle. Sensitivity analysis confirmed stable conclusions across all three heterogeneity estimators and both confidence interval methods for each benchmark dataset. This architecture demonstrates that a zero-installation browser tool can serve both statistical rigor and health-economic translation in resource-limited settings. Nonetheless, the limitation of fixed country-level cost parameters means site-specific pharmacoeconomic adaptation requires manual override by local analysts.

Outside Notes

Type: methods
Primary estimand: Pooled effect size (OR/RR/MD/SMD)
App: TruthCert PairwisePro v1.0
Data: 13 African countries, 7 disease groups, metafor validation benchmarks
Code: https://github.com/mahmood726-cyber/pairwiseai
Version: 1.0
Validation: DRAFT

References

1. Guyatt GH, Oxman AD, Vist GE, et al. GRADE: an emerging consensus on rating quality of evidence and strength of recommendations. BMJ. 2008;336(7650):924-926.
2. Schunemann HJ, Higgins JPT, Vist GE, et al. Completing 'Summary of findings' tables and grading the certainty of the evidence. Cochrane Handbook Chapter 14. Cochrane; 2023.
3. Borenstein M, Hedges LV, Higgins JPT, Rothstein HR. Introduction to Meta-Analysis. 2nd ed. Wiley; 2021.
