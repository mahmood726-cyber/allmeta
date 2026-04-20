# NMA Dose-Response Studio

## Installation
Use the dependency files in this directory (for example `requirements.txt`, `environment.yml`, `DESCRIPTION`, or equivalent project-specific files) to create a clean local environment before running analyses.
Document any package-version mismatch encountered during first run.

**Version 2.0.1** | Browser-based Network Meta-Analysis with Dose-Response Modeling

[![Tests](https://img.shields.io/badge/tests-79%2F79%20passing-brightgreen)](./comprehensive_test_results_v2.json)
[![Validated](https://img.shields.io/badge/validated-R%20metafor-blue)](./bench/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

## Overview

NMA Dose-Response Studio is a comprehensive, browser-based statistical analysis tool for conducting network meta-analyses with dose-response modeling. It provides validated statistical methods that match or exceed R packages like `metafor`, `netmeta`, and `dosresmeta`.

## Features

### Core Meta-Analysis
- **Heterogeneity Estimation**: DerSimonian-Laird, REML (default), Paule-Mandel, Sidik-Jonkman, Empirical Bayes
- **Confidence Intervals**: Wald, Hartung-Knapp-Sidik-Jonkman (recommended for small k)
- **Prediction Intervals**: 6 different methods
- **Bootstrap**: Up to 10,000 iterations with reproducible seeds

### Network Meta-Analysis
- **Ranking**: SUCRA, P-scores, P(best)
- **Inconsistency**: Node-splitting, design-by-treatment interaction
- **Transitivity**: Covariate balance assessment
- **Visualization**: Network graphs, rankograms

### Dose-Response Modeling
- **Models**: Linear, Emax, Sigmoid Emax (Hill), Log-linear, Restricted cubic splines, Fractional polynomials
- **Bayesian**: Gaussian Process (non-parametric)
- **Optimal Dose**: MED finding, risk-adjusted optimization

### Publication Bias (8+ methods)
- Egger's regression test
- Begg-Mazumdar rank correlation
- Peters', Harbord's, Macaskill's tests
- Trim-and-fill (L0/R0/Q0 estimators)
- PET-PEESE
- Selection models (Vevea-Hedges, Copas, 3PSM)
- P-curve, Z-curve
- Fail-safe N (Rosenthal, Orwin, Rosenberg)

### Diagnostic Accuracy Meta-Analysis
- **Bivariate Model**: Joint pooling of sensitivity/specificity (Reitsma et al. 2005)
- **HSROC Model**: Hierarchical summary ROC
- **SROC Curve**: Summary ROC with AUC calculation
- **Diagnostic Odds Ratio**: DOR pooling with heterogeneity
- **Likelihood Ratios**: LR+/LR- pooling
- **Threshold Effect**: Assessment of heterogeneity from threshold variation

### IPD Meta-Analysis
- **One-Stage Model**: Mixed-effects with patient-level data (Debray et al. 2015)
- **Two-Stage Model**: Study-level aggregation approach
- **IPD Dose-Response**: Non-linear mixed-effects with individual covariates
- **Subgroup Analysis**: Patient-level subgroup effects
- **Treatment Interactions**: Covariate-treatment interaction modeling
- **Pseudo-IPD**: Aggregate data to pseudo-IPD conversion

### Time-to-Event Meta-Analysis
- **Hazard Ratio Pooling**: Random-effects HR meta-analysis
- **RMST Pooling**: Restricted mean survival time analysis
- **Survival NMA**: Network meta-analysis for survival outcomes (Woods et al. 2010)
- **Time-Varying HR**: Fractional polynomial models
- **KM Reconstruction**: Digitize and reconstruct Kaplan-Meier curves

### Advanced Features
- **Bayesian Model Averaging**: MCMC with posterior distributions
- **Living Review Simulation**: Predict evidence stability
- **Component NMA**: Decompose complex interventions
- **Data Quality Tests**: GRIME, SPRITE, RIVETS, Benford's law
- **Interactive Tutorial**: 8-step guided walkthrough
- **Keyboard Shortcuts**: Full accessibility support (press ? for help)

## Quick Start

### Option 1: Open in Browser
Simply open `index.html` in a modern web browser (Chrome, Firefox, Edge, Safari).

### Option 2: Use the Wizard
1. Click the **"🚀 Quick Start"** button
2. Follow the 4-step guided setup
3. Load sample data or upload your CSV
4. View results in the Results Panel

### CSV Format
Your data should have these columns:
```csv
study,treatment,dose,effect,se
Study1,DrugA,10,0.5,0.1
Study1,Placebo,0,0,0.1
Study2,DrugA,20,0.8,0.12
...
```

**Required columns:**
- `study`: Study identifier
- `treatment`: Treatment name
- `dose`: Dose level (numeric)
- `effect`: Effect size (mean difference, log-OR, etc.)
- `se`: Standard error

**Optional columns:**
- `covariate`: Moderator variable for meta-regression

## Recommended Settings

For publication-quality analyses, we recommend:

| Setting | Recommendation | Rationale |
|---------|---------------|-----------|
| τ² Estimator | REML | Gold standard (Veroniki et al. 2016) |
| Confidence Intervals | Hartung-Knapp | Better coverage for small k (IntHout et al. 2014) |
| Bootstrap Seed | Set explicitly | Reproducibility for publication |
| I² CI | Q-profile method | Standard practice (Higgins & Thompson 2002) |

## Validation

All core statistical functions have been validated against R packages:

| Function | R Package | Max Deviation |
|----------|-----------|---------------|
| DL estimator | metafor | < 0.001 |
| REML | metafor | < 0.001 |
| Egger's test | metafor | < 0.001 |
| Trim-and-fill | metafor | < 0.001 |
| I² | metafor | < 0.001 |

See `bench/` directory for detailed validation results.

## Method References

### Heterogeneity
- DerSimonian R, Laird N. (1986). Control Clin Trials. 7(3):177-188.
- Veroniki AA, et al. (2016). Res Synth Methods. 7(1):55-79.

### Confidence Intervals
- Hartung J, Knapp G. (2001). Stat Med. 20(24):3875-3889.
- IntHout J, et al. (2014). BMC Med Res Methodol. 14:25.

### Publication Bias
- Egger M, et al. (1997). BMJ. 315(7109):629-634.
- Duval S, Tweedie R. (2000). Biometrics. 56(2):455-463.
- Stanley TD, Doucouliagos H. (2014). Res Synth Methods. 5(1):60-78.

### Network Meta-Analysis
- Lu G, Ades AE. (2004). Stat Med. 23(20):3105-3124.
- Salanti G, et al. (2014). Ann Intern Med. 160(3):191-198.

### Dose-Response
- Crippa A, Orsini N. (2016). BMC Med Res Methodol. 16:91.

## Citation

If you use NMA Dose-Response Studio in your research, please cite:

```bibtex
@software{nma_dose_response_studio,
  title = {NMA Dose-Response Studio},
  version = {2.0.1},
  year = {2025},
  url = {https://github.com/nma-dose-response-studio},
  note = {Browser-based network meta-analysis with dose-response modeling}
}
```

**Plain text:**
> NMA Dose-Response Studio (Version 2.0.0) [Computer software]. Available from https://github.com/nma-dose-response-studio

## Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | ✅ Full support |
| Firefox | 88+ | ✅ Full support |
| Edge | 90+ | ✅ Full support |
| Safari | 14+ | ✅ Full support |

## Development

### Project Structure
```
nma-dose-response-app/
├── index.html          # Main application (production)
├── app.js              # Consolidated JavaScript (25K lines)
├── app.min.js          # Minified version (302 KB)
├── src/                # Modular source code
│   ├── core/           # Statistical distributions
│   ├── meta-analysis/  # Robust methods
│   ├── network-meta-analysis/
│   ├── dose-response/
│   ├── publication-bias/
│   └── utils/
├── bench/              # R validation benchmarks
└── js/utils/           # Export utilities
```

### Running Tests
```bash
npm install
npm test
```

### Building
```bash
npm run build
```

## License

MIT License - see LICENSE file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/nma-dose-response-studio/issues)
- **Documentation**: This README and inline help tooltips
- **Validation**: See `bench/` directory for R comparisons

---

**Built with care for the meta-analysis community.**
