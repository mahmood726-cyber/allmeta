# HTA Artifact Standard

> Open-source Health Technology Assessment platform with 41 simulation and analysis engines, deterministic reproducibility, and comprehensive test coverage.

## Features

### 41 Engines Across 6 Categories

**Core Economic Modeling**
- Markov Cohort Simulation -- state-transition with Kahan summation, half-cycle correction
- Decision Tree Analysis -- rollback with expression evaluation
- Partitioned Survival Analysis -- area-under-curve for oncology
- Discrete Event Simulation -- priority-queue event processing
- Microsimulation -- individual patient-level stochastic modeling
- Budget Impact Analysis -- ISPOR-compliant, undiscounted primary output
- Probabilistic BIA -- Monte Carlo parameter uncertainty

**Meta-Analysis & Evidence Synthesis**
- Pairwise Meta-Analysis -- DL, REML, PM, EB with HKSJ adjustment
- Network Meta-Analysis -- Bayesian MCMC + frequentist with SUCRA
- Three-Level Meta-Analysis -- multi-level random effects
- IPD Meta-Analysis -- one-stage and two-stage
- DTA Meta-Analysis -- bivariate GLMM, HSROC
- Publication Bias -- Egger, Begg, Copas, PET-PEESE, trim-and-fill, RoBMA
- Mendelian Randomization -- IVW, MR-Egger, weighted median, MR-PRESSO

**Survival & Clinical Modeling**
- Competing Risks -- CIF, Aalen-Johansen, Fine-Gray, Gray's test
- Cure Models -- mixture (EM), non-mixture, background mortality
- Semi-Markov -- sojourn-time distributions (Weibull, gamma, lognormal)
- Multi-State Models -- matrix exponential, arbitrary state graphs
- Joint Models -- longitudinal biomarker + survival
- Model Averaging -- BIC/AIC/DIC weights, survival distribution comparison

**Decision Analysis**
- MCDA -- weighted-sum, swing weighting, rank acceptability
- Network MCDA -- NMA + MCDA integration
- Threshold Analysis -- one-way, two-way, tornado diagrams
- Scenario Analysis -- structured comparisons, cross-scenario
- Headroom Analysis -- max price, affordability curves

**Sensitivity & Value of Information**
- PSA -- probabilistic sensitivity with correlated parameters (Cholesky, copulas)
- EVPPI -- expected value of partial perfect information
- EVSI -- expected value of sample information, optimal sample size
- Calibration -- likelihood-based parameter optimization

**Infrastructure**
- Expression Parser -- safe, non-Turing-complete formula evaluation
- Validation -- JSON Schema + semantic checks (NICE compliance)
- Reporting -- automated CHEERS/PRISMA report generation
- Export -- R, Python, CSV for all engines
- Web Workers -- off-main-thread computation pool
- Determinism -- PCG32 PRNG, Kahan summation, golden sequence verification

## Quick Start

```bash
git clone https://github.com/mahmood726-cyber/hta-artifact-standard.git
cd hta-artifact-standard
npm install
npm test          # Run 3,400+ tests
npm run serve     # Open in browser
```

## Test Coverage

| Category | Tests | Description |
|----------|-------|-------------|
| Unit (engine) | ~1,930 | Individual engine correctness |
| Unit (parser/validator/utils) | ~700 | Expression, schema, math, sanitization |
| UI | ~455 | 8 DOM controllers |
| Integration | 50 | E2E workflow pipelines |
| Property | 60 | fast-check invariants |
| Performance | 30 | Regression benchmarks |
| Stress | 82 | Extreme inputs, fuzz testing |
| Editorial | 87 | Revision-specific regression |
| **Total** | **3,400+** | **76% line coverage** |

## Architecture

- **Runtime**: Vanilla JavaScript (ES2022), no runtime dependencies
- **Testing**: Jest 29, fast-check, jsdom
- **CI**: GitHub Actions (Node 18/20)
- **Determinism**: PCG32 PRNG, Kahan summation, IEEE 754 strict

## Project Structure

```
hta-artifact-standard/
  src/
    engine/         # 41 simulation/analysis engines
    parser/         # Expression language parser
    validator/      # JSON Schema + semantic validation
    utils/          # Kahan summation, PCG32, sanitize, worker pool
    ui/             # DOM controllers
  tests/
    engine/         # Engine unit tests
    parser/         # Expression parser tests
    validator/      # Validation tests
    utils/          # Utility tests
    ui/             # UI controller tests
    integration/    # E2E workflow tests
    property/       # fast-check property-based tests
    performance/    # Benchmark regression tests
    stress/         # Robustness/fuzz tests
  schemas/          # JSON Schema definitions
  reference-models/ # Golden test fixtures (R-validated)
  paper/            # F1000Research manuscript
  docs/             # Quality gates documentation
```

## Reference Models

- `markov_simple/` -- 2-state disease progression (R-validated)
- `markov_age_dependent/` -- age-dependent transitions
- `psa_demo/` -- PSA with parameter distributions
- `bia_basic/` -- 3-year budget impact (Type 2 Diabetes)
- `partsa_imported/` -- Partitioned survival (NSCLC)

## Quality Gates

```bash
npm run quality:gate       # Full CI pipeline
npm run validate:reference # Golden fixture validation
npm run validate:determinism # Bit-identical rerun check
npm run bench:ci           # Performance regression benchmarks
npm run coverage:report    # Module-level coverage thresholds
```

See `docs/QUALITY_GATES.md` for details.

## Citation

See `CITATION.cff` and `paper/F1000_HTA_Artifact_Standard.md`.

## License

MIT
