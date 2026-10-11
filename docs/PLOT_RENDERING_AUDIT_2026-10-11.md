# Plot rendering audit — 11 October 2026

## What was repaired

- **TruthCert Pairwise Pro and Pairwise AI:** project saves now preserve the complete result object. TruthCert also preserves the input table rather than reconstructing effect-only rows. Restoring a project redraws all three core result panels, and newly revealed Plotly panels resize after becoming visible. Restore does not rerun the estimator.
- **NMA Dose-Response:** the main Run button now calls an explicit public engine entry point instead of an inaccessible function inside the engine closure. It reveals the chart panel and redraws the selected chart after the panel has measurable dimensions. Empty analysis output does not count as success.
- **IPD Meta-Pro:** the trim-and-fill canvas is connected to the existing observed/imputed results, with open imputed points. Data-derived network plots redraw on tab reveal and resize through a reachable top-level handler. Result/publication-bias panels repaint on reveal/resize. Statistical estimators are unchanged.

The earlier NMA Pro saved-session fix in PR #93 remains covered by six regression tests.

## Executed browser evidence

Baseline: deployed files from commit `c97928ddc64b224c0b20c7ce0ef2e03fc9f36dd6`.

- Catalogue probe, Actions run **38176154917**: 128 catalogue entries considered at 1280×900 and 390×900. At each width, 117 locally hosted native-JavaScript entries were loaded; six external-repository entries and five R/WebAssembly entries were explicitly excluded. There were no captured JavaScript page errors or HTTP error responses in those initial loads. This is not an assertion that every secondary feature was exercised.
- Final focused regression run **38178151813**, artifact **11716711606**: **148 passed, 0 failed, 0 skipped, 0 flaky** in Chromium over HTTP.
- `catalog-svg-plots.spec.mjs`: 64 catalogue entry points at both widths (128 tests). Checks visible SVGs, nonempty graphical marks, nonzero dimensions, finite geometry, and no JavaScript page errors.
- `flagship-plot-rendering.spec.mjs`: 14 tests at both widths, covering the two pairwise apps' actual save/download/reload/import, all five NMA Dose-Response chart tabs, Dose Response Pro saved plots, IPD trim-and-fill and data-derived network resize, and HTA's base-case trace after navigation.
- `nma-pro-session-plots.spec.mjs`: six desktop/mobile saved-session and redraw checks retained from PR #93.

Pairwise restore tests compare the full results, input rows, and refit count. IPD repaint tests compare result JSON; its network resize tests require another draw and the same actual treatment IDs on every draw. Plot appearance tests are not independent numerical validation of every statistical method.

Earlier investigative failures included both genuine defects and test-fixture mistakes (onboarding overlays and swapped pairwise tab locations). These were investigated, not treated wholesale as application failures. The final tests use the applications' existing returning-user onboarding preferences and their actual tab layout.

## Explicit limits and remaining work

- **Issue #95:** IPD's persistent `baujatPlot`, `looPlot`, and `netHeatPlot` canvases remain without dedicated rendering connections. The broader legacy initialiser/kMeans scope problem also needs a separately tested structural repair. Modal analyses elsewhere do not prove these persistent panels work.
- The five R/runtime entries and six apps hosted in other repositories were not certified by this native-app regression run.
- Optional subgroup, survival, MCMC, advanced diagnostic and other secondary workflows require their own valid inputs and dedicated coverage. The 148 passes do not mean every possible plot in all 128 catalogue entries is verified.
- Older pairwise project files that already discarded data cannot acquire the lost fields retroactively. Reimport the original data and resave when a legacy file lacks required inputs/results.

The temporary patch-generation scripts and write-enabled branch-only workflow were removed after the successful run. The retained `.spec.mjs` files are discovered by the repository's normal Playwright workflow.

## Reproduction

From `tests/playwright` after installing dependencies and Chromium:

```sh
npx playwright test catalog-svg-plots.spec.mjs flagship-plot-rendering.spec.mjs nma-pro-session-plots.spec.mjs --workers=3
```

The Playwright configuration starts the local HTTP server. Use built-in example data; no patient data was used for this audit.
