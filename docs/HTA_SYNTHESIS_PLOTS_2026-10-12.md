# HTA beginner synthesis plots — 12 October 2026

Follow-up to IPD PR #99. Baseline main: `6036f3b6c1fd404b6da7916460faa8b3ebaf56bc`.

## Reproduced defects and repaired scope

The beginner manual-entry analysis displayed summary statistics and a table without forest, cumulative or funnel plots. Its network example only directed the user to another section instead of displaying its fitted network. Publication-bias results similarly lacked the underlying observed/imputed plots.

The new `HTA/src/ui/synthesisPlots.js` supplies nine actual-data views: pairwise forest, cumulative and funnel; observed and trim-and-fill funnels; network graph, fitted network contrasts, frequentist P-scores and comparison-adjusted funnel. Every SVG export is bound to the selected plot, not the first chart on the page. Tables and CSV weights now agree with the saved random-effects result. Reanalysis replaces prior labels/results; invalid or disconnected input does not leave an old plot masquerading as new output.

The helper uses native SVG with geometry sized to the revealed panel. The mobile regression requires the whole SVG to fit inside its container and requires exported SVG XML to parse. Long display labels may be abbreviated; full names remain in the table and plot data.

## Numerical correction — not just a cosmetic repair

The old HTA REML score iteration could return a zero boundary estimate despite a better positive restricted-likelihood solution. `MetaAnalysisMethods.estimateTauREML` now calls the existing shared `AlmMaCore.tau2REML`; the shared core itself was not changed. The HTA result schema is preserved. Non-finite input values are rejected.

Four independent SciPy profile-likelihood fixtures compare the actual restricted negative log likelihood:

`0.5 * (sum(log(v + tau2)) + log(sum(w)) + sum(w * (y - mu_w)^2))`, with `w = 1 / (v + tau2)`.

The reference script searches a logarithmic grid, polishes the best interior basin and compares the result with the zero boundary. It does not call the application or reuse the JavaScript iteration. The four fixtures cover equal effects, equal variances, unequal variances and the reproduced defect; this is not a general proof of global convergence.

For the four-study synthetic input effects `[0.2, 0.5, -0.1, 0.4]` and standard errors `[0.1, 0.2, 0.15, 0.12]`, the corrected tau-squared is approximately **0.03965219**, rather than zero. The pooled estimate changes from approximately 0.23372 to 0.23923, and its standard error from approximately 0.06470 to 0.12191. Previously saved or reported HTA REML analyses should be rerun from the original inputs; the change can affect estimates and intervals.

## Interpretation and boundaries

The beginner pairwise view explicitly uses and labels random-effects REML with normal-approximation 95% intervals. It does not advertise an HKSJ adjustment that was not actually applied. The network view explicitly uses the engine's fixed-effect frequentist path and reports P-scores, not invented rank probabilities. Unsupported multi-arm and disconnected designs receive an explanation. Funnel asymmetry is not equated with publication bias, and a non-significant diagnostic is not presented as proof that bias is absent. Trim-and-fill's existing fixed-effect adjustment is labelled separately from the primary random-effects fit.

**Issue #100 remains open:** HTA's separate advanced synthesis panels, import/selector contracts, diagnostic-accuracy entry point and wider statistical-method qualifications are not certified by this beginner-view repair. Other optional workflows and browser engines also require their own coverage. Visible plotted output alone is not comprehensive statistical validation.

## Browser evidence

- Baseline in run **38229010350**, artifact **11738176875**: six deliberately failing real-UI/numerical cases, covering missing manual/network plots and the REML boundary defect at desktop/mobile widths.
- Its first repaired run passed 206 checks, but screenshot inspection revealed horizontal clipping on phones. Those passes alone were not accepted as evidence of complete visibility.
- Run **38230228227** passed 164/166 native cases after the geometry change. Two export tests were intercepted by a delayed independent onboarding overlay. Both existing returning-user tutorial preferences were then set in the test fixture; no application tutorial was removed and no plot/export assertion was relaxed.
- Final strengthened run **38230897379**, artifact **11738702192**: **206 passed, zero failed, skipped or flaky, with no retries**. The JSON groups contain 166 native/HTA cases, six NMA Pro cases and 34 earlier IPD/export/browser-R cases at desktop/mobile-sized widths.

The final suite includes exact displayed effects/weights/intervals, cumulative-fit agreement, actual observed/imputed funnel points, fitted network-node/contrast/P-score data, byte-exact selected-SVG export, CSV consistency, finite geometry, full mobile-panel visibility, stale-input removal and no refitting on resize. The four numerical references match to seven decimal places. Desktop/mobile screenshots were inspected.

The retained tests use synthetic or built-in example data only. Patch-generation scripts were removed after validation. A temporary write-enabled branch workflow (`.github/workflows/hta-export-controls-temp.yml`, `permissions: contents: write`, which patched source and pushed to this branch) was added in commit 2f36b08 and was deleted in the 2026-10-19 review follow-up; its proposed controls were never committed by it. The normal Playwright workflow discovers the retained tests.

## Review follow-up (2026-10-19)

- **Restored result actions.** The plotted results modal had dropped the pre-existing **Copy Results** and **Generate Report** buttons. Both are back in the modal footer, wired to the unchanged `BeginnerMode.copyToClipboard('text')` and `BeginnerMode.generateReport()`. `generateReport()` writes a printable HTML report into a new window (`window.open` + `document.write`); it does not trigger a file download, so its test waits for the popup and reads the report it contains (pooled effect, CI, tau-squared, each study's random-effects weight). The footer wraps so no action is clipped at phone width.
- **Prediction interval.** `MetaAnalysisMethods.calculatePooledEffect` previously switched the prediction interval to the normal quantile for k >= 10 unless HKSJ was requested. It now uses `mu +/- t(0.975, k-1) * sqrt(tau2 + SE^2)` at every k (Cochrane Handbook v6.5) and reports it for k >= 3 (null for k <= 2, as the existing unit test requires). For k < 10 the numbers are unchanged. For the 13-trial BCG data (`escalc("RR", data = dat.bcg)`, REML) the interval moves from the z-based [-1.8666922, 0.4376275] to [-1.9953420, 0.5662773]; references were recomputed in R 4.6.0 / metafor 5.0.1 from the explicit formula.

## Reproduction

From `tests/playwright`, after installing dependencies and Chromium:

```sh
npx playwright test hta-synthesis-plots.spec.mjs secondary-plot-fidelity.spec.mjs flagship-plot-rendering.spec.mjs catalog-svg-plots.spec.mjs --workers=2 --retries=0
npx playwright test nma-pro-session-plots.spec.mjs --workers=1 --retries=0
npx playwright test remaining-plots.spec.mjs remaining-runtime-plots.spec.mjs ipd-fitted-display.spec.mjs --workers=2 --retries=0
```

The independent numeric reference is `HTA/validation/reml_profile_reference.py` (NumPy and SciPy required).
