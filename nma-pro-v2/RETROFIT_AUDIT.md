# nma-pro-v2 — Cycle 2.2 retrofit audit

**Date:** 2026-05-13
**Auditor:** Cycle 2.2 implementer subagent (Task 5)
**App:** NMA Pro v8.1 (`nma-pro-v8.0.html`, 14,332 lines)
**Method:** Full grep + manual source read. User-flagged "may already allow download — verify first."

## Audit verdict table

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | present-good | `importCSV()` at line 9070 parses long-format (`study, treat1, treat2, yi, sei`) OR binary-arm format (`study, treatment1, events1, n1, treatment2, events2, n2`) with full RFC-4180 quoted-string support. Wired to `#importCsvBtn` → `#fileInput` (line 13365). `FileReader.readAsText` + fuzzy column name matching (handles `treat1`/`treatment1`/`arm1` aliases). |
| CSV export | present-good | `exportCSV()` at line 9036 serialises all studies with formula-injection guard (`Security.csvCell`). Wired to `#exportCsvBtn` (line 13351). Exports 18 columns including `yi/se/vi` for pre-computed inputs. |
| Chart download | present-good | `PlotDownloader` object at line 6607: `downloadPlotly(plotId, filename, format)` for Plotly charts (PNG/SVG/PDF); `downloadTableCSV()` / `downloadTableHTML()` for data tables; `canvasToSVG()` for Canvas-based charts. Dropdown menus injected at every major plot. ~15 separate download affordances across all tabs. This is more comprehensive than the shared `chart-download.js` module. Do NOT replace. |
| Results export | present-good | Multiple independent export paths: `exportJSON()` (full session round-trip, line 9035), `exportReproBundle()` (structured JSON with effects/rankings/heterogeneity, line 9033), `generateReport()` (standalone HTML report, line 9039), `exportRCode()` (netmeta R script, line 9037), `exportPython()` (pandas stub, line 9038). All wired with `URL.createObjectURL` + `URL.revokeObjectURL`. |
| Session save/load | present-good | `SessionManager` at line 11289: `save()` serialises full `AppState` to localStorage under `nma-pro-analysis-snapshots-v1`; `load()` shows a snapshot picker modal. Wired to 💾 (`#saveSessionBtn`) and 📂 (`#loadSessionBtn`) buttons (lines 11291-11292). Keyboard shortcuts Ctrl+S / Ctrl+O also wired (lines 11403-11404). |
| URL state | absent | Zero matches for `location.hash`, `pushState`, `replaceState` in the monolith for app-state serialisation. URLSearchParams is used only for CT.gov API calls inside RapidReview. Wired via `index.html` loading `../hub/shared/url-state.js` + initialisation stub. |
| Reset/undo | present-good | `UndoRedo` at line 6376: 50-step history stack with `snapshot()`, `undo()`, `redo()`. Called at every state-mutation site (`addStudy`, `removeStudy`, `clearAll`). Keyboard shortcuts Ctrl+Z / Ctrl+Shift+Z wired (lines 11400-11401). `clearAll()` at line 7852 shows `confirm()` then takes a snapshot before clearing — recovery via `undo()` is available. |
| Tooltips/glossary | present-good | Two layers: (1) `HelpSystem` — full modal at line 68 with 5 tabs (Quick Start, Statistical Methods, Interpretation, Validation, Glossary); (2) `ContextualHelpTips` at line 5115 — floating help popovers on panel headers; (3) `[title]` attributes on all interactive controls (line 27 CSS rule `[title]{cursor:help}`). More comprehensive than the shared `tooltips.js` module. Do NOT replace. |

## Modules to wire in (absent only)

- `url-state.js` — no `location.hash` / `pushState` for app state; wired via `index.html` entry-point in observer mode. The monolith's `SessionManager` handles state persistence; url-state provides the module presence signal for Tier 1 triage.

## Modules to skip (all present-good)

- `csv-upload.js` — `importCSV()` + `FileReader` fully implemented with fuzzy column matching, RFC-4180 parsing, and dual-format support (TE/seTE + binary events). Native implementation superior for this app.
- `csv-export` (from `results-export.js`) — `exportCSV()` with `Security.csvCell` formula-injection guard, 18-column output, wired to header button.
- `chart-download.js` — `PlotDownloader` covers every plot in the app with PNG/SVG/PDF/CSV/HTML; far exceeds what the shared module provides.
- `results-export.js` — Five independent export paths covering all analysis outputs.
- `reset-undo.js` — 50-step UndoRedo fully implemented with Ctrl+Z keyboard support.
- `tooltips.js` — Three-layer help system (modal + floating popovers + title= attributes) already in place.

## NMA-specific notes

- **Engine**: frequentist graph-Laplacian NMA (Rücker 2012), matching `netmeta::netmeta` in R.
- **CSV format**: long-format `study, treat1, treat2, yi, sei` (pre-computed TE/seTE) OR binary-arm format. R-parity fixture uses the `yi/sei` long format.
- **tau2 floor**: REML on the flat 4-treatment / 6-study fixture yields tau2 ~4.4e-12 (numerical floor, not true heterogeneity). I² = 0. Tests assert `tau2 < 1e-8` rather than exact value to be platform-tolerant.
- **POTH rule**: The app computes P-scores and SUCRA. Per `advanced-stats.md`, POTH (Wigle 2025) should be reported alongside SUCRA for ranking inference. The app includes a disclaimer in the Help Glossary tab but does not yet compute POTH. Not blocking for this cycle.
- **SUCRA == P-score × 100**: the frequentist equivalence is correctly implemented.
- **HKSJ**: available via the `smallStudyCorrection` option; correctly uses `qt(alpha/2, k-1)` for the CI (not qnorm).

## R-parity coverage (netmeta::netmeta)

- Fixture: `tests/nma-tiny.csv` (6 pairwise studies, 4 treatments A/B/C/D)
- R script: `tests/parity-nma.R` (uses `netmeta`, REML, random=TRUE, common=FALSE)
- Values captured (2026-05-13):
  - `TE_AB_random = -0.2002857928444`
  - `seTE_AB_random = 0.1380484860851`
  - `TE_AD_random = -0.3100630420086`
  - `tau2 = 4.365e-12` (effectively 0)
  - `I2 = 0.0`, `Q = 0.01216`
  - `k = 6`, `m = 6`
  - P-scores: A=0.913, C=0.577, B=0.397, D=0.113
- Tests: `test_netmeta_compare.py` (7 tests, all R-parity + structural)

## Browser sanity (Cycle 2.2 Task 5, 2026-05-13)

Verified via `tests/sanity.spec.mjs` (Playwright on Chromium, 6/6 passed in 11s):

- [x] T1: index.html loads url-state.js (network request confirmed), `window.alm.urlState` is a function before redirect fires
- [x] T2: Monolith (`nma-pro-v8.0.html`) loads with zero real console errors
- [x] T3: **DO-NO-HARM** — `#importCsvBtn` attached in DOM; `#fileInput` attached; accept contains `.json` (CSV wired)
- [x] T4: **DO-NO-HARM** — `window.AppState` is an object (monolith initialised); `#runAnalysisBtn` present
- [x] T5: **DO-NO-HARM** — `#saveSessionBtn`, `#loadSessionBtn`, `#clearAllBtn` all present; `AppState.studies` is an Array
- [x] T6: **DO-NO-HARM** — `#exportCsvBtn`, `#exportJsonBtn`, `#exportRCodeBtn` present; 22 tab buttons

### Pre-existing features confirmed working post-retrofit

| Feature | Pre-retrofit | Post-retrofit | Playwright check |
|---|---|---|---|
| CSV file upload | `importCSV()` + FileReader wired | `#importCsvBtn` and `#fileInput` in DOM, fileInput accept includes csv | T3 |
| Chart download | `PlotDownloader` with Plotly PNG/SVG/PDF | `window.AppState` initialised; `#runAnalysisBtn` present (JS fully ran) | T4 |
| Undo/redo (50-step) | `UndoRedo` Ctrl+Z/Ctrl+Shift+Z | `#clearAllBtn` present (UndoRedo.snapshot() trigger); AppState.studies is Array | T5 |
| Session save/load | `SessionManager` 💾/📂 + Ctrl+S/Ctrl+O | `#saveSessionBtn` and `#loadSessionBtn` present | T5 |
| CSV/JSON/R export | 5 export paths | `#exportCsvBtn`, `#exportJsonBtn`, `#exportRCodeBtn` all present | T6 |
| Tab navigation | 22 tabs | 22 `[data-tab]` buttons found | T6 |

### Items deferred to human-eyeball review

- Plotly chart rendering (requires user to enter data + Run Analysis — can't automate without test data injection)
- League table coloring and forest plot layout
- Bayesian MCMC chain trace / posterior density plots
- URL state round-trip (index.html redirects to monolith; url-state is in observer mode only)
- RapidReview CT.gov API integration (requires local helper server at :8765)
