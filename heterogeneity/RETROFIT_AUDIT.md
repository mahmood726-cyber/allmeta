# heterogeneity — Cycle 2.2 retrofit audit

**Date:** 2026-05-13
**Auditor:** Cycle 2.2 implementer subagent (Task 1)
**Method:** grep heuristic + full source read (624-line single-file app)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | The only data entry path is a freeform textarea (`id="f-data"`) accepting `label, estimate, SE` lines. There is no `<input type="file">` wired to CSV parsing; the existing `id="file-import"` accepts only `.json` and feeds `onImportJson`. No column header matching. The shared `csv-upload.js` module adds RFC-4180 parsing + fuzzy header matching for `study, yi, vi` — none of that exists here. |
| Chart download | present-good | Two working buttons: "Download Baujat SVG" (`onDownloadSvg`, line 516) and "Download Baujat PNG" (`onDownloadPng`, line 524). SVG is built in-process with full `viewBox`, white background rect, point labels baked in as `<text>` elements — no cropping risk. PNG uses `canvas.toBlob` at 2× HiDPI with a white fill before `drawImage`. Both use `URL.revokeObjectURL`. The shared `chart-download.js` adds PDF and edge-crop paths that provide no benefit here; the native SVG builder is superior for a scatter/Baujat plot. Do NOT replace. |
| Axis controls | absent | No axis range inputs or log-scale toggle exist. The Baujat plot domain is auto-computed from point extents with 10-15% padding (`xMax *= 1.1; yMax *= 1.15`, lines 385-386); users cannot override it. The `f-scale` select used in `forest-plot` does not exist here. The shared `axis-controls.js` module adds numeric min/max fields with validation — wire it in. Note: axis-controls will render but domain override is deferred (same pattern as forest-plot) because `buildSvg()` would need a refactor to accept external lo/hi params. |
| Results export | absent | The "Download JSON" button (`onDownloadJson`, line 546) serialises only raw form state (`data` textarea + tau2 selector) under schema `heterogeneity-v1`. It does NOT export computed heterogeneity statistics (Q, I², τ², PI, HKSJ CI). No CSV export exists. The shared `results-export.js` module emits per-study rows plus pooled-summary rows as both CSV and JSON — wire it in alongside (not replacing) the existing JSON round-trip button. |
| URL state | absent | Zero matches for `location.hash`, `URLSearchParams`, `pushState`, or `replaceState`. The app persists to `localStorage` under key `"heterogeneity-v1"` on every render (line 495), which is session-local only. Sharing a link to a pre-populated state is impossible. Wire in `url-state.js`. |
| Reset/undo | present-broken | A "Reset" button exists (`btn-reset`, line 121) and calls `onReset` (line 559), which shows a bare `confirm()` dialog then clears all fields. No undo stack: one misclick through the confirm destroys all entered data with no recovery path. The shared `reset-undo.js` module adds a 20-depth snapshot stack with a `<dialog>`-based confirm and a separate Undo button. Replace the bare `confirm()` pattern with the shared module. |
| Tooltips | absent | No `data-gloss` attributes or `Glossary.scan` calls exist. The footer note mentions τ², DerSimonian, Paule, REML, Baujat — all jargon that has entries in `hub/shared/glossary.json`. The shared `tooltips.js` module scans `data-gloss="X"` attributes and injects hover definitions. Wire it in: wrap 5–8 abbreviations in `<abbr data-gloss="X">X</abbr>` in the footer and header, and call `window.alm.tooltips(...)` after init. |

## Modules to wire in (absent + present-broken)

- `csv-upload.js` — no CSV file input exists; textarea-only data entry
- `axis-controls.js` — no axis range inputs; domain is auto-computed only (override deferred per Cycle 2.1 precedent)
- `results-export.js` — JSON download exports raw form state, not computed heterogeneity stats
- `url-state.js` — no shareable URL; localStorage-only persistence
- `reset-undo.js` — Reset button uses bare `confirm()` with no undo stack
- `tooltips.js` — no jargon tooltips; footer + header contain REML, DL, HKSJ, I², τ², PI, Baujat

## Modules to skip (present-good)

- `chart-download.js` — SVG and PNG downloads are implemented inline and working correctly; the native Baujat SVG builder produces a complete, label-safe vector output superior to the shared module for scatter plots

## Browser sanity (Cycle 2.2 Task 1, 2026-05-13)

Verified via `heterogeneity/tests/sanity.spec.mjs` (Playwright on Chromium, 5/5):

- [x] Page loads with zero real console errors (CSP `frame-ancestors`-in-meta browser info message filtered — pre-existing, not a retrofit regression)
- [x] All 6 wired `alm.*` modules expose their init function on `window.alm` (`csvUpload`, `axisControls`, `resultsExport`, `urlState`, `resetUndo`, `tooltips`)
- [x] All 4 mount points (`#alm-csv-mount .alm-csv`, `#alm-axis-mount .alm-axis`, `#alm-export-mount .alm-export`, `#alm-undo-mount .alm-undo`) initialise correctly
- [x] Pre-retrofit feature: Baujat SVG still renders in `#svg-host` (chart-download do-no-harm gate clean)
- [x] results-export JSON contains real heterogeneity stats (`_schema: heterogeneity-results-v1`, `k > 0`, `tau2`, `I2`, `Q` all present)

### Items deferred to human-eyeball review

- Visual quality of the Baujat scatter plot (point labels, axes, point positions)
- Tooltip hover behaviour in header/footer regions
- URL state round-trip in a real browser (reload, verify textarea restored from hash)
- Reset-undo confirm dialog UX and undo-stack depth in interactive use
- Axis-controls domain override (renders but does not yet drive buildSvg() X/Y domain — same deferral as forest-plot Cycle 2.1)

### Note on runner location

The canonical spec lives at `heterogeneity/tests/sanity.spec.mjs`. Because
`hub/shared/tests/playwright.config.mjs` uses `testDir: '.'` + `testMatch: '*.spec.mjs'`,
a mirror is kept at `hub/shared/tests/heterogeneity-sanity.spec.mjs` so the shared
webserver (port 8088, repo root) is reused. Both files are identical.
