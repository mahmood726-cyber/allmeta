# Pairwise Meta Benchmark (2026-02-26)

## Scope
Benchmark of `TruthCert-PairwisePro` (new work build) against:
- Previous local build (`C:\\HTML apps\\Truthcert1`)
- R `metafor` (`rma.uni`, `rma.glmm`)
- R `meta`
- Stata `meta`
- RevMan (current random-effects implementation updates)

## Local parity check vs previous build

### Pooling estimator coverage
- Previous local build: **8 tau2 methods** (`DL, REML, PM, ML, HS, SJ, HE, EB`)
- Current work build: **17 tau2 methods**
  - `REML, DL, PM, PMM, ML, HS, HSk, SJ, HE, EB, GENQ, GENQM, PL, DL2, CA, BMM, QG`

### Summary / advanced analysis parity
Key summary and advanced analysis functions present in both previous and current code:
- `I2`, `H2`, `tau2`, `Q`/heterogeneity p-value
- prediction intervals
- HKSJ adjustment
- Egger, Begg, Peters, trim-and-fill, PET-PEESE
- leave-one-out, Baujat, radial, L'Abbe
- subgroup and meta-regression

## External benchmark snapshot

### R `metafor`
- `rma.uni` supports broad random-effects estimators including `DL, HE, HS, HSk, SJ, ML, REML, EB, PM, GENQ, PMM, GENQM`.
- `rma.glmm` provides GLMM-based pairwise models for sparse/zero-cell settings.

### R `meta`
- Default tau2 estimator is REML in current versions.
- Supports core tau2 estimators and extensive options for prediction intervals, tau2 CIs, and method-specific settings.

### Stata `meta`
- Native random-effects support with multiple estimators (REML, ML, empirical Bayes, DL, SJ, HE, HS, etc.).
- Built-in funnel/bias tests, trim-and-fill, L'Abbe/Galbraith, meta-regression and multilevel tools.

### RevMan (current)
- Since Jan 23, 2025 release, RevMan includes REML (default), HKSJ CIs, Q-profile tau2 CI, updated I2 calculation, and prediction intervals.

## Gaps after this update
1. Full oracle validation for all non-standard/custom estimators (`DL2`, `CA`, `BMM`, `QG`) across a broader dataset suite.
2. Full GLMM parity with `metafor` model families (the app includes GLMM capability and advanced-tab runner, but not complete parity for all model variants/options).

## Gap closures completed in this pass
1. Restored/extended tau2 estimator set in app runtime and UI selectors.
2. Added `PMM` estimator support in app engine and method naming/rationale mappings.
3. Added `HSk` estimator support in app engine/UI and oracle benchmark method list.
4. Added `PL` (profile-likelihood tau2) as a selectable estimator in runtime/UI.
5. Added advanced-tab runnable cards for GLMM rare-event analysis and profile-likelihood diagnostics.
6. Synced inline JS builds and updated main launch HTML so browser build reflects the latest estimator set.
