# Changelog

## v1.1.0 (2026-03-17) — World-Class HTA Platform
### New Engines (8)
- **Country Profiles**: 22 countries with WTP, discount rates, severity adjustment, currency conversion
- **Cox PH / AFT Regression**: Newton-Raphson partial likelihood, Breslow/Efron ties, Schoenfeld PH test
- **Guyot IPD Synthesis**: Reconstruct individual patient data from published KM curves
- **Expected Loss**: Basu & Meltzer (2015) framework, population scaling, opportunity cost
- **Regulatory Templates**: NICE STA, CADTH, EUnetHTA JCA, PBAC, G-BA AMNOG generators
- **GRADE Automation**: Auto-rate 5 domains, CINeMA for NMA, OIS, SoF tables
- **Living HTA Monitor**: Sequential analysis with O'Brien-Fleming/Pocock boundaries
- **Cox Regression**: Standalone survival regression with concordance index

### Quality
- 3,900+ tests, 89 suites, 49 engines
- PCG32 golden sequence fixed
- 312 branch-coverage tests added
- Integration tests for world-class engines

## v1.0.0 (2026-03-17) — Production Release
### Highlights
- 41 engines, 2100+ tests, 56 suites
- Full HTA methodology coverage: BIA, MCDA, competing risks, cure models, semi-Markov, correlated PSA, threshold analysis, model averaging, EVSI, multi-state models, joint models, headroom analysis
- Integration test suite (50 E2E tests), property-based tests (fast-check), stress/fuzz tests, performance benchmarks
- Web Worker orchestration for off-main-thread computation
- R/Python/CSV export for all engines
- GitHub Actions CI (Node 18/20)
- All review findings fixed (12 P0, 18 P1, 12 P2)
- Reference models populated (BIA, PartSA)

## v0.8.0 (2026-03-16) — Comprehensive Improvement
### New Engines
- **Budget Impact Analysis** — population projection, market uptake, subpopulations, scenario comparison
- **MCDA** — weighted-sum, swing weighting, rank acceptability, dominance detection, weight sensitivity
- **Competing Risks** — cumulative incidence functions, Aalen-Johansen, Fine-Gray, Gray's test
- **Cure Models** — mixture cure (EM algorithm), non-mixture cure, distribution comparison
- **Semi-Markov** — sojourn-time dependent transitions (Weibull, gamma, lognormal), tunnel states
- **Correlated PSA** — Cholesky decomposition, Gaussian copulas, multivariate sampling
- **Threshold Analysis** — one-way/two-way thresholds, tornado diagrams, bisection break-even
- **Scenario Analysis** — structured base/pessimistic/optimistic, auto-generation from CIs, cross-scenario
- **Model Averaging** — BIC/AIC/DIC weights, model-averaged predictions, survival distribution comparison
- **EVSI** — moment matching, optimal sample size, population-adjusted value of information

### Tests for Previously Untested Modules
- `kahan.js` — catastrophic cancellation, large-n accumulation, NeumaierSum
- `pcg32.js` — determinism, golden sequence, all 10 distributions, state save/restore
- `mathUtils.js` — StatUtils mean, sd, percentile
- `lifetable.js` — ONS mortality by age/sex, edge cases
- `audit.js` — event logging, timestamps, filtering, export
- `interoperability.js` — TreeAge XML import, R export, Excel I/O
- `expression.js` — expanded from 23 to 300+ lines (arithmetic, functions, HTA, security)
- `validator/schema.js` — JSON Schema validation for project.json
- `validator/semantic.js` — reference integrity, probability bounds, mass conservation
- `validator/validator.js` — full validation pipeline, report generation
- `editorialRevisions.js` — expanded HKSJ, prediction intervals, editorial fixes

### Fixes
- Fixed HTML/JS class name mismatches (MetaAnalysis → MetaAnalysisMethods, MarkovCohortEngine → MarkovEngine)
- Added window exports for AdvancedMetaAnalysis, ThreeLevelMetaAnalysis alias
- Expanded ESLint from 3 rules to 15 (no-unused-vars, eqeqeq, prefer-const, no-var, etc.)

## v0.7.0 (2026-03-15) — Quality Overhaul
- 948 tests across 28 suites, all 26 engines tested
- Fixed oneStage IPD-MA infinite loop (O(n^3) → 4ms block-diagonal WLS)
- Implemented 18 real statistical methods (replaced Math.random stubs)
- Converted 35 ML stubs to deterministic hash-based implementations
- Zero hardcoded z=1.96, zero Math.random(), zero XSS vulnerabilities
- Full WCAG AA dark mode, keyboard accessibility, ARIA

## v0.6.0 (2026-03-13) — Initial Release
- 26 engines: Markov, PSA, NMA, DES, microsimulation, survival, and more
- PCG32 deterministic PRNG, Kahan summation, expression parser
- JSON Schema validation, TreeAge import, R/Excel export
- F1000 manuscript, R cross-validation, reference models

## 2026-03-05
- Revised F1000 manuscript structure to address real peer-review critiques
- Added explicit reproducibility, walkthrough, and limitations language
- Added or updated submission checklist aligned with real reviews
