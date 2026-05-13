# meta-regression — Cycle 2.1 retrofit audit

**Date:** 2026-05-13
**Auditor:** Cycle 2.1 implementer subagent
**Method:** grep heuristic + full source read (648-line single-file app)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | The only file input is `id="file-import" accept="application/json,.json"` (line 122) — wired exclusively to `onImportJson`, which reads JSON state blobs. There is no path to load a `.csv` file. Data entry is textarea-only: users paste `label, estimate, SE, moderator` rows manually. The shared `csv-upload.js` module adds RFC-4180 parsing + fuzzy header matching (covering the covariate/moderator column) + a file picker that accepts `.csv` — none of that exists here. Covariate names are user-supplied, making CSV upload more critical here than for forest/funnel: researchers will already have the data in tabular form with a named moderator column. |
| Chart download | present-good | Two working buttons: "Download SVG" (`onDownloadSvg`, line 536) and "Download PNG" (`onDownloadPng`, line 540). SVG is built in-process with explicit `viewBox` (720×520), a white background rect, all axis labels and the fitted regression line baked in as `<text>` and `<polyline>` elements — no cropping or label-loss risk. PNG uses `canvas.toBlob` at 2× HiDPI with a white fill before `drawImage`; `URL.revokeObjectURL` is called correctly in both paths (lines 527, 554). No PDF button, but SVG + PNG cover the primary use case. The native SVG builder is superior to the shared `chart-download.js` module for a plot app because it stays vector. Do NOT replace. |
| Axis controls | absent | No x-axis min/max inputs, y-axis range override, or log-scale toggle exist. The bubble plot domain is fully auto-computed: x-axis from the moderator values with an 8% pad; y-axis from study estimate ± 1.96·SE with a 10% pad (lines 352–361). Users cannot override either axis. The moderator label and effect label are text cosmetics only, not scale controls. The shared `axis-controls.js` module adds numeric min/max fields with validation and a log toggle — wire it in. For meta-regression the x-axis (moderator) and y-axis (effect) are both candidates for manual range control; the log toggle most plausibly applies to y when effects are on a log scale (logOR, logHR). |
| Results export | absent | The "Download JSON" button (`onDownloadJson`, lines 558–562) serialises only the raw form state (textarea text + display fields) under schema `meta-regression-v1`. It does NOT export computed results: β₀, β₁, their CIs, t-stat, p-value, τ² (PM), HKSJ q, R² (τ² explained), or Q_E residual heterogeneity. There is no CSV export of any kind. The shared `results-export.js` module emits per-study rows plus a summary row as both CSV and JSON with formula-injection guarding — wire it in alongside (not replacing) the existing JSON round-trip button. The coefficient table (β₀, β₁) is the meta-regression-specific result users most need to export. |
| URL state | absent | Zero matches for `location.hash`, `URLSearchParams`, `pushState`, or `replaceState` in the source. The app persists to `localStorage` under key `"meta-regression-v1"` on every `input` event (line 489), which restores on reload (lines 512–520). This is session-local only; sharing a link to a pre-populated analysis (with moderator data) is impossible. Wire in `url-state.js`. The four fields — `data`, `title`, `modlabel`, `effectlabel` — are the serialisation scope already used by `readState`/`writeState`; `url-state.js` should use the same scope. |
| Reset/undo | present-broken | A "Reset" button exists (`btn-reset`, line 121) and calls `onReset` (line 577), which shows a bare `confirm()` dialog then clears all fields. There is no undo stack: one accidental click through the confirm destroys all entered data — including user-typed covariate values — with no recovery path. The shared `reset-undo.js` module adds a 20-depth snapshot stack with a `<dialog>`-based confirm and a separate "Undo" button. Replace the bare `confirm()`/reset pattern with the shared module. |
| Tooltips | absent | Only `../shared/toast.js` is loaded (line 646). Neither `../shared/glossary.js` nor any hub-level `tooltips.js` is present — confirmed by grep returning zero matches for `glossary`, `Glossary`, `data-gloss`, or `<abbr`. The three `title=` attributes (lines 117–120) on the shared-bus and WebR-validator buttons are native HTML tooltips, not the glossary system. The footer note (line 132) and the stats cards reference key jargon (`Paule-Mandel`, `Knapp-Hartung`, `HKSJ`, `t(k−2)`, `τ²`, `R²`, `Q_E`, `metafor`) that the shared glossary covers. Wire in `tooltips.js` or `glossary.js` consistent with the choice made for other Task 22–23 modules. |

## Modules to wire in (absent + present-broken)

- `csv-upload.js` — no CSV file input exists; only JSON state import is wired; covariate-column upload is the primary data-entry path for real studies
- `axis-controls.js` — no axis range inputs or scale toggle; both bubble-plot axes are fully auto-computed with no user override
- `results-export.js` — JSON download exports raw form state only, not β₀/β₁/CI/p, τ², R², or Q_E residual; no CSV export at all
- `url-state.js` — no shareable URL; localStorage-only persistence
- `reset-undo.js` — Reset button exists but uses bare `confirm()` with no undo stack; covariate data is irreplaceable once cleared
- `tooltips.js` — no glossary system loaded at all; footer and stats panel are jargon-rich and unannotated

## Modules to skip (present-good)

- `chart-download.js` — SVG and PNG downloads are implemented inline and working correctly; the native SVG builder produces a complete, label-safe vector output (white background, bubble plot, fitted regression line, CI band, all axes baked in as SVG primitives). The shared module adds PDF and edge-crop padding which this plot does not need. Per spec §1 do-no-harm, keep the native implementation.

## Notes for Task 23

- The app already has shared-bus integration (`ma-studies-v1`, buttons ↓ Shared / ↑ Shared / Validate (R)) — these are pre-retrofit features that must be preserved (do-no-harm).
- The bus schema emits `moderator: s.x` (line 611) when saving to `ma-studies-v1`. The `csv-upload.js` fuzzy header matcher should treat any column header containing `moderator`, `covariate`, `x`, or the user-supplied moderator label as the fourth column.
- The existing `LS_KEY = "meta-regression-v1"` is distinct from `forest-plot-v1` and `funnel-plot-v1` — no localStorage collision risk.
- `Toast.show` is already available via `../shared/toast.js`; Task 23 modules that call `Toast.show` will work without additional setup.
- The stats panel emits cards (not a `<table>`) via `statsWrap.innerHTML`; `results-export.js` should read from the already-computed JS objects, not scrape the DOM.
- The y-axis is the effect estimate (linear scale). The moderator (x-axis) is the user-supplied covariate. The log toggle in `axis-controls.js` most naturally applies to y when `f-effectlabel` contains `log`; document this decision in Task 23.
