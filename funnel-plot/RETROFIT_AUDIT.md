# funnel-plot — Cycle 2.1 retrofit audit

**Date:** 2026-05-13
**Auditor:** Cycle 2.1 implementer subagent
**Method:** grep heuristic + full source read (571-line single-file app)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | The only file input is `id="file-import" accept="application/json,.json"` (line 131) — wired exclusively to `onImportJson`, which reads JSON state blobs. There is no path to load a `.csv` file. Data entry is textarea-only (paste `label, estimate, SE` rows). The shared `csv-upload.js` module adds RFC-4180 parsing + fuzzy header matching + a file picker that accepts `.csv` — none of that exists here. |
| Chart download | present-good | Two working buttons: "Download SVG" (`onDownloadSvg`, line 450) and "Download PNG" (`onDownloadPng`, line 455). SVG is built in-process with explicit `viewBox`, white background rect, and all labels baked in as `<text>` elements — no cropping or label-loss risk. PNG uses `canvas.toBlob` at 2× HiDPI with a white fill before `drawImage`; `URL.revokeObjectURL` is called in both paths (lines 436, 473). No PDF button, but SVG + PNG cover the primary use case. The native SVG exporter is superior to the shared `chart-download.js` module for a plot app because it stays vector. Do NOT replace. |
| Axis controls | absent | No x-axis min/max inputs, y-axis max-SE override, or log-scale toggle exist in the UI. The plot domain is fully auto-computed: x-axis from study CIs + funnel limits with a 5% pad (lines 305–315); y-axis (SE, inverted) from `maxSE * 1.15` (line 302). Users cannot override either axis. The "Effect label" field (`f-effect`) is a text label only, not a scale control. The shared `axis-controls.js` module adds numeric min/max fields with validation and a log toggle — wire it in. Special attention: y-axis is SE (not log-SE), so the log-toggle applies to the x (effect) axis only; document this in Task 19. |
| Results export | absent | The "Download JSON" button (`onDownloadJson`, lines 476–481) serialises only the raw form state (textarea text + display fields) under schema `funnel-plot-v1`. It does NOT export the computed Egger intercept/SE/t/p, the FE pooled mean, or per-study parsed values. There is no CSV export of any kind. The shared `results-export.js` module emits per-study rows plus a summary row as both CSV and JSON with formula-injection guarding — wire it in alongside (not replacing) the existing JSON round-trip button. |
| URL state | absent | Zero matches for `location.hash`, `URLSearchParams`, `pushState`, or `replaceState` in the source. The app persists to `localStorage` under key `"funnel-plot-v1"` on every `input` event (line 419), which restores on reload (lines 422–430). This is session-local only; sharing a link to a pre-populated state is impossible. Wire in `url-state.js`. |
| Reset/undo | present-broken | A "Reset" button exists (`btn-reset`, line 130) and calls `onReset` (line 492), which shows a bare `confirm()` dialog then clears all fields. There is no undo stack: one accidental click through the confirm destroys all entered data with no recovery path. The shared `reset-undo.js` module adds a 20-depth snapshot stack with a `<dialog>`-based confirm and a separate "Undo" button — wire it in to replace the bare `confirm()`/reset pattern. |
| Tooltips | absent | Only `../shared/toast.js` is loaded (line 569). Neither `../shared/glossary.js` nor `../hub/shared/tooltips.js` is present in the source — confirmed by grep returning zero matches for `glossary`, `Glossary`, `data-gloss`, `<abbr`, or `tooltips`. The three `title=` attributes on the shared-bus buttons (lines 127–129) are native HTML tooltips, not the glossary system. The footer note (line 141) references key jargon (`Egger`, `OLS`, `log-OR`, `log-RR`, Peters' test) that the shared glossary covers. Wire in `tooltips.js` (hub module) or `glossary.js` (shared module) consistent with the choice made for other funnel-plot Task 19 modules. |

## Modules to wire in (absent + present-broken)

- `csv-upload.js` — no CSV file input exists; only JSON state import is wired
- `axis-controls.js` — no axis range inputs or scale toggle; domain is fully auto-computed
- `results-export.js` — JSON download exports raw form state only, not Egger results or FE pooled mean; no CSV export at all
- `url-state.js` — no shareable URL; localStorage-only persistence
- `reset-undo.js` — Reset button exists but uses bare `confirm()` with no undo stack
- `tooltips.js` — no glossary system loaded at all; jargon-rich footer and stats panel are unannotated

## Modules to skip (present-good)

- `chart-download.js` — SVG and PNG downloads are implemented inline and working correctly; the native SVG builder produces a complete, label-safe vector output (white background, all axes, Egger note baked in as `<text>`). The shared module adds PDF and edge-crop padding which this plot does not need. Per spec §1 do-no-harm, keep the native implementation.

## Browser sanity (Task 21, 2026-05-13)

Verified via `funnel-plot/tests/sanity.spec.mjs` (Playwright on Chromium):

- [x] Page loads with zero console errors
- [x] All 6 wired alm.* modules expose their init function on `window.alm`
- [x] All 4 mount points initialise correctly
- [x] Pre-retrofit feature: funnel-plot SVG still renders (chart-download present-good intact)
- [x] results-export JSON contains real Egger values (not just form state — fixes the legacy "Download JSON" gap)

Run: `cd C:\Projects\allmeta\hub\shared\tests && npx playwright test funnel-plot-sanity.spec.mjs --reporter=list`
Result: **5 passed (16.2s)**

### Items deferred to human-eyeball review

- Visual quality of the funnel chart (axis labels intact, white background preserved?)
- URL state round-trip in a real browser (reload, see state restored)
- Reset-undo confirm dialog UX
- Tooltips: hover/keyboard focus on `<abbr data-gloss>` markers actually shows the glossary text

---

## Notes for Task 19

- The y-axis is **SE** (standard error, linear scale, inverted so 0 is at top). It is NOT log-SE. The `axis-controls.js` log-toggle applies to the x (effect) axis; any y-axis control exposed should be labelled "Max SE" (a numeric upper bound), not a log toggle.
- The app already has shared-bus integration (`ma-studies-v1`, buttons ↓ Shared / ↑ Shared / Validate (R)) — these are pre-retrofit features that must be preserved (do-no-harm).
- The existing `LS_KEY = "funnel-plot-v1"` is distinct from `forest-plot-v1` — no localStorage collision risk.
- `Toast.show` is already available via `../shared/toast.js`; Task 19 modules that call `Toast.show` will work without additional setup.
