# Dose Response Pro v18.1 - Ultimate Edition

**A comprehensive browser-based dose-response meta-analysis tool that implements the Greenland & Longnecker two-stage method.**

## Release Status (2026-02-28)

- Release decision: approved.
- GUI/usability validation: 161/161 passed (100%).
- Deterministic R parity: 3/3 passed.
- Strict benchmark vs R: `beats_r = true` on 120/120 comparable datasets.
- Multipersona panel: 11 YES, 1 CONDITIONAL, 0 NO.

Release and publication package:
- [Release Notes](docs/RELEASE_NOTES_2026-02-28.md)
- [RSM Manuscript Draft](docs/RSM_MANUSCRIPT_DRAFT_2026-02-28.md)
- [Reproducibility Appendix](docs/REPRODUCIBILITY_APPENDIX_2026-02-28.md)
- [RSM Submission Checklist](docs/RSM_SUBMISSION_CHECKLIST_2026-02-28.md)
- [Cross-Package Multipersona Review](docs/CROSS_PACKAGE_MULTIPERSONA_REVIEW_2026-02-28.md)
- [Strict Benchmark Report](docs/STRICT_BEAT_R_BENCHMARK_2026-02-28.md)
- [Machine Readiness Summary](tests/release_validation_2026-02-28/release_readiness_summary.json)

---

## Quick Start (5 Minutes)

1. **Open the application**: Double-click `dose-response-pro.html`
2. **Load sample data**: Click "Load Demo Data" button
3. **Run analysis**: Click "Run Analysis"
4. **Explore results**: Check Results, Plots, and Sensitivity tabs

**New to dose-response meta-analysis?** Read the [Getting Started Guide](docs/Getting_Started_Guide.md)

---

## Features

### Statistical Methods
| Feature | Description | Status |
|---------|-------------|--------|
| **GLS Method** | Greenland & Longnecker two-stage method | ✅ |
| **Linear Model** | Simple linear trend | ✅ |
| **Quadratic Model** | Non-linear with curvature | ✅ |
| **Cubic Model** | Complex non-linearity | ✅ |
| **Spline Model** | Flexible restricted cubic splines | ✅ |
| **Exponential Model** | Saturation effects | ✅ |
| **Bayesian MCMC** | Multi-chain with R-hat & ESS diagnostics | ✅ |
| **Bootstrap CI** | Resampling-based confidence intervals | ✅ |
| **Sensitivity Analysis** | Leave-one-out with Cook's D & DFITS | ✅ |
| **Subgroup Analysis** | Explore heterogeneity | ✅ |

### Validation
- ✅ Matches R packages (dosresmeta, metafor) within 1e-4 tolerance
- ✅ 28 unit tests included
- ✅ R validation script provided

### User Features
- **Interactive Visualizations**: Dose-response curves, forest plots, influence plots
- **CSV Import**: Smart parsing with flexible column detection
- **R Code Export**: Validated R code for reproducibility
- **CLI Tool**: Batch processing via `dose-response-cli.py`
- **Web Worker**: Non-blocking UI for large datasets

---

## Directory Structure

```
dosehtml/
├── dose-response-pro.html              # Main application ⭐ USE THIS
├── dose-response-cli.py                # Command-line tool (NEW)
├── dose-response-worker.js             # Web Worker for background processing
│
├── docs/                               # Documentation
│   ├── Getting_Started_Guide.md        # 👈 Start here!
│   ├── Computational_Complexity.md     # Performance analysis
│   ├── Version_Comparison.md           # v1.0 vs v18.1 comparison
│   ├── Complete_Documentation.md       # Full API reference
│   ├── GLS_Method_Documentation.md     # Methodology details
│   ├── Validation_Results_v18.1_Corrected.md
│   └── ... (more docs)
│
├── sample_data/                        # Teaching datasets (NEW)
│   ├── linear_trend_teaching.csv       # Perfect linear trend
│   ├── u_shaped_curve_teaching.csv     # Non-linear U-shape
│   ├── high_heterogeneity_teaching.csv # High I² example
│   ├── saturation_effect_teaching.csv  # Exponential plateau
│   └── edge_case_zero_cases.csv        # Handling zero events
│
├── tests/
│   ├── unit_tests.html                 # 28 JavaScript tests
│   └── validate_dose_response_pro.R    # R validation
│
└── archive/                            # Older versions (v2-v17)
```

---

## Documentation Guide

| For... | Read This |
|--------|-----------|
| **First-time users** | [Getting Started Guide](docs/Getting_Started_Guide.md) |
| **Methodology** | [GLS Method Documentation](docs/GLS_Method_Documentation.md) |
| **Performance** | [Computational Complexity](docs/Computational_Complexity.md) |
| **API Reference** | [Complete Documentation](docs/Complete_Documentation.md) |
| **Validation** | [Validation Results](docs/Validation_Results_v18.1_Corrected.md) |
| **Version History** | [Version Comparison](docs/Version_Comparison.md) |

---

## Usage Examples

### Interactive (Browser)
```bash
# Double-click to open
dose-response-pro.html

# Or serve locally
python -m http.server 8000
# Then visit: http://localhost:8000/dose-response-pro.html
```

### Command-Line (Python)
```bash
# Basic analysis
python dose-response-cli.py --input data.csv --output results.json

# Fixed-effect analysis
python dose-response-cli.py --input data.csv --output results.json --tau2 0

# Batch processing
python dose-response-cli.py --batch batch.csv --output-dir results/

# Pretty print
python dose-response-cli.py --input data.csv --output - --pretty
```

### R Validation
```r
# In R console
source("tests/validate_dose_response_pro.R")
```

### Release Snapshot (New)
```powershell
pwsh -File .\scripts\freeze_release_snapshot.ps1 -Version 18.1.0 -ReleaseTag stable
```

This generates:
- `archive/release-snapshots/<snapshot-name>/` with captured release files
- `SHA256SUMS.txt` and `release_metadata.json`
- `archive/release-snapshots/<snapshot-name>.zip`

### CI Validation (New)

GitHub Actions workflow: `.github/workflows/ci.yml`

The workflow runs:
- Python compile checks
- `node --check dose-response-worker.js`
- CLI smoke test
- Selenium suites (`test_dose_response_main.py`, `test_dose_response_app.py`, `test_v19_comprehensive.py`, `selenium_full_test.py`)

---

## Sample Data

Load the teaching datasets to learn:

| Dataset | Demonstrates |
|---------|--------------|
| `linear_trend_teaching.csv` | Clear linear dose-response |
| `u_shaped_curve_teaching.csv` | Non-linear U-shaped curve |
| `high_heterogeneity_teaching.csv` | High I², subgroup differences |
| `saturation_effect_teaching.csv` | Exponential saturation |
| `edge_case_zero_cases.csv` | Handling zero events |

---

## Version Information

| Property | Value |
|----------|-------|
| **Version** | 18.1 Ultimate |
| **Release Date** | 2025-01-15 |
| **File Size** | ~135 KB |
| **Dependencies** | None (standalone HTML) |
| **Browser Support** | Chrome, Firefox, Safari, Edge |

---

## Citation

If you use Dose Response Pro in your research:

```bibtex
@software{dose_response_pro,
  title = {Dose Response Pro v18.1: A Browser-Based Dose-Response Meta-Analysis Tool},
  author = {{M25 Evidence Synthesis Lab}},
  year = {2025},
  url = {https://github.com/your-repo/dose-response-pro},
  version = {18.1 Ultimate}
}
```

In your methods section:

> "Dose-response meta-analysis was performed using Dose Response Pro v18.1 (M25 Evidence Synthesis Lab), which implements the Greenland & Longnecker two-stage generalized least squares method with multi-chain MCMC convergence diagnostics."

---

## Comparison with R Packages

| Feature | Dose Response Pro | dosresmeta | metafor | mvmeta |
|---------|-------------------|------------|---------|--------|
| GLS Method | ✅ | ✅ | ⚠️ Manual | ✅ |
| Interactive UI | ✅ | ❌ | ❌ | ❌ |
| Real-time plots | ✅ | ❌ | ❌ | ❌ |
| No installation | ✅ | ❌ | ❌ | ❌ |
| MCMC diagnostics | ✅ | ⚠️ Limited | ❌ | ❌ |
| Bootstrap CI | ✅ | ❌ | ⚠️ Manual | ❌ |
| Sensitivity analysis | ✅ GUI | ⚠️ Manual | ⚠️ Manual | ⚠️ Manual |
| CLI tool | ✅ | ❌ | ❌ | ❌ |
| R code export | ✅ | N/A | N/A | N/A |
| **Cost** | **Free** | **Free** | **Free** | **Free** |

---

## Performance

| Dataset Size | GLS Time | MCMC Time | Bootstrap Time |
|--------------|----------|-----------|----------------|
| 5 studies | < 0.1s | 3s | 5s (B=200) |
| 10 studies | 0.5s | 8s | 30s (B=1000) |
| 20 studies | 2s | 25s | 60s (B=1000) |
| 50 studies | 5s | 70s | 150s (B=1000) |

See [Computational Complexity](docs/Computational_Complexity.md) for details.

---

## Support

### Documentation
- Full documentation in `docs/`
- Teaching datasets in `sample_data/`
- Unit tests in `tests/unit_tests.html`

### Common Issues
| Issue | Solution |
|-------|----------|
| "Matrix is singular" | Check for collinear doses |
| "Need at least 2 studies" | Add more studies |
| "MCMC not converged" | Increase iterations |
| "Zero cases in category" | Add 0.5 continuity correction |

---

## Future Enhancements

See [Improvement Roadmap v19.0](docs/Improvement_Roadmap_v19.md) for planned features including:
- Network meta-analysis
- Publication bias assessment
- Individual patient data (IPD) meta-analysis
- Advanced meta-regression
- Cloud-based collaboration

---

## License

MIT License - See LICENSE file for details.

---

## Changelog

### v18.1 Ultimate (2025-01-15)
- ✅ Fixed all peer review issues
- ✅ Added restricted cubic spline model
- ✅ Added exponential model
- ✅ True REML implementation
- ✅ Bootstrap confidence intervals
- ✅ Web Worker support
- ✅ CLI tool for batch processing
- ✅ Comprehensive documentation
- ✅ Teaching datasets
- ✅ Validated against R packages

### Previous Versions
- See [Version Comparison](docs/Version_Comparison.md) for complete history

---

**M25 Evidence Synthesis Lab** | Version 18.1 Ultimate | 2025
