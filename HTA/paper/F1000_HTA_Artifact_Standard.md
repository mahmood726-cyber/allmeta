# HTA Artifact Standard v1.1: a browser-based platform for health technology assessment with 49 integrated analytical engines

## Authors

Mahmood Ahmad ^1,2^, Niraj Kumar ^1^, Bilaal Dar ^3^, Laiba Khan ^1^, Andrew Woo ^4^

^1^ Royal Free London NHS Foundation Trust, London, UK
^2^ Tahir Heart Institute, Rabwah, Pakistan
^3^ King's College London GKT School of Medical Education, London, UK
^4^ St George's, University of London, London, UK

**Corresponding author:** Mahmood Ahmad (mahmood726@gmail.com)

## Abstract

Health technology assessment (HTA) requires the integration of economic modelling, evidence synthesis, and uncertainty analysis, yet these tasks are commonly fragmented across proprietary desktop software, statistical programming environments, and spreadsheet-based models. We present HTA Artifact Standard v1.1, an open-source, browser-based platform that unifies 49 analytical engines — spanning Markov cohort modelling, microsimulation, pairwise and network meta-analysis, probabilistic sensitivity analysis, value-of-information computation, budget impact analysis, multi-criteria decision analysis, competing risks, cure models, semi-Markov modelling, correlated PSA, threshold analysis, model averaging, EVSI, multi-state models, joint models, country profiles (22 countries with WTP thresholds, discount rates, severity adjustment, and currency conversion), Cox PH/AFT regression, Guyot IPD synthesis from published Kaplan-Meier curves, expected loss analysis (Basu & Meltzer [18] framework), regulatory submission templates (NICE STA, CADTH, EUnetHTA JCA, PBAC, G-BA AMNOG), GRADE automation with CINeMA for NMA, and living HTA sequential monitoring — within a single client-side application. The platform requires no server-side computation and operates offline after initial load via a Service Worker. Deterministic reproducibility is enforced through a PCG32 seeded pseudo-random number generator, Kahan summation for numerical stability, and IEEE 754 double-precision compliance. Computation-intensive engines run off the main thread via a Web Worker pool. Validation comprises approximately 4,000 automated tests across 91 test suites — including unit tests, integration tests, property-based tests (fast-check), stress/fuzz tests, and performance benchmarks — with R cross-validation against metafor v4.8-0, and three independent Markov reference fixtures that agree with R comparator outputs to within a maximum absolute error of 4.72 x 10^-5^ across all outcome metrics (observed in life-year predictions). Bayesian NMA includes Gelman-Rubin R-hat convergence diagnostics. Results are exportable as R, Python, and CSV for external reproducibility. The software is freely available under the MIT licence.

**Keywords:** health technology assessment, cost-effectiveness analysis, Markov model, network meta-analysis, probabilistic sensitivity analysis, value of information, evidence synthesis, open-source software

## Introduction

Health technology assessment integrates clinical evidence, economic modelling, and uncertainty quantification to inform resource allocation decisions in healthcare systems [1,2]. Analysts conducting HTA routinely require capabilities spanning Markov state-transition modelling, meta-analytic pooling of treatment effects, probabilistic sensitivity analysis (PSA), and value-of-information (VOI) estimation. In practice, these tasks are distributed across several tools: TreeAge Pro for decision modelling [1], R packages such as metafor [3] and BCEA [10] for evidence synthesis and VOI, and bespoke Excel workbooks for specific agency submissions [15].

This fragmentation introduces several difficulties. First, transferring intermediate results between tools requires manual data handling that is prone to transcription error. Second, reproducibility is compromised when analyses depend on undocumented software configurations or proprietary file formats. Third, commercial licences (TreeAge Pro costs approximately USD 6,000 per year) restrict access for researchers in resource-limited settings and for students.

HTA Artifact Standard was developed to address these gaps by providing a unified, browser-based environment for the core HTA workflow: model specification, evidence synthesis, uncertainty analysis, and structured reporting. The platform runs entirely in the client browser, requires no installation, and enforces deterministic execution through explicit numerical contracts. This article describes the software architecture, analytical capabilities, validation strategy, and limitations of version 1.1.

## Methods

### Implementation

HTA Artifact Standard is implemented as a client-side web application. The main entry point (`index.html`) loads JavaScript modules from the `src/` directory, organised into four subsystems. Version 1.1 comprises 49 analytical engines.

- **Engine** (`src/engine/`): The engine subsystem contains 49 analytical modules spanning the full HTA methodology spectrum. Core engines include Markov cohort simulation, microsimulation, decision trees, PSA, EVPI/EVPPI computation, network meta-analysis (Bayesian Gibbs MCMC with R-hat diagnostics and frequentist), pairwise meta-analysis (DL/REML/PM/EB with HKSJ adjustment), three-level meta-analysis, partitioned survival analysis, Mendelian randomisation, power priors for historical borrowing, publication bias methods (Egger, Begg, Copas, PET-PEESE), calibration, and automated report generation. Version 1.0 added 15 engines across four categories: (i) economic evaluation — budget impact analysis (BudgetImpact), multi-criteria decision analysis (MCDA), threshold analysis (ThresholdAnalysis), scenario analysis (ScenarioAnalysis), headroom analysis (HeadroomAnalysis), probabilistic BIA (ProbabilisticBIA), and network MCDA (NetworkMCDA); (ii) survival and clinical modelling — competing risks with Aalen-Johansen and Fine-Gray estimators (CompetingRisks), mixture and non-mixture cure models (CureModels), semi-Markov sojourn-time models (SemiMarkov), multi-state models (MultiStateModel), joint longitudinal-survival models (JointModel), and BIC/AIC/DIC model averaging (ModelAveraging); (iii) value of information — expected value of sample information with moment matching and optimal sample size (EVSI); and (iv) advanced PSA — correlated parameter sampling via Cholesky decomposition and Gaussian copulas (CorrelatedPSA). Version 1.1 adds 8 engines across three categories: (v) international HTA — country profiles for 22 jurisdictions with WTP thresholds, discount rates, severity adjustment, and currency conversion (CountryProfiles), and regulatory submission template generators for NICE STA, CADTH, EUnetHTA JCA, PBAC, and G-BA AMNOG (RegulatoryTemplates); (vi) survival analysis — Cox proportional hazards and accelerated failure time regression with Newton-Raphson partial likelihood, Breslow/Efron tie handling, Schoenfeld proportional hazards test, and concordance index (CoxRegression), and Guyot IPD synthesis for reconstructing individual patient data from published Kaplan-Meier curves (GuyotIPD); (vii) decision-theoretic extensions — expected loss computation using the Basu & Meltzer [18] framework with population scaling and opportunity cost (ExpectedLoss), GRADE automation with auto-rating of five domains plus CINeMA for NMA and OIS-based summary of findings tables (GRADEAutomation), and living HTA sequential monitoring with O'Brien-Fleming and Pocock spending boundaries for ongoing evidence surveillance (LivingHTA). The pairwise meta-analysis engine shares validated statistical components with related browser-based tools by the same development group, including effect size calculation, heterogeneity estimation, and confidence interval computation. Computation-intensive engines (PSA, microsimulation, MCMC) run off the main thread via a Web Worker pool to maintain UI responsiveness.
- **Validator** (`src/validator/`): JSON Schema validation (`project.schema.json`, `results.schema.json`), semantic rule checking (probability bounds, mass conservation, circular dependency detection, reference integrity).
- **Parser** (`src/parser/`): A safe, non-Turing-complete expression language supporting arithmetic, built-in functions (`exp`, `ln`, `sqrt`, `rate_to_prob`, `prob_to_rate`, `if`, `clamp`), and time/age-dependent parameter references.
- **UI** (`src/ui/`): Application controller, interactive network visualisation, beginner mode, and enhanced visualisation panels.

External dependencies are limited to Chart.js and D3.js for visualisation and JSZip for artifact packaging, all loaded from CDN. The application registers a Service Worker for offline operation after initial load. All engines support R, Python, and CSV export for external reproducibility. A GitHub Actions CI pipeline (Node 18/20) enforces the full quality gate on every push.

### Deterministic execution contract

Reproducibility is a first-order design constraint. All stochastic operations use a PCG32 pseudo-random number generator [16] initialised from a user-specified or default seed, ensuring identical output sequences across runs. Floating-point accumulation uses Kahan compensated summation [17] to minimise rounding drift in long Markov traces. All arithmetic operates under IEEE 754 double-precision semantics. The quality gate (`npm run validate:determinism`) confirms byte-stable output hashes across repeated executions.

### Markov cohort modelling

The Markov engine supports discrete-time cohort simulation with configurable cycle length, time horizon, and discount rates for costs and QALYs. Transition probabilities may be constant, age-dependent, or time-dependent, specified through the expression language. Four half-cycle correction methods are available: none, start-of-cycle, end-of-cycle, and trapezoidal (default). Model specifications and results are packaged in the `.hta.zip` artifact format, which bundles a `manifest.json` (file checksums), `project.json` (model definition), and optional `results.json` and supporting evidence documents.

### Evidence synthesis

**Pairwise meta-analysis.** The platform implements random-effects (DerSimonian-Laird [5]) and fixed-effect models. Four heterogeneity variance estimators are available: DerSimonian-Laird, restricted maximum likelihood (REML), Paule-Mandel, and empirical Bayes. The Hartung-Knapp-Sidik-Jonkman (HKSJ) adjustment [7] is provided for confidence interval construction under random effects; note that full sandwich/CR2 robust variance estimation is not currently implemented. Heterogeneity is reported as tau-squared, I-squared with confidence intervals [6], H-squared, and prediction intervals. Sensitivity analyses include leave-one-out, cumulative meta-analysis, and influence diagnostics.

**Network meta-analysis.** Both Bayesian (Gibbs sampler MCMC with Gelman-Rubin R-hat diagnostics) and frequentist approaches are implemented. Treatment rankings use SUCRA [12] and P-score methods. Consistency is assessed via node-split models [4]. Additional outputs include league tables, network geometry statistics, comparison-adjusted funnel plots, network meta-regression, and component NMA.

**Publication bias.** Four validated methods are available: Egger's regression test [8], Begg's rank correlation, Copas selection model [9], and PET-PEESE. Contour-enhanced funnel plots are provided for visual assessment.

**Specialised methods.** The platform includes three-level meta-analysis, Mendelian randomisation (IVW, MR-Egger, weighted median, MR-PRESSO), and historical data borrowing via power priors. Partitioned survival analysis is available for oncology HTA submissions.

### Probabilistic sensitivity analysis and value of information

PSA samples model parameters from user-specified distributions (beta, gamma, lognormal, normal) using the seeded PCG32 generator. Cost-effectiveness planes, cost-effectiveness acceptability curves (CEACs), and expected net monetary benefit (NMB) are computed across a range of willingness-to-pay thresholds.

The expected value of perfect information (EVPI) [10] is computed from PSA output as the difference between the expected value of the decision made with perfect information and the expected value of the decision made with current information. Partial EVPI (EVPPI) for parameter subgroups uses a GAM metamodeling approximation [11], trading computational efficiency against the full nested Monte Carlo estimator.

### Reporting and quality assessment

The platform generates structured reports with forest plots, funnel plots, PRISMA 2020 flow diagrams [13], CHEERS 2022 reporting checklists [14], GRADE assessments, and CINeMA framework evaluations. Risk-of-bias assessment follows RoB 2 (5 domains) and ROBINS-I (7 domains) instruments with traffic-light plot visualisation. Reports are exportable as PDF, Excel, and R or Python code.

### Operation

Users open `index.html` in a modern browser (Chrome 80+, Firefox 78+, Safari 14+, Edge 80+). A model can be initialised from one of 15 pre-built templates, loaded from a `.hta.zip` artifact, or configured manually through the interface. The workflow proceeds through model specification, parameter entry, base-case execution, PSA, VOI analysis, and report export. No server, database, or user account is required.

## Results

### Validation against R reference implementations

The automated test suite comprises approximately 4,000 tests across 91 test suites covering all 49 engines. The test infrastructure includes four categories: (i) unit tests for each engine and utility module; (ii) integration tests (50 end-to-end scenarios exercising multi-engine workflows); (iii) property-based tests using fast-check for invariant verification across randomised inputs; and (iv) stress/fuzz tests and performance benchmarks enforced via the CI quality gate. Key engine-level test counts include PSA (19), NMA (24), DES (33), microsimulation (24), meta-analysis methods (48), EVPPI (25), budget impact analysis, MCDA, competing risks, cure models, semi-Markov, correlated PSA, threshold analysis, scenario analysis, model averaging, EVSI, multi-state models, joint models, headroom analysis, probabilistic BIA, network MCDA, and the Markov engine, expression parser, sanitisation, and editorial modules. Eight pairwise meta-analysis benchmarks against R metafor v4.8-0 and meta were conducted (DerSimonian-Laird and REML estimators, fixed-effect models, HKSJ adjustment, heterogeneity statistics). All eight tests passed within the specified tolerance. Four publication bias methods (Egger, Begg, Copas, PET-PEESE) were validated against R equivalents. Trim-and-fill validation covers all three estimators (L0, R0, Q) against metafor. Bayesian NMA includes Gelman-Rubin R-hat convergence diagnostics for assessing chain mixing.

Three Markov cohort reference fixtures (simple model, age-dependent transitions, and PSA demonstration) were validated against independently executed R scripts stored in `external-comparators/r/`. Agreement was assessed using absolute and relative error metrics. The maximum absolute error across all fixtures was 4.72 x 10^-5^ across all outcome metrics (observed in life-year predictions) and the maximum relative error was 1.14 x 10^-5^, both within the tolerance thresholds of 0.01 (costs) and 0.001 (relative).

Determinism was confirmed by executing each fixture multiple times and comparing SHA-256 hashes of output JSON, all of which were byte-identical.

### Feature comparison

Table 1 compares the capabilities of HTA Artifact Standard against established alternatives.

**Table 1. Feature comparison across HTA and evidence synthesis platforms.**

| Feature | HTA Artifact Standard | TreeAge Pro | R (BCEA/heemod) | Excel models | NICE DSU tools |
|---|---|---|---|---|---|
| Interactive GUI | Yes (browser) | Yes (desktop) | No (CLI) | Yes | No |
| No installation required | Yes | No | No | Yes | No |
| Markov cohort models | Yes | Yes | Yes (heemod) | Yes | Yes |
| Microsimulation | Yes | Yes | No | No | No |
| Decision trees | Yes | Yes | Yes | Yes | No |
| NMA (Bayesian Gibbs + frequentist) | Yes | No | No | No | Yes |
| Pairwise MA (DL/REML/PM/EB + HKSJ) | Yes | No | Yes (metafor) | No | Yes |
| Three-level MA | Yes | No | Yes (metafor) | No | No |
| Publication bias (4 methods) | Yes | No | Partial (4-5 methods) | No | No |
| Mendelian randomisation | Yes | No | Yes (MendelianRandomization) | No | No |
| Power priors / historical borrowing | Yes | No | Partial | No | No |
| Partitioned survival analysis | Yes | Yes | Yes (hesim) | No | Yes |
| Budget impact analysis | Yes | No | Partial | Yes | Yes |
| MCDA (swing weighting, rank acceptability) | Yes | No | No | No | No |
| Competing risks (Aalen-Johansen, Fine-Gray) | Yes | No | Yes (cmprsk) | No | No |
| Cure models (mixture, non-mixture) | Yes | No | Yes (flexsurvcure) | No | Partial |
| Semi-Markov (sojourn-time dependent) | Yes | Partial | Yes (heemod) | No | No |
| Multi-state models | Yes | No | Yes (mstate) | No | No |
| Joint longitudinal-survival models | Yes | No | Yes (JM) | No | No |
| Model averaging (BIC/AIC/DIC) | Yes | No | Yes | No | No |
| Correlated PSA (Cholesky, copulas) | Yes | No | Yes | Partial | Partial |
| Threshold analysis (break-even, tornado) | Yes | Yes | Partial | Yes | Yes |
| EVSI (moment matching, optimal sample size) | Yes | No | Yes (EVSI) | No | Yes |
| Headroom analysis | Yes | No | No | No | Partial |
| Country profiles (22 jurisdictions) | Yes | No | No | No | No |
| Cox PH/AFT regression | Yes | No | Yes (survival) | No | Partial |
| Guyot IPD synthesis from KM curves | Yes | No | Yes (IPDfromKM) | No | Yes |
| Expected loss (Basu & Meltzer [18]) | Yes | No | Yes (BCEA) | No | No |
| Regulatory templates (5 agencies) | Yes | No | No | No | Partial |
| GRADE automation + CINeMA | Yes | No | Partial | No | Partial |
| Living HTA sequential monitoring | Yes | No | Partial (ldbounds) | No | No |
| PSA (beta/gamma/normal/lognormal) | Yes | Yes | Yes | Partial | Yes |
| EVPI/EVPPI | Yes | Yes | Yes | No | Yes |
| Deterministic contract (PCG32) | Yes | No | No | No | No |
| Risk-of-bias assessment (RoB 2, ROBINS-I) | Yes | No | No | No | No |
| GRADE/CINeMA | Yes | No | No | No | Partial |
| Open source | Yes (MIT) | No | Yes (GPL) | Varies | Partial |
| Offline capable | Yes (PWA) | Yes | Yes | Yes | No |
| Annual licence cost | Free | USD 6,000+ | Free | Free | Free |

### Quality gates and test coverage

The project enforces a continuous-integration quality gate via GitHub Actions (Node 18/20) comprising linting (15 ESLint rules), unit tests with module-level coverage thresholds, reference validation, determinism checks, and performance benchmarks. The test suite comprises approximately 4,000 automated tests across 91 test suites, organised in four tiers:

**Tier 1 — Unit tests.** Each of the 49 engines has a dedicated test suite. Representative counts include:

- **PSA** (19 tests): probabilistic sensitivity analysis sampling, distribution validation, and convergence checks.
- **NMA** (24 tests): Bayesian Gibbs MCMC convergence, frequentist consistency, SUCRA rankings, node-split models, and league table generation.
- **DES** (33 tests): discrete-event simulation scheduling, resource queuing, event-driven state transitions, and trace reproducibility.
- **Microsimulation** (24 tests): individual patient trajectories, state-transition fidelity, heterogeneous cohort sampling, and aggregate outcome convergence.
- **Meta-analysis methods** (48 tests): pairwise estimators (DL/REML/PM/EB), HKSJ adjustment, heterogeneity statistics, prediction intervals, cumulative and leave-one-out analyses, three-level meta-analysis, and trim-and-fill with L0/R0/Q estimators.
- **EVPPI** (25 tests): GAM metamodel fitting, partial EVPI computation, parameter subgroup selection, and convergence against nested Monte Carlo benchmarks.
- **Budget impact analysis**: population projection, market uptake curves, subpopulation stratification, and scenario comparison.
- **MCDA**: weighted-sum aggregation, swing weighting, rank acceptability analysis, dominance detection, and weight sensitivity.
- **Competing risks**: cumulative incidence functions, Aalen-Johansen estimator, Fine-Gray subdistribution hazards, and Gray's test.
- **Cure models**: mixture cure (EM algorithm), non-mixture cure, and distribution comparison.
- **Semi-Markov**: sojourn-time dependent transitions (Weibull, gamma, lognormal) and tunnel states.
- **Correlated PSA**: Cholesky decomposition, Gaussian copulas, and multivariate sampling validation.
- **Threshold analysis**: one-way and two-way thresholds, tornado diagrams, and bisection break-even.
- **Model averaging**: BIC/AIC/DIC weight computation, model-averaged predictions, and survival distribution comparison.
- **EVSI**: moment matching, optimal sample size, and population-adjusted value of information.
- **Country profiles** (45 tests): 22-country HTA jurisdiction database with WTP thresholds, discount rates, severity adjustment rules, and real-time currency conversion.
- **Cox regression** (26 tests): Newton-Raphson partial likelihood estimation, Breslow and Efron tie-handling methods, Schoenfeld proportional hazards test, concordance index, and AFT model fitting.
- **Guyot IPD synthesis** (24 tests): individual patient data reconstruction from digitised Kaplan-Meier curves, risk table reconciliation, and survival distribution fitting.
- **Expected loss** (24 tests): Basu & Meltzer [18] expected loss framework, population scaling, opportunity cost computation, and WTP-threshold sensitivity.
- **Regulatory templates** (35 tests): structured submission generators for 5 agencies (NICE STA, CADTH, EUnetHTA JCA, PBAC, G-BA AMNOG), section completeness validation, and format compliance.
- **GRADE automation** (28 tests): auto-rating of 5 quality domains, CINeMA confidence ratings for NMA, optimal information size (OIS) computation, and summary of findings table generation.
- **Living HTA** (30 tests): sequential monitoring with O'Brien-Fleming and Pocock alpha-spending boundaries, information fraction tracking, and cumulative evidence updating.
- **Multi-state models, joint models, headroom analysis, probabilistic BIA, network MCDA, scenario analysis**: dedicated suites for each engine.
- **Markov engine**: cohort simulation, half-cycle corrections, tunnel states, and time-dependent transitions.
- **Expression parser**: arithmetic evaluation, built-in functions, variable resolution, and error handling for malformed expressions (300+ lines of test coverage).
- **Input sanitisation**: HTML entity encoding, script injection prevention, and attribute-context escaping.
- **Editorial revisions**: structured reporting output, CHEERS checklist completeness, and PRISMA flow diagram generation.
- **Utility modules**: Kahan summation (catastrophic cancellation, large-n accumulation, Neumaier variant), PCG32 (determinism, golden sequence, all 10 distributions, state save/restore), math utilities, life tables, audit logging, interoperability (TreeAge XML import, R export, Excel I/O), and JSON Schema/semantic validators.

**Tier 2 — Integration tests** (50 end-to-end scenarios): multi-engine workflows exercising the full pipeline from model specification through PSA and VOI to report export.

**Tier 3 — Property-based tests** (fast-check): invariant verification across randomised inputs for numerical engines, ensuring properties such as probability conservation, non-negative costs, and monotonic CEACs hold across the parameter space.

**Tier 4 — Stress/fuzz tests and performance benchmarks**: large-input resilience, edge-case boundary testing, and CI-enforced performance regression detection (`npm run bench:ci`).

R cross-validation against metafor v4.8-0 confirms agreement for pairwise meta-analysis (DL and REML), publication bias (Egger and Begg), three-level meta-analysis, and trim-and-fill methods.

### Security

The platform enforces systematic XSS prevention throughout the codebase. All user-facing content rendered via `innerHTML` passes through an `escapeHtml()` function that encodes `<`, `>`, `&`, `"`, and `'` characters. Tutorial and help content uses `textContent` assignment rather than `innerHTML` to eliminate injection vectors. A dedicated input sanitisation module (`src/utils/sanitize.js`) validates and sanitises all user-provided data before it enters the computation pipeline or the DOM. No raw `innerHTML` assignment with user-provided data occurs anywhere in the application. The sanitisation module has its own test suite to verify correct handling of script injection, event handler injection, and encoded attack payloads.

### Accessibility

Keyboard navigation is supported throughout the interface. Modal dialogs implement a focus trap that constrains Tab cycling to interactive elements within the modal and restores focus to the triggering element on close. All interactive elements respond to both Enter and Space key events. Buttons and interactive widgets carry ARIA labels describing their function. Dark mode is implemented through CSS custom properties and respects the user's operating system preference via the `prefers-color-scheme` media query, with a manual toggle available in the interface.

## Use cases

### Use case 1: cost-effectiveness analysis with PSA and VOI

A health economist evaluating a new intervention opens the platform, selects the Markov cohort template, and defines health states (e.g., healthy, diseased, dead) with associated costs and utility weights. Transition probabilities are entered as expressions referencing treatment effect parameters. After running the base-case analysis, the economist configures PSA distributions for uncertain parameters and executes 10,000 iterations. The resulting cost-effectiveness plane and CEAC identify the optimal strategy at the jurisdiction's willingness-to-pay threshold. EVPI quantifies the expected value of eliminating all parameter uncertainty, guiding decisions about further research investment. The complete analysis is exported as a `.hta.zip` artifact for committee review.

### Use case 2: network meta-analysis for HTA submission

A systematic review team has extracted pairwise treatment comparisons from randomised controlled trials. The team enters effect estimates into the NMA module, which constructs the evidence network, runs both Bayesian and frequentist analyses, and produces SUCRA rankings and league tables. Node-split consistency tests identify potential incoherence. Publication bias is assessed using Egger's test, Copas selection model, and a contour-enhanced funnel plot. The pooled treatment effects are then imported directly into the Markov model as transition probability modifiers, maintaining a single auditable workflow from evidence synthesis to economic evaluation.

### Use case 3: teaching and training

An instructor teaching HTA methods at a medical school uses the platform's beginner mode and pre-built templates to demonstrate Markov modelling concepts. Students modify parameters, observe changes in cost-effectiveness outputs in real time, and examine how PSA distributions propagate uncertainty through the model. Because the platform runs in any browser without installation, students can complete exercises on personal devices without software procurement.

## Discussion

HTA Artifact Standard addresses a practical gap in the HTA tooling landscape by consolidating economic modelling and evidence synthesis into a single browser-based environment. The deterministic execution contract, enforced through seeded PRNG and Kahan summation, provides a level of reproducibility assurance that is not standard in existing tools. The MIT licence and zero-installation requirement lower barriers to adoption in both research and educational settings.

The platform integrates evidence synthesis capabilities that are not typically available in commercial decision-modelling software. TreeAge Pro, the dominant commercial platform, does not implement meta-analytic, publication bias, or quality assessment methods, and lacks budget impact analysis, MCDA, competing risks, cure models, or EVSI engines. While R provides excellent statistical implementations through packages such as metafor [3], meta, and netmeta, it requires programming proficiency and does not offer an integrated economic modelling interface. HTA Artifact Standard occupies a middle ground: it provides a guided interface for users who are not programmers, while integrating 49 engines — including pairwise and network meta-analysis, publication bias assessment, Mendelian randomisation, budget impact analysis, MCDA, competing risks, cure models, semi-Markov, correlated PSA, threshold analysis, model averaging, EVSI, multi-state models, joint models, 22-country profiles with jurisdiction-specific WTP thresholds, Cox PH/AFT regression, Guyot IPD synthesis, expected loss analysis, 5-agency regulatory submission templates, GRADE automation, and living HTA monitoring — alongside economic modelling in a single environment.

The validation strategy combines approximately 4,000 automated tests across 91 suites — spanning unit, integration, property-based, and stress/fuzz tiers — with external R comparator checks. This multi-tier approach gives high confidence in the core Markov engine, which achieves agreement with R to within 10^-5^ absolute error, and in the meta-analytic modules, which are validated against metafor for pairwise estimators, publication bias, trim-and-fill, and three-level models. All 49 engines have dedicated test suites. Property-based tests (fast-check) verify numerical invariants across randomised inputs, and 50 integration tests exercise end-to-end multi-engine workflows. Some specialised modules (Mendelian randomisation, power priors) rely more heavily on integration testing through benchmark comparisons than on exhaustive unit-level edge-case coverage. Expanding the external validation coverage for these modules remains a priority.

Users should verify that model convergence is achieved before interpreting results; the application displays convergence diagnostics and warns when iterative estimators fail to converge within the specified tolerance.

### Limitations

The following limitations should be considered when interpreting results from this platform:

1. **Microsimulation scope.** Microsimulation is available but limited to discrete-time individual patient simulation; continuous-time and compartmental models are not supported.

2. **Bayesian NMA uses Gibbs sampler.** The Bayesian NMA implementation uses a Gibbs sampler rather than Hamiltonian Monte Carlo (HMC/NUTS). Gelman-Rubin R-hat convergence diagnostics are provided, but users should verify adequate chain mixing before interpreting results.

3. **Limited individual participant data support.** Guyot IPD synthesis reconstructs individual patient data from published Kaplan-Meier curves, but full IPD meta-analysis with one-stage and two-stage methods is not implemented. Most meta-analytic methods operate on summary-level data.

4. **Limited PSA distribution types.** Four distribution families are available (beta, gamma, lognormal, normal). Correlated parameter sampling is supported via Cholesky decomposition and Gaussian copulas (CorrelatedPSA engine). However, empirical or non-parametric distributions and Dirichlet distributions for multinomial parameters are not currently supported.

5. **EVPPI uses GAM metamodeling approximation.** The EVPPI module uses a GAM metamodeling approximation [11] rather than full nested Monte Carlo simulation. This is computationally efficient but may underestimate EVPPI for highly skewed or multimodal parameter distributions.

6. **Publication bias limited to five methods.** The platform implements Egger's regression test, Begg's rank correlation, Copas selection model, PET-PEESE, and trim-and-fill (with L0, R0, and Q estimators). Full posterior-sampling RoBMA is not available; a BIC-based approximation is provided (see Limitation 10).

7. **Dose-response meta-analysis limited.** Dose-response modelling supports the Emax model (Gauss-Newton nonlinear least squares), linear dose-response, and restricted cubic splines. Fractional polynomial and sigmoid Emax models are not implemented.

8. **Test coverage.** The ~4,000-test automated suite across 91 suites covers all 49 engines, including unit, integration, property-based, and stress tests. However, some specialised methods (e.g., Mendelian randomisation, power priors) still rely more heavily on integration testing through benchmark comparisons than on exhaustive unit-level edge-case coverage.

9. **Cox frailty in survival IPD-MA.** The partitioned survival and IPD meta-analysis module uses EM-estimated frailty variance for Cox frailty models. This approximation may underestimate between-study heterogeneity compared to full penalised partial likelihood estimation; a corrected implementation using direct penalised likelihood is under development.

10. **RoBMA approximation.** The robust Bayesian meta-analysis (RoBMA) implementation uses BIC-based model averaging rather than full Vevea-Hedges selection likelihood models with posterior sampling. This provides a computationally tractable approximation but does not fully capture the selection function uncertainty that the original RoBMA framework models.

11. **No formal usability evaluation.** The platform has not undergone formal usability testing with a diverse sample of HTA practitioners. Interface design decisions are based on the development team's domain experience rather than empirical user research.

12. **CDN dependency for visualisations.** Chart.js and D3.js are loaded from CDN on first access. While the Service Worker caches these for subsequent offline use, the initial load requires an internet connection.

### Future development

Future development will target WebR integration for in-browser cross-validation, additional PSA distribution types (Dirichlet, empirical), IPD meta-analysis support, and Hamiltonian Monte Carlo (NUTS) as an alternative Bayesian NMA sampler. A formal usability study with HTA practitioners across clinical and academic settings is planned.

## Software availability

- **Source code:** https://github.com/mahmood726-cyber/hta-artifact-standard
- **Archived source code at time of publication:** [ZENODO_DOI_PLACEHOLDER]
- **Live demo:** https://mahmood726-cyber.github.io/hta-artifact-standard/
- **Licence:** MIT

An `renv.lock` file will be generated and included in the Zenodo deposit to pin R package versions (R 4.5.2, metafor 4.8-0) used in external validation.

- **Software version:** 1.1

## Data availability

No new clinical or participant-level data were generated for this article. Demonstration datasets and reference model fixtures are included in the source repository under `reference-models/`. R comparator scripts and outputs are available under `external-comparators/r/`.

## Competing interests

No competing interests were disclosed.

## Author contributions

| Author | CRediT roles |
|---|---|
| Mahmood Ahmad | Conceptualization, Methodology, Software, Validation, Writing - original draft, Writing - review & editing |
| Niraj Kumar | Conceptualization, Writing - review & editing |
| Bilaal Dar | Conceptualization, Writing - review & editing |
| Laiba Khan | Conceptualization, Writing - review & editing |
| Andrew Woo | Conceptualization, Writing - review & editing |

## Grant information

The authors declared that no grants were involved in supporting this work.

## Acknowledgements

The authors acknowledge the developers of the open-source libraries and statistical methods upon which this platform is built, including the metafor, meta, and netmeta R package teams, and the Chart.js and D3.js projects.

## References

1. Briggs A, Claxton K, Sculpher M. Decision Modelling for Health Economic Evaluation. Oxford: Oxford University Press; 2006.
2. Drummond MF, Sculpher MJ, Claxton K, et al. Methods for the Economic Evaluation of Health Care Programmes. 4th ed. Oxford: Oxford University Press; 2015.
3. Viechtbauer W. Conducting meta-analyses in R with the metafor package. J Stat Softw. 2010;36(3):1-48. https://doi.org/10.18637/jss.v036.i03
4. Dias S, Welton NJ, Caldwell DM, Ades AE. Checking consistency in mixed treatment comparison meta-analysis. Stat Med. 2010;29(7-8):932-944. https://doi.org/10.1002/sim.3767
5. DerSimonian R, Laird N. Meta-analysis in clinical trials. Control Clin Trials. 1986;7(3):177-188. https://doi.org/10.1016/0197-2456(86)90046-2
6. Higgins JPT, Thompson SG. Quantifying heterogeneity in a meta-analysis. Stat Med. 2002;21(11):1539-1558. https://doi.org/10.1002/sim.1186
7. Hartung J, Knapp G. A refined method for the meta-analysis of controlled clinical trials with binary outcome. Stat Med. 2001;20(24):3875-3889. https://doi.org/10.1002/sim.1009
8. Egger M, Davey Smith G, Schneider M, Minder C. Bias in meta-analysis detected by a simple, graphical test. BMJ. 1997;315(7109):629-634. https://doi.org/10.1136/bmj.315.7109.629
9. Copas JB, Shi JQ. A sensitivity analysis for publication bias in systematic reviews. Biostatistics. 2001;2(4):463-477. https://doi.org/10.1093/biostatistics/2.4.463
10. Claxton K. The irrelevance of inference: a decision-making approach to the stochastic evaluation of health care technologies. J Health Econ. 1999;18(3):341-364. https://doi.org/10.1016/S0167-6296(98)00039-3
11. Strong M, Oakley JE, Brennan A. Estimating multiparameter partial expected value of perfect information from a probabilistic sensitivity analysis sample. Med Decis Making. 2014;34(3):311-326. https://doi.org/10.1177/0272989X13505910
12. Salanti G, Ades AE, Ioannidis JPA. Graphical methods and numerical summaries for presenting results from multiple-treatment meta-analysis: an overview and tutorial. J Clin Epidemiol. 2011;64(2):163-171. https://doi.org/10.1016/j.jclinepi.2010.03.016
13. Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ. 2021;372:n71. https://doi.org/10.1136/bmj.n71
14. Husereau D, Drummond M, Augustovski F, et al. Consolidated Health Economic Evaluation Reporting Standards 2022 (CHEERS 2022) statement: updated reporting guidance for health economic evaluations. BMJ. 2022;376:e067975. https://doi.org/10.1136/bmj-2021-067975
15. National Institute for Health and Care Excellence. Guide to the Methods of Technology Appraisal 2013. London: NICE; 2013.
16. O'Neill ME. PCG: a family of simple fast space-efficient statistically good algorithms for random number generation. Technical Report HMC-CS-2014-0905. Claremont, CA: Harvey Mudd College; 2014.
17. Kahan W. Pracniques: further remarks on reducing truncation errors. Commun ACM. 1965;8(1):40. https://doi.org/10.1145/363707.363723
18. Basu A, Meltzer D. Value of information on preference heterogeneity and individualized care. Med Decis Making. 2007;27(2):112-127. https://doi.org/10.1177/0272989X06297393
