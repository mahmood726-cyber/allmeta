Mahmood Ahmad
Tahir Heart Institute
mahmood.ahmad2@nhs.net

IPD Meta-Analysis Pro: A Browser-Based Platform for Individual Participant Data Evidence Synthesis

How can researchers conduct individual participant data meta-analysis reproducibly without fragmenting workflows across multiple statistical platforms? IPD Meta-Analysis Pro is a 51,305-line browser application providing IPD synthesis with one-stage and two-stage pooling, subgroup stratification, covariate-adjusted modeling, and GRADE appraisal panels. The engine implements mixed-effects logistic and linear regression, stratified Cox models, interaction testing, and heterogeneity diagnostics through modular JavaScript validated against R equivalents via WebR. A release pipeline comprising 56 automated regression tests achieved a 100 percent pass rate, with R parity gates confirming agreement for pooled HR and MD estimates within 95% CI tolerance. Browser test harness, user-flow smoke suite, and core statistics validation collectively verify stability across data import, model configuration, diagnostic inspection, and export pathways. IPD Meta-Analysis Pro removes operational barriers to participant-level evidence synthesis while preserving full methodological transparency and audit capability. The tool cannot replace purpose-built Bayesian hierarchical frameworks or handle time-to-event competing risks natively, requiring external software for those analyses.

Outside Notes

Type: methods
Primary estimand: Pooled IPD treatment effect
App: IPD Meta-Analysis Pro v1.0
Data: 51,305-line browser application with WebR validation
Code: https://github.com/mahmood726-cyber/ipd-meta-pro
Version: 1.0
Validation: DRAFT

References

1. Roever C. Bayesian random-effects meta-analysis using the bayesmeta R package. J Stat Softw. 2020;93(6):1-51.
2. Higgins JPT, Thompson SG, Spiegelhalter DJ. A re-evaluation of random-effects meta-analysis. J R Stat Soc Ser A. 2009;172(1):137-159.
3. Borenstein M, Hedges LV, Higgins JPT, Rothstein HR. Introduction to Meta-Analysis. 2nd ed. Wiley; 2021.
