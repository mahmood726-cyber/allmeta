# Session Handoff - Pairwise R Gap Closure

Date: 2026-02-26
Project: `C:\HTML apps\Truthcert1_work`
Primary file changed: `app.js`

## 1) Goal completed in this session

Advance pairwise meta-analysis beyond baseline R workflows without removing existing functions/functionality.

Implemented in this session:
- Rare-event auto-engine with method recommendation logic.
- Real Mantel-Haenszel and Peto outputs wired into `runAnalysis`.
- Estimator-ensemble prediction interval (`pi.ensemble`) based on model-averaged consensus.
- Robustness verdict card with instability scoring.
- Post-render UI injectors for new analysis cards.
- Heterogeneity panel enhancement to show ensemble PI row.

No existing feature was removed.

## 2) Exact code additions/changes

### 2.1 New computation helpers

Added functions in `app.js`:
- `buildBinary2x2Tables(...)` around line 1734
- `computeEstimatorEnsemblePI(...)` around line 1755
- `analyzeRareEventEngine(...)` around line 1777
- `computeRobustnessVerdict(...)` around line 1843

What they do:
- Build safe 2x2 tables from validated binary rows.
- Build model-averaged prediction interval from estimator consensus (`pairwiseConsensus.consensus`).
- Detect rare/ultra-rare regimes, zero-cell burden, arm imbalance, effect-size red flags, and recommend engine:
  - `PETO` for ultra-rare near-null OR settings with acceptable balance.
  - `MH` when sparse/zero-cell conditions suggest Mantel-Haenszel robustness.
  - `RE-IV` otherwise.
- Derive robustness verdict from k, I2, estimator-stability signals, PI crossing null, and rare-event sensitivity flags.

### 2.2 runAnalysis integration

Updated in `runAnalysis`:
- Noma PI now uses real function:
  - `x = predictionInterval_Noma(h.theta, h.se, p, m, c)` around line 8345.
- Ensemble PI computed:
  - `aePiEnsemble = computeEstimatorEnsemblePI(...)` around lines 8444-8451.
- Binary methods computed (instead of skipped placeholders):
  - `H` from `mantelHaenszel(ceBinaryTables, measure)` around line 8512.
  - `q` from `petoMethod(ceBinaryTables)` around line 8530.
- Rare-event engine object computed:
  - `ceRareEventEngine = analyzeRareEventEngine(...)` around line 8547.
- Results object extended:
  - `pi.ensemble` around line 8657.
  - `rareEventEngine` around line 8673.
  - `robustnessVerdict` object placeholder then computed after result assembly around lines 8701-8715.

### 2.3 UI rendering hooks

Analysis panel callback now includes:
- `renderRareEventEngineCard(e)`
- `renderRobustnessVerdictCard(e)`
- Hooked in `setTimeout` callback near line 8777.

Added new renderer functions:
- `renderRareEventEngineCard(...)` around line 9597.
- `renderRobustnessVerdictCard(...)` around line 9657.

Heterogeneity panel enhanced with ensemble PI row:
- `enhancePredictionIntervalMethods(...)` around line 9568.
- Hooked into heterogeneity post-render callback around line 9712.

## 3) New result schema keys (AppState.results)

Added/now populated:
- `pi.ensemble`
- `mh_result` (real computed output for binary data)
- `peto_result` (real computed output for binary data)
- `rareEventEngine`
- `robustnessVerdict`

Already existing and still retained:
- `pairwiseConsensus`, `estimatorSpread`, `tau2Stable`, `tau2_all`, and all prior keys.

## 4) Validation and build status

Checks run after edits:
- `node -c app.js` -> PASS
- `runAutomatedTests()` -> 15/15 PASS
- `runValidationSuite()` -> 3/3 PASS
- `runValidationBenchmarks(false)` -> 6/6 PASS
- `npm run -s oracle:r` -> PASS; regenerated `oracle_output.json`
- `npm run -s build:min` -> PASS
- `sync_inline_builds.ps1` -> PASS
- `node -c app.min.js` -> PASS

## 5) Updated deploy artifacts

Updated files:
- `C:\HTML apps\Truthcert1_work\app.js`
- `C:\HTML apps\Truthcert1_work\app.min.js`
- `C:\HTML apps\Truthcert1_work\TruthCert-PairwisePro-v1.0-bundle.html`
- `C:\HTML apps\Truthcert1_work\TruthCert-PairwisePro-v1.0-dist.html`
- `C:\HTML apps\Truthcert1_work\TruthCert-PairwisePro-v1.0-min.html`
- `C:\HTML apps\Truthcert1_work\oracle_output.json`

## 6) How to reopen and verify quickly

1. Open:
   - `TruthCert-PairwisePro-v1.0-bundle.html` (or `-dist.html`) in browser.
2. Load a binary dataset (demo or your own).
3. Run analysis.
4. Verify in Analysis tab:
   - `Rare-Event Engine` card appears.
   - `Robustness Verdict` card appears.
5. Verify in Heterogeneity tab:
   - PI methods table includes `Estimator ensemble`.
   - Estimator consensus card still appears.
6. Optional console spot checks:
   - `AppState.results.rareEventEngine`
   - `AppState.results.mh_result`
   - `AppState.results.peto_result`
   - `AppState.results.pi.ensemble`
   - `AppState.results.robustnessVerdict`

## 7) Repro commands

From `C:\HTML apps\Truthcert1_work`:

```powershell
node -c app.js
npm run -s oracle:r
npm run -s build:min
powershell -ExecutionPolicy Bypass -File .\sync_inline_builds.ps1
node -c app.min.js
```

## 8) Notes and guardrails

- No destructive git operations were used.
- Existing functionality retained.
- New UI elements were added as post-render injectors to avoid destabilizing large template strings.
- Rare-event recommendation logic is deterministic and transparent (inputs are exposed in `rareEventEngine` object).

## 9) Next high-impact upgrades (if continuing)

1. Add continuity-correction sensitivity panel (`constant`, `treatment-arm`, `none`) with delta effects.
2. Add Hartung-Knapp small-k trigger card and auto caution badges in main analysis.
3. Add exact method fallback track for ultra-rare sparse settings (score/Mid-P style sensitivity lane).
4. Add method concordance matrix (RE-IV vs MH vs Peto) with directional conflict alerts.
5. Add one-click R export including new rare-event and ensemble diagnostics for external audit trail.


## 10) Post-handoff patch (2026-02-26, late session)

User-reported issues fixed:
- Mojibake artifacts in menus/results (e.g., `–`, similar).
- Advanced methods tab/cards present but handlers/results not reliably displaying.

### 10.1 Mojibake hardening

Implemented in `app.js`:
- Added `startMojibakeObserver()` mutation observer to normalize new/updated DOM text and attributes in real time.
- Startup wiring now calls:
  - `startMojibakeObserver()` during main init.
  - `startMojibakeObserver()` again on window `load` (idempotent guard).
- Existing `normalizeMojibakeInDOM(...)` kept and still called after key renders/tab actions.

Effect:
- Encoded artifacts are corrected not only on initial load but also after dynamic result renders and advanced method outputs.

### 10.2 Advanced methods display/run compatibility

Implemented in `app.js`:
- Added `getElementByIds([...])` helper for backward-compatible DOM targeting.
- `runPowerAnalysis()` and `autoRenderPowerAnalysis()` now auto-target whichever power containers exist:
  - Results: `powerResults` or `powerAnalysisResults`
  - Plot: `powerPlot` or `powerCurvePlot`
- `runRoBMA()` / `renderRoBMAResults()` / `renderRoBMAPlot()` now support both ID schemes:
  - `robma*` and `modelavg*`
- Added `runSimplifiedMA()` alias that calls `runRoBMA()`.
- Added `registerAdvancedMethodGlobals()` and wired it:
  - immediate call
  - rebind on window `load`

Effect:
- Advanced-card button handlers are reliably available globally even when later legacy script blocks exist.
- ModelAvg card now works through unified RoBMA pipeline without removing legacy support.

### 10.3 Build/deploy status after this patch

Commands run:
- `node -c app.js` -> PASS
- `npm run -s build:min` -> PASS
- `powershell -ExecutionPolicy Bypass -File .\sync_inline_builds.ps1` -> PASS
- `node -c app.min.js` -> PASS

Updated artifacts (again):
- `C:\HTML apps\Truthcert1_work\app.js`
- `C:\HTML apps\Truthcert1_work\app.min.js`
- `C:\HTML apps\Truthcert1_work\TruthCert-PairwisePro-v1.0-bundle.html`
- `C:\HTML apps\Truthcert1_work\TruthCert-PairwisePro-v1.0-dist.html`
- `C:\HTML apps\Truthcert1_work\TruthCert-PairwisePro-v1.0-min.html`

## 11) Mojibake symbol cleanup follow-up (2026-02-26, final)

Issue reported:
- Residual corrupted symbols around DDMA labels (example: `"Not Significant" ... DDMA Shows Benefit`).

Fixes applied:
- Reworked mojibake decoder to use Windows-1252 byte mapping before UTF-8 decode.
- Added residual artifact stripper (`\uFFFD` cleanup) in both bulk DOM normalization and mutation observer paths.
- Replaced corrupted DDMA demo label arrows with ASCII `->` in source labels.

Validated and shipped:
- `node -c app.js` PASS
- `npm run -s build:min` PASS
- `sync_inline_builds.ps1` PASS
- `node -c app.min.js` PASS
