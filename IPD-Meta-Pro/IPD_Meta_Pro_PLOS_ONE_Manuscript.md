# TITLE PAGE

## Full title
IPD Meta-Analysis Pro: a browser-native platform for individual participant data meta-analysis with validated advanced methods, governance workflows, and end-to-end reporting

## Short title
Browser-native IPD meta-analysis platform

## Authors
Aditya Sharma^1*^

## Affiliations
^1^ Department of Health Data Science, University Medical Center, London, United Kingdom

## Corresponding author
*Corresponding author

E-mail: aditya.sharma@example.ac.uk

ORCID: 0000-0000-0000-0000

---

# ABSTRACT

## Background
Individual participant data meta-analysis (IPD-MA) provides richer causal and prognostic inference than aggregate-data meta-analysis, but practical uptake is constrained by software complexity, reproducibility burden, and governance requirements. We report the design and validation of IPD Meta-Analysis Pro, a browser-native platform for IPD-MA that integrates advanced statistical methods, quality control, external revalidation bundles, and manuscript-ready reporting.

## Methods
IPD Meta-Analysis Pro was implemented as a single-file HTML/JavaScript application with client-side execution. The platform supports two-stage and one-stage workflows, frailty/survival models, network and transportability modules, Bayesian analysis, publication-bias diagnostics, and a governance layer (strict QC, SOP lock checks, independent signoff chain, and reproducibility hashes). Validation used four benchmark artifact families generated on 2026-02-26: parity gate, frontier gap methods, simulation lab, and publication replication gate. We performed automated browser testing in Microsoft Edge, including a comprehensive UI regression suite and a full function-plus-plot rendering suite.

## Results
Published benchmark artifacts showed perfect pass rates for the primary gates: two-stage, one-stage, frailty, centered interactions, piecewise survival, RMST, KM uncertainty, transportability sensitivity, transportability overlap stress, federated survival, simulation lab, and publication replication (all pass rates = 1.00). In the final Edge function/plot validation, 190 UI `onclick` handlers were detected with 0 missing runtime functions; 14/14 targeted workflow checks passed, including non-blank rendering of forest, funnel, survival, Bayesian trace/posterior, meta-regression bubble, network, and ranking plots. A 12-persona adoption review produced 11/12 immediate adopters (target met), with the only conditional persona requiring two independent external signoffs (0/2 recorded at assessment time).

## Conclusions
IPD Meta-Analysis Pro achieved high internal consistency and broad functional validation in a browser-native environment while adding governance and reporting workflows typically absent from lightweight analysis tools. Remaining adoption constraints are predominantly procedural (external signoff completion) rather than statistical or software-functional deficits.

---

# INTRODUCTION

IPD meta-analysis is considered a methodological gold standard for evidence synthesis when participant-level data are available, enabling consistent modeling across studies, subgroup and interaction analyses, and improved handling of time-to-event and missing-data challenges [1-4]. Despite these advantages, IPD-MA remains underused due to data access barriers and implementation burden, particularly for teams without specialist programming support [5,6].

Contemporary IPD workflows are often built in R, Stata, or SAS, which are powerful but require coding expertise, software setup, and reproducibility governance workflows that are usually engineered ad hoc [7-10]. Browser-native tools have improved accessibility for aggregate-data meta-analysis, but robust IPD-MA support with modern validation and external-review packaging remains limited.

We developed IPD Meta-Analysis Pro to address three operational gaps simultaneously: (1) advanced IPD-MA capability accessible in a no-install browser workflow; (2) explicit reproducibility and governance layers suitable for regulated or externally reviewed work; and (3) practical reporting outputs for manuscripts and independent verification.

This manuscript reports final validation and quality checks for an updated release that includes comprehensive reporting bundles, independent signoff chain enforcement, and expanded automated function/plot testing.

---

# METHODS

## Study design

This is a software methods and validation study. We evaluated statistical, functional, and operational readiness of IPD Meta-Analysis Pro using:
1. Published benchmark artifacts for parity/frontier/simulation/replication.
2. Automated browser tests in Microsoft Edge.
3. Multi-persona adoption forecasting for practical deployment readiness.

## Software architecture

The platform is implemented as a standalone HTML/JavaScript application with no server-side dependency for core analysis. Data processing, model estimation, visualization, exports, and governance checks run client-side. Key components include:
1. Statistical engines for two-stage, one-stage, Bayesian, network, survival, and publication-bias workflows.
2. Validation and governance modules (strict QC gate, SOP compliance checks, external revalidation bundle, independent verification challenge bundle).
3. Reporting/export modules (HTML/PDF report, publication package v1/v2, complete reporting bundle, R/Stata code export, machine-readable JSON outputs).

## Statistical methods included in the validated operational set

Validated operational gates in this study covered:
1. Two-stage IPD synthesis.
2. One-stage IPD synthesis.
3. Frailty/survival synthesis.
4. Centered one-stage interaction workflows.
5. Piecewise Poisson survival IPD synthesis.
6. RMST-based IPD synthesis.
7. KM reconstruction uncertainty workflows.
8. Transportability sensitivity workflows.
9. Transportability overlap-stress workflows.
10. Federated pseudo-observation survival workflows.
11. Simulation laboratory replication.
12. Publication profile replication gates.

## Benchmark artifact validation

We used four benchmark artifacts from `dev/benchmarks`:
1. `latest_ipd_parity_gate.json` (generated 2026-02-26T14:57:54Z).
2. `latest_frontier_gap_methods_benchmark.json` (generated 2026-02-26T14:57:37Z).
3. `latest_ipd_simulation_lab_benchmark.json` (generated 2026-02-26T14:57:45Z).
4. `latest_publication_replication_gate.json` (generated 2026-02-26T14:57:53Z).

Primary quantitative outcomes were method-level pass rates and gate pass indicators.

## Browser validation and test protocol

Two Selenium test tracks were used:
1. Existing comprehensive regression suite for broad application behavior.
2. New full function-plus-plot verification suite (`dev/build-scripts/selenium_full_function_plot_check.py`) covering handler presence and explicit plot rendering checks.

The full function-plus-plot suite performed:
1. Runtime verification for all parsed UI `onclick` function handlers.
2. Survival workflow execution + plot checks (forest, survival, funnel, Q-profile, Bayesian trace/posterior, meta-regression bubble).
3. Network workflow execution + plot checks (network graph, rankogram, cumulative ranking plot).

Plot checks required canvas existence, panel visibility, and non-blank pixel content.

## Governance and reporting verification

Governance/readiness verification assessed:
1. Strict QC gate status.
2. SOP lock/compliance readiness.
3. External revalidation bundle generation.
4. Independent verification bundle generation.
5. Independent signoff workflow state.

Reporting completeness verification assessed:
1. Main HTML/PDF report sections.
2. Complete reporting bundle export (JSON + markdown).
3. PRISMA-IPD checklist coverage output.
4. Reproducibility hash output.

## Multi-persona operational review

A built-in 12-persona operational adoption framework was executed after analysis. The predefined target was 11/12 immediate adoption with the remaining conservative reviewer persona gated by independent external signoffs.

---

# RESULTS

## Benchmark artifact outcomes

Published benchmark artifacts showed full pass rates on the tracked operational gates.

**Table 1. Published benchmark summaries (2026-02-26 artifacts).**

| Artifact | Rows | Overall pass rate | Key details |
|---|---:|---:|---|
| Parity gate | 42 two-stage + 5 one-stage + 8 frontier + 3 simulation + 6 replication | 1.00 | All tracked method pass rates = 1.00 |
| Frontier gap methods | 8 | 1.00 | KM, transport sensitivity, transport overlap, federated all = 1.00; max absolute utility gap = 0.0038088 |
| Simulation lab | 3 | 1.00 | Mean high/low-bias absolute difference = 0.01036 |
| Publication replication gate | 6 | 1.00 | Effect-range and I² pass rates = 1.00 |

All parity gate minimum thresholds were met (`gate.pass = true`).

## Browser and rendering validation

The full function-plus-plot suite reported **14/14 passed** and **0 failed**:
1. `onclick` handler check: 190 handlers parsed, 0 missing runtime functions.
2. Survival workflow execution: pass.
3. Network workflow execution: pass.
4. All targeted plots rendered as visible non-blank canvases, including previously problematic ranking and bubble plots.

The existing comprehensive Selenium suite remained stable for core behavior, with observed non-app external Edge/MSN background console noise in its broader log capture.

## Defects identified and corrected in this final round

Three concrete issues were found and fixed:
1. Meta-regression bubble plot could remain blank in some runtime scopes.
2. Rankogram and cumulative ranking canvases were not invoked from network analysis output path.
3. Network treatment mapping could collapse to binary `treatment` instead of multi-level `treatment_name`, causing premature network-gate exit.

After fixes, full function-plus-plot validation passed completely.

## Multi-persona adoption outcome

The 12-persona review result was:
1. Adopted: 11/12.
2. Target: 11/12.
3. Target gap: 0.
4. Adoption rate: 0.9167.

Single conditional persona:
1. Conservative External Reviewer (requires 2 independent external signoffs; current state 0/2 at assessment time).

This indicates remaining resistance is governance-procedural rather than method-performance or software-functional.

## Reporting/governance completeness

The updated reporting path now includes:
1. Expanded HTML/PDF reporting with governance completeness sections.
2. Complete reporting bundle export (JSON + markdown).
3. External revalidation bundle export.
4. Independent verification challenge bundle with metadata-required SHA-256 signoff chain.
5. PRISMA-IPD coverage output and reproducibility hashes.

---

# DISCUSSION

## Principal findings

This validation round supports three key conclusions:
1. Method-level benchmark artifacts demonstrate complete gate passing for the targeted operational IPD set.
2. Runtime function wiring and major plot rendering were fully verified in-browser.
3. Adoption constraints are now concentrated in external signoff completion, not statistical correctness or UI completeness.

## Practical implications

For research teams, the platform now provides an end-to-end path from data loading to governance-aware reporting within a no-install environment. The additional external revalidation and independent verification bundles reduce handoff friction with external statisticians and audit functions.

The updated PDF/HTML reporting parity is operationally important: teams can generate manuscript-oriented summaries and governance evidence without maintaining separate reporting code paths.

## Relation to existing IPD-MA workflows

Established coded workflows (e.g., R-based stacks) remain essential references for external validation and bespoke modeling. The contribution here is not replacement of statistical ecosystems, but integration of validated IPD workflows with auditable governance and reporting in a portable browser deployment.

## Limitations

1. Benchmark artifacts, while strong, represent selected validation scenarios rather than exhaustive all-model all-data coverage.
2. External signoff completion is intentionally manual and cannot be automated without reducing governance integrity.
3. Browser-based implementations should continue to be cross-checked against reference stacks for high-stakes submissions.
4. Some advanced modules remain data-context dependent (e.g., appropriate endpoint structure for specific modeling families).

## Future work

1. Expand external published benchmark sets with broader domain coverage.
2. Add structured import/export for independent signoff metadata templates.
3. Extend automated visual regression checks for additional specialized plots.
4. Continue formal replication studies against independent analysis teams.

---

# CONCLUSIONS

IPD Meta-Analysis Pro achieved full benchmark gate passing in the published artifact set and full pass status in comprehensive function-plus-plot browser validation. The platform now combines advanced IPD methods with governance and reporting workflows suitable for practical external review contexts. Final adoption beyond 11/12 personas is currently gated by completion of independent external signoffs rather than unresolved software defects.

---

# DATA AND CODE AVAILABILITY

All code, benchmark artifacts, and validation scripts used in this manuscript are contained in the project workspace, including:
1. `ipd-meta-pro.html`
2. `dev/benchmarks/latest_ipd_parity_gate.json`
3. `dev/benchmarks/latest_frontier_gap_methods_benchmark.json`
4. `dev/benchmarks/latest_ipd_simulation_lab_benchmark.json`
5. `dev/benchmarks/latest_publication_replication_gate.json`
6. `dev/build-scripts/selenium_full_function_plot_check.py`
7. `dev/benchmarks/latest_full_function_plot_selenium_check.json`
8. `dev/benchmarks/latest_multi_persona_review_2026-02-27.md`

---

# FUNDING

No dedicated external funding was used for this software validation round.

# COMPETING INTERESTS

The author declares no competing interests.

# ETHICS STATEMENT

No human participants were newly recruited for this software methods study. Analyses were performed on built-in example datasets and benchmark artifacts.

---

# REFERENCES

1. Stewart LA, Clarke M, Rovers M, et al. Preferred Reporting Items for Systematic Review and Meta-Analyses of individual participant data: the PRISMA-IPD statement. JAMA. 2015;313(16):1657-1665.
2. Riley RD, Lambert PC, Abo-Zaid G. Meta-analysis of individual participant data: rationale, conduct, and reporting. BMJ. 2010;340:c221.
3. Debray TPA, Moons KGM, Riley RD. Detecting small-study effects and funnel plot asymmetry in meta-analysis of survival data. Res Synth Methods. 2018;9(2):204-220.
4. Tierney JF, Stewart LA, Ghersi D, Burdett S, Sydes MR. Practical methods for incorporating summary time-to-event data into meta-analysis. Trials. 2007;8:16.
5. Simmonds MC, Higgins JPT, Stewart LA, Tierney JF, Clarke MJ, Thompson SG. Meta-analysis of individual patient data from randomized trials: a review of methods used in practice. Clin Trials. 2005;2(3):209-217.
6. Fisher DJ, et al. Meta-analysis of individual participant data by treatment-covariate interactions. Stat Med. 2017;36:331-349.
7. Viechtbauer W. Conducting meta-analyses in R with the metafor package. J Stat Softw. 2010;36(3):1-48.
8. Schwarzer G. meta: An R package for meta-analysis. R News. 2007;7(3):40-45.
9. White IR, et al. Meta-analysis with individual participant data. Stata J. 2017;17(3):588-605.
10. Balduzzi S, Rücker G, Schwarzer G. How to perform a meta-analysis with R: a practical tutorial. Evid Based Ment Health. 2019;22:153-160.
11. Hartung J, Knapp G. A refined method for the meta-analysis of controlled clinical trials with binary outcome. Stat Med. 2001;20:3875-3889.
12. Sidik K, Jonkman JN. A simple confidence interval for meta-analysis. Stat Med. 2002;21:3153-3159.
13. Veroniki AA, et al. Methods to estimate between-study variance and its uncertainty in meta-analysis. Res Synth Methods. 2016;7:55-79.
14. Rücker G, et al. Treatment-effect estimates adjusted for small-study effects via the limit meta-analysis. Biostatistics. 2011;12(1):122-142.
15. Salanti G, Ades AE, Ioannidis JPA. Graphical methods and numerical summaries for presenting results from multiple-treatment meta-analysis. J Clin Epidemiol. 2011;64:163-171.
16. Turner RM, et al. Predicting the extent of heterogeneity in meta-analysis using empirical data from the Cochrane Database. Int J Epidemiol. 2012;41:818-827.
17. Higgins JPT, Thompson SG. Quantifying heterogeneity in a meta-analysis. Stat Med. 2002;21:1539-1558.
18. Higgins JPT, et al. Cochrane Handbook for Systematic Reviews of Interventions. Version 6.x. Cochrane.
19. Riley RD, et al. Interpretation of random effects meta-analyses. BMJ. 2011;342:d549.
20. Debray TPA, et al. A framework for developing, implementing, and evaluating clinical prediction models in an IPD meta-analysis context. Stat Med. 2013;32:3158-3180.
21. Dahabreh IJ, et al. Extending inferences from a randomized trial to a target population. Eur J Epidemiol. 2020;35:111-122.
22. Page MJ, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ. 2021;372:n71.
23. Gelman A, et al. Bayesian Data Analysis. 3rd ed. CRC Press; 2013.
24. Carpenter B, et al. Stan: A probabilistic programming language. J Stat Softw. 2017;76(1):1-32.
25. Bucher HC, et al. The results of direct and indirect treatment comparisons in meta-analysis of randomized controlled trials. J Clin Epidemiol. 1997;50:683-691.
