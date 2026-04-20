# Dose Response Pro

**Canonical browser entry:** `dose-response-pro.html`

Version-labelled HTML files in this repository are retained as historical snapshots or experimental builds. For normal use, the hub, tests, and documentation now point to `dose-response-pro.html`.

## Installation
Use the dependency files in this directory (for example `requirements.txt`, `environment.yml`, `DESCRIPTION`, or equivalent project-specific files) to create a clean local environment before running analyses.
Document any package-version mismatch encountered during first run.

**A comprehensive browser-based dose-response meta-analysis tool that implements the Greenland & Longnecker two-stage method.**

## Release Status (2026-03-08)

- Release decision: the canonical browser entry (`dose-response-pro.html`) supports broad public release.
- Deterministic CLI parity vs `dosresmeta`: 3/3 passed, with grid checks 3/3 passed.
- Strict benchmark vs R: `beats_r = true` on 120/120 comparable datasets.
- Strict benchmark runtime: median speedup `1.9157x` versus R under the benchmark harness.
- Browser regression surface: main Selenium suite now includes an explicit Validation-tab round-trip R JSON load-path check.

Current release evidence:
- [Release Notes](docs/RELEASE_NOTES_2026-03-08.md)
- [Strict Benchmark Report](docs/STRICT_BEAT_R_BENCHMARK_2026-03-08.md)
- [R Validation Artifact](tests/r_validation_results.json)
- [Strict Benchmark Artifact](tests/strict_beat_r_benchmark_results.json)

Historical 2026-02-28 package (archival context, not the current release basis):
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
| **Spline Model** | Restricted cubic spline subgroup analysis | ⚠️ Exploratory |
| **Exponential Model** | Experimental helper code path | ⚠️ Not exposed in main UI |
| **Sensitivity Analysis** | Leave-one-out with change metrics and heuristic Cook's D / DFITS | ✅ |
| **Subgroup Analysis** | Explore heterogeneity | ✅ |

### Validation
- ✅ Built-in regression checks and simulation diagnostics in the browser app
- ✅ External `dosresmeta` comparator script for the CLI path
- ✅ Current-analysis round-trip JSON export/load workflow for R-side comparison
- ✅ Selenium/browser smoke suites plus Python/JS syntax checks

### User Features
- **Interactive Visualizations**: Dose-response curves, tabular forest summaries, funnel/bias plots, influence explorer
- **CSV Import**: Smart parsing with flexible column detection
- **R Code Export**: `metafor`-based reproducibility export for linear/quadratic fits
- **CLI Tool**: Batch processing via `dose-response-cli.py`
- **HTTP-Friendly Validation**: external validation artifacts load when served via `http://localhost`

---

## Directory Structure

```
dosehtml/
├── dose-response-pro.html              # Canonical browser entry ⭐ USE THIS
├── dose-response-pro-v18.3-fixed.html  # Historical named snapshot
├── dose-response-pro-v19.0.html        # Experimental snapshot
├── dose-response-cli.py                # Command-line tool
├── dose-response-worker.js             # Prototype worker module (not wired into active UI)
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
│   ├── unit_tests.html                 # Independent math worksheet used during development
│   └── validate_dose_response_pro.R    # External dosresmeta comparator
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
| **Version History / Snapshot Notes** | [Version Comparison](docs/Version_Comparison.md) |

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
- External `dosresmeta` validation
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

> "Dose-response meta-analysis was performed using Dose Response Pro v18.1 (M25 Evidence Synthesis Lab), which implements the Greenland & Longnecker two-stage generalized least squares method for linear and quadratic dose-response meta-analysis."

---

## Comparison with R Packages

| Feature | Dose Response Pro | dosresmeta | metafor | mvmeta |
|---------|-------------------|------------|---------|--------|
| GLS Method | ✅ | ✅ | ⚠️ Manual | ✅ |
| Interactive UI | ✅ | ❌ | ❌ | ❌ |
| Real-time plots | ✅ | ❌ | ❌ | ❌ |
| No installation | ✅ | ❌ | ❌ | ❌ |
| Sensitivity analysis | ✅ GUI | ⚠️ Manual | ⚠️ Manual | ⚠️ Manual |
| CLI tool | ✅ | ❌ | ❌ | ❌ |
| Metafor R export | ✅ | N/A | N/A | N/A |
| **Cost** | **Free** | **Free** | **Free** | **Free** |

---

## Performance

| Dataset Size | GLS Time |
|--------------|----------|
| 5 studies | < 0.1s |
| 10 studies | 0.5s |
| 20 studies | 2s |
| 50 studies | 5s |

See [Computational Complexity](docs/Computational_Complexity.md) for details.

---

## Support

### Documentation
- Full documentation in `docs/`
- Teaching datasets in `sample_data/`
- Developer worksheet in `tests/unit_tests.html`

### Common Issues
| Issue | Solution |
|-------|----------|
| "Matrix is singular" | Check for collinear doses |
| "Need at least 2 studies" | Add more studies |
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
- ✅ Added exploratory restricted cubic spline subgroup mode
- ✅ Added experimental exponential helper code
- ✅ True REML implementation
- ✅ Bootstrap helper prototype
- ✅ Bundled worker prototype
- ✅ CLI tool for batch processing
- ✅ Comprehensive documentation
- ✅ Teaching datasets
- ✅ Added external dosresmeta comparator artifacts

### Previous Versions
- See [Version Comparison](docs/Version_Comparison.md) for complete history

---

**M25 Evidence Synthesis Lab** | Version 18.1 Ultimate | 2025
