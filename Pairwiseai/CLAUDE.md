# Claude Code Instructions for TruthCert-PairwisePro

## Project Context

This is the **TruthCert-PairwisePro v1.0** meta-analysis application - a single-page web app for systematic review and health technology assessment.

## Critical Files

| File | Purpose | Lines |
|------|---------|-------|
| `app.js` | Core JavaScript engine | 16,628 |
| `TruthCert-PairwisePro-v1.0-fast.html` | Main HTML interface | ~2,000 |
| `DEVELOPMENT_LOG.md` | Full development history | ~400 |

## Key Architecture Points

1. **Single HTML file** - All CSS/JS embedded for offline use
2. **No build system** - Direct editing of source files
3. **Window exports** - All functions exposed to `window.*` for console access
4. **Validation datasets** - R reference values for testing

## When Editing app.js

### Common Issues
- **"File unexpectedly modified" errors** - Use Python scripts instead of Edit tool
- **Duplicate functions** - Check before adding (use `grep -c "function name"`)
- **Syntax errors** - Always run `node -c app.js` after changes

### Safe Editing Pattern
```python
# Create a Python script to make changes
with open('C:/Truthcert1/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Make changes
content = content.replace(old, new)

# Write back
with open('C:/Truthcert1/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
```

### Insertion Points
- **New functions:** Insert before `// Export` section (~line 39260)
- **New exports:** Add to the `if (typeof window !== 'undefined')` block

## Function Categories

### Statistical Core (DO NOT MODIFY unless fixing bugs)
- `pnorm`, `qnorm`, `dnorm` - Normal distribution
- `pt`, `qt`, `dt` - t-distribution
- `pchisq`, `qchisq` - Chi-squared
- `betainc`, `gammainc` - Special functions (Lentz algorithm)
- `estimateTau2_*` - 7 heterogeneity estimators

### Publication Bias
- `eggerTest`, `petersTest`, `harbordTest`
- `petPeese` - PET-PEESE correction
- `copasSelectionModel` - Selection model
- `trimAndFill` - Trim and fill

### Advanced Methods
- `threeLevelMetaAnalysis` - Multi-level (Cheung 2014)
- `doseResponseMetaAnalysis` - Dose-response (Orsini 2011)
- `bivariateMetaAnalysis` - Bivariate (Jackson 2011)

### Validation
- `runExtendedValidation()` - Core tests (HKSJ, Egger)
- `runAdvancedValidation()` - Advanced tests (three-level, dose-response, ROB)

## Testing Commands

```bash
# Check syntax
node -c C:/Truthcert1/app.js

# Count lines
wc -l C:/Truthcert1/app.js

# Count functions
grep -c "function " C:/Truthcert1/app.js

# Find duplicates
grep -n "function petPeese" C:/Truthcert1/app.js
```

## Recent Changes (January 2026)

1. Added 43 "Beyond R" statistical functions
2. Fixed `betainc()` using Lentz continued fraction
3. Added three-level, dose-response, bivariate MA
4. Added ROB 2.0 / ROBINS-I integration
5. Added PRISMA 2020 template
6. Removed duplicate functions (petPeese, copasSelectionModel, bivariateMetaAnalysis)
7. Added METHODS_APPENDIX with equations
8. Added extended validation tests

## R Validation

The app validates against R packages:
- `metafor::rma()` - Pooled estimates, tau²
- `metafor::rma.mv()` - Three-level models
- `dosresmeta` - Dose-response
- `meta::metabias()` - Egger test

Current status: **100% pass rate (17/17 core tests)**

## Do NOT

- Add files without checking if function already exists
- Modify core statistical functions without R validation
- Create new HTML files (single-file architecture)
- Add npm/build dependencies (must work offline)

## Utility Scripts

Python scripts in `C:/Users/user/` for safe editing:
- `add_editorial_revisions.py`
- `cleanup_duplicates.py`
- `add_validation_tests.py`
- `fix_syntax.py`

### Critical Gap Functions (Jan 12, 2026)
9. **Mantel-Haenszel Method** - Standard for Cochrane reviews (OR, RR, RD)
10. **Peto Method** - Best for rare events (<1% rate)
11. **Cook's Distance** - Influence diagnostics with DFBETAS
12. **TES** - Test of Excess Significance (Ioannidis-Trikalinos)
13. **QQ Plot** - Normality check for residuals
14. **Validation vs R metafor** - BCG benchmark dataset

## Editorial Review Status
- **Score:** 9.5/10
- **Recommendation:** ACCEPT (Research Synthesis Methods)
- **Review file:** `EDITORIAL_REVIEW.md`

## New Console Commands
```javascript
// Run Critical Gap validation
validateCriticalGapFunctions()

// Mantel-Haenszel (for 2x2 tables)
mantelHaenszel(studies, 'OR')  // or 'RR', 'RD'

// Peto method (rare events)
petoMethod(studies)

// Cook's Distance
cookDistance(yi, vi)

// TES
testExcessSignificance(yi, vi)
```

## Workflow Rules (from usage insights)

### Data Integrity
Never fabricate or hallucinate identifiers (NCT IDs, DOIs, trial names, PMIDs). If you don't have the real identifier, say so and ask the user to provide it. Always verify identifiers against existing data files before using them in configs or gold standards.

### Multi-Persona Reviews
When running multi-persona reviews, run agents sequentially (not in parallel) to avoid rate limits and empty agent outputs. If an agent returns empty output, immediately retry it before moving on. Never launch more than 2 sub-agents simultaneously.

### Fix Completeness
When asked to "fix all issues", fix ALL identified issues in a single pass — do not stop partway. After applying fixes, re-run the relevant tests/validation before reporting completion. If fixes introduce new failures, fix those too before declaring done.

### Scope Discipline
Stay focused on the specific files and scope the user requests. Do not survey or analyze files outside the stated scope. When editing files, triple-check you are editing the correct file path — never edit a stale copy or wrong directory.

### Regression Prevention
Before applying optimization changes to extraction or analysis pipelines, save a snapshot of current accuracy metrics. After each change, compare against the snapshot. If any trial/metric regresses by more than 2%, immediately rollback and try a different approach. Never apply aggressive heuristics without isolated testing first.
