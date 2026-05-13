# pet-peese — Cycle 2.2 retrofit audit

**Date:** 2026-05-13
**Auditor:** Cycle 2.2 implementer subagent (Task 2)
**Method:** grep heuristic + full source read (341-line single-file app)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | The only data entry path is a freeform textarea (`id="src"`) accepting `effect, SE` lines. There is no `<input type="file">` wired to CSV parsing; the `parseTable()` function splits on whitespace/commas in the textarea only. No column header matching. The shared `csv-upload.js` module adds RFC-4180 parsing + fuzzy header matching for `study, yi, sei` — none of that exists here. |
| Chart download | present-good | The native `drawFunnel()` function (lines 283–325) renders directly into the inline `<svg id="funnel">` element. The SVG is inline (not a separate DOM host), with axes, regression lines, and data circles baked in as SVG primitives. The app has no download buttons at all — the SVG is meant for visual inspection and screenshot only. The shared `chart-download.js` module adds PDF/PNG/SVG download which would be additive, but the pre-retrofit feature is the inline SVG itself, which works correctly. Per do-no-harm, no chart-download wiring attempted. |
| Axis controls | absent | No axis range inputs or scale toggle exist. The funnel domain is auto-computed from data extents with padding (`xMin - 0.1`, `xMax + 0.1`, `seMax * 1.1`, lines 289–291). Users cannot override either axis. The shared `axis-controls.js` module adds numeric min/max fields — wire it in. Override deferred (auto-compute remains in place), same pattern as funnel-plot. |
| Results export | absent | No download or export exists at all — not even a JSON state button. The shared `results-export.js` module emits per-study rows plus PET/PEESE/FE summary as CSV and JSON — wire it in. |
| URL state | absent | Zero matches for `location.hash`, `URLSearchParams`, `pushState`, or `replaceState`. No localStorage either. Sharing a link to a pre-populated state is impossible. Wire in `url-state.js`. |
| Reset/undo | present-broken | No Reset button of any kind exists. The app only has a single "Run" button (`btn-run`). Users who clear the textarea lose their data with no recovery path. The shared `reset-undo.js` module adds a 20-depth snapshot stack with a `<dialog>`-based confirm and Undo button — wire it in. |
| Tooltips | present-partial | A Glossary scan is wired (`../shared/glossary.js`, lines 330–339) but uses the old shared-bus path (`../shared/`) not `../hub/shared/`. More importantly, the footer references key jargon (`PET`, `PEESE`, `SE`, `Cochrane Handbook`) without `<abbr data-gloss>` markers. Wire in the hub `tooltips.js` module and add `<abbr data-gloss>` wrapping, consistent with other retrofits. |

## Modules to wire in (absent + present-broken)

- `csv-upload.js` — no CSV file input exists; textarea-only data entry
- `axis-controls.js` — no axis range inputs; domain is auto-computed only (override deferred)
- `results-export.js` — no export of any kind exists; wire in PET/PEESE/FE summary export
- `url-state.js` — no shareable URL; no localStorage persistence at all
- `reset-undo.js` — no Reset button; users lose data on textarea clear with no recovery
- `tooltips.js` — partial (old glossary.js path); replace with hub tooltips.js + abbr markers

## Modules to skip (present-good)

- `chart-download.js` — native inline `<svg id="funnel">` renders correctly with axes, regression lines (PET/PEESE), observed studies (circles), and imputed studies (outlined circles). The shared module adds download buttons which are additive, but the pre-retrofit SVG feature is intact. Per do-no-harm, keep the native rendering unchanged.

## metafor 4.x R-parity note

`regtest(r, model="lm", predictor="sei", ret.fit=TRUE)` in metafor 4.x returns
an `lm` object in `$fit`. The `$fit$b` and `$fit$se` slots are NULL in lm
objects — must use `coef(pet$fit)[1]` for intercept and
`summary(pet$fit)$coefficients[1, "Std. Error"]` for its SE.
The R fixture (`petpeese-tiny.R`) uses these lm accessors directly.

## Browser sanity (Cycle 2.2 Task 2, 2026-05-13)

Verified via `pet-peese/tests/sanity.spec.mjs` (Playwright on Chromium, 5/5):

- [x] Page loads with zero real console errors (CSP `frame-ancestors`-in-meta browser info message filtered — pre-existing)
- [x] All 6 wired `alm.*` modules expose their init function on `window.alm` (`csvUpload`, `axisControls`, `resultsExport`, `urlState`, `resetUndo`, `tooltips`)
- [x] All 4 mount points (`#alm-csv-mount .alm-csv`, `#alm-axis-mount .alm-axis`, `#alm-export-mount .alm-export`, `#alm-undo-mount .alm-undo`) initialise correctly
- [x] Pre-retrofit feature: native `#funnel` SVG still renders with lines and circles (chart-download do-no-harm gate clean)
- [x] results-export JSON contains real PET-PEESE stats (`_schema: pet-peese-results-v1`, `k > 0`, `pet_b0`, `peese_b0` all present)

### Items deferred to human-eyeball review

- Visual quality of the funnel plot (PET/PEESE regression lines visible, legend correct)
- Tooltip hover behaviour on `<abbr data-gloss>` markers in header and footer
- URL state round-trip in a real browser (reload, verify textarea restored from hash)
- Reset-undo confirm dialog UX and undo-stack depth in interactive use
- Axis-controls domain override (renders but does not yet drive `drawFunnel()` domain — same deferral as funnel-plot)

### Note on runner location

The canonical spec lives at `pet-peese/tests/sanity.spec.mjs`. Because
`hub/shared/tests/playwright.config.mjs` uses `testDir: '.'` + `testMatch: '*.spec.mjs'`,
a mirror is kept at `hub/shared/tests/pet-peese-sanity.spec.mjs` so the shared
webserver (port 8088, repo root) is reused. Both files are identical.
