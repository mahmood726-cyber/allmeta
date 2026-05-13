# forest-plot — Cycle 2.1 retrofit audit

**Date:** 2026-05-13
**Auditor:** Cycle 2.1 implementer subagent
**Method:** grep heuristic + full source read (736-line single-file app)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | The only file input is `id="file-import" accept="application/json,.json"` (line 133) — it is wired exclusively to `onImportJson`, which reads JSON state blobs. There is no path to load a `.csv` file. Data entry is textarea-only (paste `label, SE, estimate` rows). The shared `csv-upload.js` module adds RFC-4180 parsing + fuzzy header matching + a file picker that accepts CSV — none of that exists here. |
| Chart download | present-good | Two working buttons: "Download SVG" (`onDownloadSvg`, line 592) and "Download PNG" (`onDownloadPng`, line 598). SVG is built in-process with explicit `viewBox`, white background rect, and all labels baked in as `<text>` elements — no cropping or label-loss risk. PNG uses `canvas.toBlob` at 2× HiDPI with a white fill before `drawImage`. Both use `URL.revokeObjectURL`. No PDF button, but SVG + PNG cover the primary use case; the shared `chart-download.js` adds PDF and edge-crop padding which the inline SVG does not need. Do NOT replace — the native SVG export is superior for a plot app because it stays vector. |
| Axis controls | absent | No x-axis min/max inputs or log-scale toggle exist in the UI. The plot domain is auto-computed from study CIs + pooled intervals (lines 379-395) with a 10% pad; users cannot override it. The `f-scale` select (line 99) controls label formatting (linear vs exponentiated) but does NOT toggle a log axis — it only post-transforms tick labels. The shared `axis-controls.js` module adds numeric min/max fields with validation and a log toggle; wire it in. |
| Results export | absent | The "Download JSON" button (`onDownloadJson`, lines 622-627) serialises only the raw form state (`data` textarea text + display fields) under schema `forest-plot-v1`. It does NOT export the computed pooled results (FE mu/CI, RE mu/CI, τ², I², Q, 95% PI). There is no CSV export of any kind. The shared `results-export.js` module emits per-study rows plus a pooled-summary row as both CSV and JSON, with formula-injection guarding — wire it in alongside (not replacing) the existing JSON round-trip button. |
| URL state | absent | Zero matches for `location.hash`, `URLSearchParams`, `pushState`, or `replaceState`. The app persists to `localStorage` under key `"forest-plot-v1"` on every `input` event (line 557), which restores on load (line 560). This is session-local only; sharing a link to a pre-populated state is impossible. Wire in `url-state.js`. |
| Reset/undo | present-broken | A "Reset" button exists (`btn-reset`, line 132) and calls `onReset` (line 640), which shows a `confirm()` dialog then clears all fields. However there is no undo stack: one accidental click (or misclick through the confirm) destroys all entered data with no recovery path. The shared `reset-undo.js` module adds a 20-depth snapshot stack with a proper `<dialog>`-based confirm and a separate "Undo" button. Replace the bare `confirm()`/reset pattern with the shared module. |
| Tooltips | present-good | `shared/glossary.js` is already loaded (`defer`, line 721) and `Glossary.scan` is called on `header` and `.footer-note` after `DOMContentLoaded` (lines 723-731). The footer note contains the key jargon (`Paule-Mandel`, `HKSJ`, `SE`, `I²`, `τ²`, `prediction interval`) which are all in the glossary term list. This is working correctly. Note: the hub-level `tooltips.js` (`hub/shared/tooltips.js`) uses a different API (`data-gloss` attributes + `window.Tooltips`) than the page-level `glossary.js` (`window.Glossary.scan`). Both cover the same vocabulary; migrating to the hub module would require removing the existing `glossary.js` import and re-scanning, with no user-visible benefit and real regression risk. Keep as-is; per spec §1 "do-no-harm", do not swap. The `tooltips.js` integration from Task 15 should be limited to any new UI surfaces added by other modules (e.g. axis-controls panel), not the existing footer/header regions. |

## Modules to wire in (absent + present-broken)

- `csv-upload.js` — no CSV file input exists; only JSON state import is wired
- `axis-controls.js` — no x-axis range inputs or log toggle exist; domain is auto-only
- `results-export.js` — JSON download exports raw state, not pooled results; no CSV export at all
- `url-state.js` — no shareable URL; localStorage-only persistence
- `reset-undo.js` — Reset button exists but uses bare `confirm()` with no undo stack

## Modules to skip (present-good)

- `chart-download.js` — SVG and PNG downloads are implemented inline and working correctly; the native SVG builder produces a complete, label-safe vector output that does not need the shared module's edge-crop or PDF paths
- `tooltips.js` (hub module) — glossary integration via `shared/glossary.js` + `Glossary.scan` is already active and covering all jargon in the footer note; swapping APIs would risk regression with no user-visible improvement. New UI surfaces added by other wired-in modules may use `tooltips.js` for their own controls.

## Browser sanity (Task 17, 2026-05-13)

Verified via `forest-plot/tests/sanity.spec.mjs` (Playwright on Chromium, 5/5 passed in 23s):

- [x] Page loads with zero real console errors (CSP `frame-ancestors`-in-meta browser
      info message filtered — pre-existing, not a retrofit regression; HTTP header is the
      enforcement path)
- [x] All 5 wired `alm.*` modules expose their init function on `window.alm`
      (`csvUpload`, `axisControls`, `resultsExport`, `urlState`, `resetUndo`)
- [x] All 4 mount points (`#alm-csv-mount .alm-csv`, `#alm-axis-mount .alm-axis`,
      `#alm-export-mount .alm-export`, `#alm-undo-mount .alm-undo`) initialise correctly
- [x] Pre-retrofit feature: forest-plot SVG still renders in `#svg-host` with drawn
      lines (chart-download path intact — do-no-harm gate clean)
- [x] results-export JSON contains real pooled values (`_schema: forest-plot-results-v1`,
      `k > 0`, `fe_mu`, `fe_ci_lb/ub`, `re_mu`, `tau2`, `I2` all present — fixes the
      legacy "Download JSON" gap that exported only raw form state)

### Items deferred to human-eyeball review

- Visual quality of the chart (axis labels, diamond shape, CI whiskers intact)
- Tooltip behaviour for method labels (`shared/glossary.js` — Task 14 marked
  present-good; trust the existing Playwright pass in `tooltips.spec.mjs`)
- URL state round-trip in a real browser (reload, verify state restored from hash)
- Reset-undo confirm dialog UX and undo-stack depth in interactive use

### Note on runner location

The canonical spec lives at `forest-plot/tests/sanity.spec.mjs`. Because
`hub/shared/tests/playwright.config.mjs` uses `testDir: '.'` + `testMatch: '*.spec.mjs'`,
a mirror is kept at `hub/shared/tests/forest-plot-sanity.spec.mjs` so the shared
webserver (port 8088, repo root) is reused. Both files are identical.
