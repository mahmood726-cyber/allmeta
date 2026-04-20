# HTA Artifact Standard v0.6: a browser-based platform for health technology assessment with integrated evidence synthesis

## Authors

Mahmood Ahmad ^1,2^, Niraj Kumar ^1^, Bilaal Dar ^3^, Laiba Khan ^1^, Andrew Woo ^4^

^1^ Royal Free London NHS Foundation Trust, London, UK
^2^ Tahir Heart Institute, Rabwah, Pakistan
^3^ King's College London GKT School of Medical Education, London, UK
^4^ St George's, University of London, London, UK

**Corresponding author:** Mahmood Ahmad (mahmood726@gmail.com)

## Abstract

Health technology assessment (HTA) requires the integration of economic modelling, evidence synthesis, and uncertainty analysis, yet these tasks are commonly fragmented across proprietary desktop software, statistical programming environments, and spreadsheet-based models. We present HTA Artifact Standard v0.6, an open-source, browser-based platform that unifies Markov cohort modelling, microsimulation, pairwise and network meta-analysis, probabilistic sensitivity analysis, and value-of-information computation within a single client-side application. The platform comprises 6,620 lines of HTML and 69,605 lines of JavaScript across 45 modules, requires no server-side computation, and operates offline after initial load via a Service Worker. Deterministic reproducibility is enforced through a PCG32 seeded pseudo-random number generator, Kahan summation for numerical stability, and IEEE 754 double-precision compliance. Validation against R reference packages (metafor v4.8-0, meta) yields 8 pairwise meta-analysis benchmark tests passed, and three independent Markov reference fixtures agree with R comparator outputs to within a maximum absolute error of 4.72 x 10^-5^. Bayesian NMA includes Gelman-Rubin R-hat convergence diagnostics. The software is freely available under the MIT licence.

**Keywords:** health technology assessment, cost-effectiveness analysis, Markov model, network meta-analysis, probabilistic sensitivity analysis, value of information, evidence synthesis, open-source software

## Introduction

Health technology assessment integrates clinical evidence, economic modelling, and uncertainty quantification to inform resource allocation decisions in healthcare systems [1,2]. Analysts conducting HTA routinely require capabilities spanning Markov state-transition modelling, meta-analytic pooling of treatment effects, probabilistic sensitivity analysis (PSA), and value-of-information (VOI) estimation. In practice, these tasks are distributed across several tools: TreeAge Pro for decision modelling [1], R packages such as metafor [3] and BCEA [10] for evidence synthesis and VOI, and bespoke Excel workbooks for specific agency submissions [15].

This fragmentation introduces several difficulties. First, transferring intermediate results between tools requires manual data handling that is prone to transcription error. Second, reproducibility is compromised when analyses depend on undocumented software configurations or proprietary file formats. Third, commercial licences (TreeAge Pro costs approximately USD 6,000 per year) restrict access for researchers in resource-limited settings and for students.

HTA Artifact Standard was developed to address these gaps by providing a unified, browser-based environment for the core HTA workflow: model specification, evidence synthesis, uncertainty analysis, and structured reporting. The platform runs entirely in the client browser, requires no installation, and enforces deterministic execution through explicit numerical contracts. This article describes the software architecture, analytical capabilities, validation strategy, and limitations of version 0.6.

## Methods

### Implementation

HTA Artifact Standard is implemented as a client-side web application. The main entry point (`index.html`, 6,620 lines) loads 45 JavaScript modules from the `src/` directory (69,605 lines in total), organised into four subsystems:

- **Engine** (`src/engine/`): Markov cohort simulation, microsimulation, decision trees, PSA, EVPI/EVPPI computation, network meta-analysis (Bayesian Gibbs MCMC with R-hat diagnostics and frequentist), pairwise meta-analysis (DL/REML/PM/EB with HKSJ adjustment), three-level meta-analysis, partitioned survival analysis, Mendelian randomisation, power priors for historical borrowing, publication bias methods (Egger, Begg, Copas, PET-PEESE), calibration, and automated report generation. The pairwise meta-analysis engine shares validated statistical components with related browser-based tools by the same development group, including effect size calculation, heterogeneity estimation, and confidence interval computation.
- **Validator** (`src/validator/`): JSON Schema validation (`project.schema.json`, `results.schema.json`), semantic rule checking (probability bounds, mass conservation, circular dependency detection, reference integrity).
- **Parser** (`src/parser/`): A safe, non-Turing-complete expression language supporting arithmetic, built-in functions (`exp`, `ln`, `sqrt`, `rate_to_prob`, `prob_to_rate`, `if`, `clamp`), and time/age-dependent parameter references.
- **UI** (`src/ui/`): Application controller, interactive network visualisation, beginner mode, and enhanced visualisation panels.

External dependencies are limited to Chart.js and D3.js for visualisation and JSZip for artifact packaging, all loaded from CDN. The application registers a Service Worker for offline operation after initial load.

### Deterministic execution contract

Reproducibility is a first-order design constraint. All stochastic operations use a PCG32 pseudo-random number generator [16] initialised from a user-specified or default seed, ensuring identical output sequences across runs. Floating-point accumulation uses Kahan compensated summation [17] to minimise rounding drift in long Markov traces. All arithmetic operates under IEEE 754 double-precision semantics. The quality gate (`npm run validate:determinism`) confirms byte-stable output hashes across repeated executions.

### Markov cohort modelling

The Markov engine supports discrete-time cohort simulation with configurable cycle length, time horizon, and discount rates for costs and QALYs. Transition probabilities may be constant, age-dependent, or time-dependent, specified through the expression language. Four half-cycle correction methods are available: none, start-of-cycle, end-of-cycle, and trapezoidal (default). Model specifications and results are packaged in the `.hta.zip` artifact format, which bundles a `manifest.json` (file checksums), `project.json` (model definition), and optional `results.json` and supporting evidence documents.

### Evidence synthesis

**Pairwise meta-analysis.** The platform implements random-effects (DerSimonian-Laird [5]) and fixed-effect models. Four heterogeneity variance estimators are available: DerSimonian-Laird, restricted maximum likelihood (REML), Paule-Mandel, and empirical Bayes. The Hartung-Knapp-Sidik-Jonkman (HKSJ) adjustment [7] is provided for confidence interval construction under random effects; note that full sandwich/CR2 robust variance estimation is not currently implemented. Heterogeneity is reported as tau-squared, I-squared with confidence intervals [6], H-squared, and prediction intervals. Sensitivity analyses include leave-one-out, cumulative meta-analysis, and influence diagnostics.

**Network meta-analysis.** Both Bayesian (Gibbs sampler MCMC with Gelman-Rubin R-hat diagnostics) and frequentist approaches [4] are implemented. Treatment rankings use SUCRA [12] and P-score methods. Consistency is assessed via node-split models. Additional outputs include league tables, network geometry statistics, comparison-adjusted funnel plots, network meta-regression, and component NMA.

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

Eight pairwise meta-analysis benchmarks against R metafor v4.8-0 and meta were conducted (DerSimonian-Laird and REML estimators, fixed-effect models, HKSJ adjustment, heterogeneity statistics). All eight tests passed within the specified tolerance. Four publication bias methods (Egger, Begg, Copas, PET-PEESE) were validated against R equivalents. Bayesian NMA includes Gelman-Rubin R-hat convergence diagnostics for assessing chain mixing.

Three Markov cohort reference fixtures (simple model, age-dependent transitions, and PSA demonstration) were validated against independently executed R scripts stored in `external-comparators/r/`. Agreement was assessed using absolute and relative error metrics. The maximum absolute error across all fixtures was 4.72 x 10^-5^ for cost outcomes and the maximum relative error was 1.14 x 10^-5^, both within the tolerance thresholds of 0.01 (costs) and 0.001 (relative).

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
| PSA (beta/gamma/normal/lognormal) | Yes | Yes | Yes | Partial | Yes |
| EVPI/EVPPI | Yes | Yes | Yes | No | Yes |
| Deterministic contract (PCG32) | Yes | No | No | No | No |
| Risk-of-bias assessment (RoB 2, ROBINS-I) | Yes | No | No | No | No |
| GRADE/CINeMA | Yes | No | No | No | Partial |
| Open source | Yes (MIT) | No | Yes (GPL) | Varies | Partial |
| Offline capable | Yes (PWA) | Yes | Yes | Yes | No |
| Annual licence cost | Free | USD 6,000+ | Free | Free | Free |

### Quality gates and test coverage

The project enforces a continuous-integration quality gate comprising linting, unit tests with module-level coverage thresholds, reference validation, determinism checks, and performance benchmarks. Jest unit tests cover the Markov engine (`src/engine/markov.js`), expression parser (`src/parser/expression.js`), and input sanitisation (`src/utils/sanitize.js`) at enforced coverage thresholds, with overall coverage at approximately 45% of all source modules. Core engine and parser modules achieve higher coverage (~57%).

## Use cases

### Use case 1: cost-effectiveness analysis with PSA and VOI

A health economist evaluating a new intervention opens the platform, selects the Markov cohort template, and defines health states (e.g., healthy, diseased, dead) with associated costs and utility weights. Transition probabilities are entered as expressions referencing treatment effect parameters. After running the base-case analysis, the economist configures PSA distributions for uncertain parameters and executes 10,000 iterations. The resulting cost-effectiveness plane and CEAC identify the optimal strategy at the jurisdiction's willingness-to-pay threshold. EVPI quantifies the expected value of eliminating all parameter uncertainty, guiding decisions about further research investment. The complete analysis is exported as a `.hta.zip` artifact for committee review.

### Use case 2: network meta-analysis for HTA submission

A systematic review team has extracted pairwise treatment comparisons from randomised controlled trials. The team enters effect estimates into the NMA module, which constructs the evidence network, runs both Bayesian and frequentist analyses, and produces SUCRA rankings and league tables. Node-split consistency tests identify potential incoherence. Publication bias is assessed using Egger's test, Copas selection model, and a contour-enhanced funnel plot. The pooled treatment effects are then imported directly into the Markov model as transition probability modifiers, maintaining a single auditable workflow from evidence synthesis to economic evaluation.

### Use case 3: teaching and training

An instructor teaching HTA methods at a medical school uses the platform's beginner mode and pre-built templates to demonstrate Markov modelling concepts. Students modify parameters, observe changes in cost-effectiveness outputs in real time, and examine how PSA distributions propagate uncertainty through the model. Because the platform runs in any browser without installation, students can complete exercises on personal devices without software procurement.

## Discussion

HTA Artifact Standard addresses a practical gap in the HTA tooling landscape by consolidating economic modelling and evidence synthesis into a single browser-based environment. The deterministic execution contract, enforced through seeded PRNG and Kahan summation, provides a level of reproducibility assurance that is not standard in existing tools. The MIT licence and zero-installation requirement lower barriers to adoption in both research and educational settings.

The platform integrates evidence synthesis capabilities that are not typically available in commercial decision-modelling software. TreeAge Pro, the dominant commercial platform, does not implement meta-analytic, publication bias, or quality assessment methods. While R provides excellent statistical implementations through packages such as metafor [3], meta, and netmeta, it requires programming proficiency and does not offer an integrated economic modelling interface. HTA Artifact Standard occupies a middle ground: it provides a guided interface for users who are not programmers, while integrating pairwise and network meta-analysis, publication bias assessment, and Mendelian randomisation alongside economic modelling in a single environment.

The validation strategy combines internal reference fixtures with external R comparator checks. This dual approach gives reasonable confidence in the core Markov engine, which achieves agreement with R to within 10^-5^ absolute error. However, the meta-analytic and specialised modules have not all been subjected to the same rigour of external benchmarking. Expanding the validation coverage is a priority for future versions.

Users should verify that model convergence is achieved before interpreting results; the application displays convergence diagnostics and warns when iterative estimators fail to converge within the specified tolerance.

### Limitations

The following limitations should be considered when interpreting results from this platform:

1. **Microsimulation scope.** Microsimulation is available but limited to discrete-time individual patient simulation; continuous-time and compartmental models are not supported.

2. **Bayesian NMA uses Gibbs sampler.** The Bayesian NMA implementation uses a Gibbs sampler rather than Hamiltonian Monte Carlo (HMC/NUTS). Gelman-Rubin R-hat convergence diagnostics are provided, but users should verify adequate chain mixing before interpreting results.

3. **No individual participant data support.** IPD meta-analysis is not implemented. All meta-analytic methods operate on summary-level data.

4. **Limited PSA distribution types.** Four distribution families are available (beta, gamma, lognormal, normal). Empirical or non-parametric distributions, Dirichlet distributions for multinomial parameters, and correlated sampling are not currently supported.

5. **EVPPI uses GAM metamodeling approximation.** The EVPPI module uses a GAM metamodeling approximation [11] rather than full nested Monte Carlo simulation. This is computationally efficient but may underestimate EVPPI for highly skewed or multimodal parameter distributions.

6. **Publication bias limited to five methods.** The platform implements Egger's regression test, Begg's rank correlation, Copas selection model, PET-PEESE, and trim-and-fill (with L0, R0, and Q estimators). Other methods (e.g., RoBMA with full posterior sampling) are not available.

7. **Dose-response meta-analysis limited.** Dose-response modelling supports the Emax model (Gauss-Newton nonlinear least squares), linear dose-response, and restricted cubic splines. Fractional polynomial and sigmoid Emax models are not implemented.

8. **Test coverage.** Unit test coverage is approximately 45% across all modules, with enforced thresholds applied only to the Markov engine, expression parser, and sanitisation modules. The meta-analytic and specialised modules rely primarily on integration testing through benchmark comparisons rather than comprehensive unit tests.

9. **No formal usability evaluation.** The platform has not undergone formal usability testing with a diverse sample of HTA practitioners. Interface design decisions are based on the development team's domain experience rather than empirical user research.

10. **CDN dependency for visualisations.** Chart.js and D3.js are loaded from CDN on first access. While the Service Worker caches these for subsequent offline use, the initial load requires an internet connection.

### Future development

Version 0.7 will target expanded external validation fixtures, WebR integration for in-browser cross-validation, additional PSA distribution types (Dirichlet, empirical), and IPD meta-analysis support. A formal usability study with HTA practitioners across clinical and academic settings is planned.

## Software availability

- **Source code:** https://github.com/mahmood726-cyber/hta-artifact-standard
- **Archived source code at time of publication:** [ZENODO_DOI_PLACEHOLDER]
- **Live demo:** https://mahmood726-cyber.github.io/hta-artifact-standard/
- **Licence:** MIT

An `renv.lock` file is included to pin R package versions (R 4.5.2, metafor 4.8-0) used in external validation.

- **Software version:** 0.6

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
11. Ades AE, Lu G, Claxton K. Expected value of sample information calculations in medical decision modeling. Med Decis Making. 2004;24(2):207-227. https://doi.org/10.1177/0272989X04263162
12. Salanti G, Ades AE, Ioannidis JPA. Graphical methods and numerical summaries for presenting results from multiple-treatment meta-analysis: an overview and tutorial. J Clin Epidemiol. 2011;64(2):163-171. https://doi.org/10.1016/j.jclinepi.2010.03.016
13. Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ. 2021;372:n71. https://doi.org/10.1136/bmj.2020.372.n71
14. Husereau D, Drummond M, Augustovski F, et al. Consolidated Health Economic Evaluation Reporting Standards 2022 (CHEERS 2022) statement: updated reporting guidance for health economic evaluations. BMJ. 2022;376:e067975. https://doi.org/10.1136/bmj-2021-067975
15. National Institute for Health and Care Excellence. Guide to the Methods of Technology Appraisal 2013. London: NICE; 2013.
16. O'Neill ME. PCG: a family of simple fast space-efficient statistically good algorithms for random number generation. Technical Report HMC-CS-2014-0905. Claremont, CA: Harvey Mudd College; 2014.
17. Kahan W. Pracniques: further remarks on reducing truncation errors. Commun ACM. 1965;8(1):40. https://doi.org/10.1145/363707.363723
