# IPD Meta-Analysis Pro: 40 "Beyond R" Features

## Validated Methods from Statistical Journals - Not Available in Standard R Packages

---

## PHASE 1: ADVANCED HETEROGENEITY & PREDICTION (8 Features)

### 1. Prediction Interval with Hartung-Knapp-Sidik-Jonkman Correction
- **Reference:** Partlett & Riley (2017) *Statistics in Medicine*
- **Innovation:** Corrects poor coverage of standard prediction intervals when k<20
- **R Status:** metafor has basic PI, not HKSJ-corrected PI

### 2. Approximate Bayesian Prediction Intervals
- **Reference:** Higgins, Thompson & Spiegelhalter (2009) *JRSS-A*
- **Innovation:** Full uncertainty quantification without MCMC
- **R Status:** Not implemented as standalone function

### 3. Study-Specific Prediction Intervals
- **Reference:** Nagashima et al. (2019) *Statistical Methods in Medical Research*
- **Innovation:** Confidence distribution approach for each new study
- **R Status:** Not available

### 4. Heterogeneity Partitioning (Within vs Between Study)
- **Reference:** Jackson et al. (2012) *Statistics in Medicine*
- **Innovation:** Decompose I² into sources
- **R Status:** Not automated

### 5. Generalized Q-Profile Method for τ² CI
- **Reference:** Viechtbauer (2007) *Statistics in Medicine*
- **Innovation:** Exact CI for heterogeneity variance
- **R Status:** Available but not with visual diagnostics

### 6. Multiplicative Heterogeneity Model
- **Reference:** Thompson & Sharp (1999) *Statistics in Medicine*
- **Innovation:** Alternative to additive random effects
- **R Status:** Not standard

### 7. Heterogeneity-Adjusted Power Calculator
- **Reference:** Jackson & Turner (2017) *Research Synthesis Methods*
- **Innovation:** Power accounting for between-study variance
- **R Status:** Limited implementation

### 8. Optimal Information Size (OIS) with Heterogeneity
- **Reference:** Wetterslev et al. (2008) *Journal of Clinical Epidemiology*
- **Innovation:** Required sample size for meta-analysis conclusions
- **R Status:** Not in metafor/meta

---

## PHASE 2: PUBLICATION BIAS EXTENSIONS (6 Features)

### 9. 3-Parameter Selection Model (3PSM)
- **Reference:** Citkowicz & Vevea (2017) *Psychological Methods*
- **Innovation:** Parsimonious weight function model
- **R Status:** weightr package exists but limited integration

### 10. Robust Bayesian Meta-Analysis (RoBMA)
- **Reference:** Maier et al. (2022) *Psychological Methods*
- **Innovation:** Model averaging across selection models
- **R Status:** Separate package, not integrated

### 11. PET-PEESE with Heterogeneity Correction
- **Reference:** Stanley (2017) *Research Synthesis Methods*
- **Innovation:** Corrects PET-PEESE for τ²
- **R Status:** Not standard

### 12. Limit Meta-Analysis
- **Reference:** Rücker et al. (2011) *Biostatistics*
- **Innovation:** Estimates effect at infinite precision
- **R Status:** metasens package, limited

### 13. Extended Funnel Plot with Contours
- **Reference:** Peters et al. (2008) *JAMA*
- **Innovation:** Statistical significance contours
- **R Status:** Basic only

### 14. P-Curve with Robustness Tests
- **Reference:** Simonsohn et al. (2015) *Journal of Experimental Psychology*
- **Innovation:** Evidential value + robustness
- **R Status:** dmetar has basic version

---

## PHASE 3: IPD-SPECIFIC METHODS (8 Features)

### 15. Ecological Bias Decomposition
- **Reference:** Hua et al. (2017) *Statistics in Medicine*
- **Innovation:** Separate within-trial from across-trial effects
- **R Status:** Not automated

### 16. DEFT Approach (Debias Ecological From Trial)
- **Reference:** Fisher et al. (2017) *BMJ*
- **Innovation:** Correct meta-regression for ecological bias
- **R Status:** Not available

### 17. Two-Stage vs One-Stage Decision Tool
- **Reference:** Riley et al. (2023) *Research Synthesis Methods*
- **Innovation:** Automated guidance on approach selection
- **R Status:** Not available

### 18. Pseudo-IPD from Aggregate Data
- **Reference:** Riley et al. (2020) *Statistics in Medicine*
- **Innovation:** Reconstruct IPD from summary statistics
- **R Status:** Not integrated

### 19. IPD-AD Synthesis (Combined Analysis)
- **Reference:** Riley et al. (2008) *Statistics in Medicine*
- **Innovation:** Optimally combine IPD + aggregate data studies
- **R Status:** ipdmeta limited

### 20. Internal-External Cross-Validation for IPD
- **Reference:** Royston et al. (2004) *Statistics in Medicine*
- **Innovation:** Leave-one-study-out validation
- **R Status:** Not automated

### 21. Calibration Hierarchy Assessment
- **Reference:** Debray et al. (2015) *Statistics in Medicine*
- **Innovation:** Multi-level calibration for prediction models
- **R Status:** Not available

### 22. Missing Covariate Imputation in IPD-MA
- **Reference:** Jolani et al. (2015) *Statistics in Medicine*
- **Innovation:** Multiple imputation across studies
- **R Status:** Complex, not integrated

---

## PHASE 4: SURVIVAL & TIME-TO-EVENT (6 Features)

### 23. RMST Meta-Analysis
- **Reference:** Wei et al. (2015) *Statistics in Medicine*
- **Innovation:** Pool restricted mean survival time differences
- **R Status:** Not in meta/metafor

### 24. Landmark Analysis Meta-Analysis
- **Reference:** Dafni (2011) *Statistics in Medicine*
- **Innovation:** Time-dependent effects at fixed landmarks
- **R Status:** Not available

### 25. Non-Proportional Hazards Detection Suite
- **Reference:** Royston & Parmar (2011) *BMC Medical Research Methodology*
- **Innovation:** Multiple tests for PH assumption in MA
- **R Status:** Limited

### 26. Flexible Parametric Survival MA
- **Reference:** Crowther et al. (2012) *Statistics in Medicine*
- **Innovation:** Royston-Parmar models in MA
- **R Status:** Not integrated

### 27. Cure Fraction Meta-Analysis
- **Reference:** Diao et al. (2019) *Statistics in Medicine*
- **Innovation:** Pool cure rates across studies
- **R Status:** Not available

### 28. Competing Risks Meta-Analysis
- **Reference:** Del Giovane et al. (2013) *Statistics in Medicine*
- **Innovation:** Cause-specific hazards synthesis
- **R Status:** Not standard

---

## PHASE 5: NETWORK META-ANALYSIS EXTENSIONS (6 Features)

### 29. Component NMA with Interaction Testing
- **Reference:** Rücker et al. (2020) *Biometrical Journal*
- **Innovation:** Additive + interaction models for complex interventions
- **R Status:** netmeta has basic, no interaction testing UI

### 30. Predictive P-Scores with Uncertainty
- **Reference:** Rosenberger et al. (2021) *BMC Medical Research Methodology*
- **Innovation:** Bayesian predictive ranking with CrI
- **R Status:** Not available

### 31. Fragility Index for NMA
- **Reference:** Xing et al. (2020) *BMC Medical Research Methodology*
- **Innovation:** Evidence stability in networks
- **R Status:** Not available

### 32. Node-Splitting with Multiple Comparisons
- **Reference:** Dias et al. (2010) *Statistics in Medicine*
- **Innovation:** Comprehensive inconsistency testing
- **R Status:** gemtc has basic

### 33. Treatment Hierarchy Probability Plots
- **Reference:** Salanti et al. (2011) *Statistical Methods in Medical Research*
- **Innovation:** Visual ranking uncertainty
- **R Status:** Limited visualization

### 34. Minimum Detectable Difference in NMA
- **Reference:** Nikolakopoulou et al. (2014) *Statistics in Medicine*
- **Innovation:** Power analysis for networks
- **R Status:** Not available

---

## PHASE 6: EVIDENCE QUALITY & DECISION SUPPORT (6 Features)

### 35. Automated GRADE Assessment Engine
- **Reference:** Guyatt et al. (2011) *BMJ* (GRADE series)
- **Innovation:** Rules-based certainty of evidence
- **R Status:** Not available (manual only)

### 36. Influence Diagnostics Dashboard
- **Reference:** Viechtbauer & Cheung (2010) *Research Synthesis Methods*
- **Innovation:** Cook's D, DFBETAS, leverage visualization
- **R Status:** metafor has functions, no integrated dashboard

### 37. Fragility Index for Meta-Analysis
- **Reference:** Atal et al. (2019) *Journal of Clinical Epidemiology*
- **Innovation:** Event status changes to alter significance
- **R Status:** fragility package limited

### 38. Reverse Fragility Index
- **Reference:** Khan et al. (2020) *JAMA Network Open*
- **Innovation:** Robustness of non-significant findings
- **R Status:** Not available

### 39. Trial Sequential Analysis Dashboard
- **Reference:** Wetterslev et al. (2017) *BMC Medical Research Methodology*
- **Innovation:** α-spending, futility boundaries, monitoring
- **R Status:** Not integrated (TSA software separate)

### 40. Bayesian Model Averaging for MA
- **Reference:** Gronau et al. (2021) *Psychological Methods*
- **Innovation:** Average across RE/FE/selection models
- **R Status:** BayesFactor limited

---

## Implementation Status

| Phase | Features | Status |
|-------|----------|--------|
| 1 | Heterogeneity (1-8) | Pending |
| 2 | Pub Bias (9-14) | Pending |
| 3 | IPD Methods (15-22) | Pending |
| 4 | Survival (23-28) | Pending |
| 5 | NMA (29-34) | Pending |
| 6 | Evidence (35-40) | Pending |

---

## Key References

1. Viechtbauer W (2010). metafor: Meta-Analysis Package for R. *J Stat Softw*
2. Riley RD et al. (2021). *Individual Participant Data Meta-Analysis*. Wiley
3. Higgins JPT et al. (2019). *Cochrane Handbook for Systematic Reviews*
4. Salanti G (2012). Indirect and mixed-treatment comparison. *Res Synth Methods*
5. Wetterslev J et al. (2017). Trial sequential analysis. *BMC Med Res Methodol*

---

*Document created: January 2025*
*Target: IPD Meta-Analysis Pro v2.0*
