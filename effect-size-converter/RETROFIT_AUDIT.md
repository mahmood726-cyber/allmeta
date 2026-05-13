# effect-size-converter — Cycle 2.2 retrofit audit

**Date:** 2026-05-13
**Auditor:** Cycle 2.2 implementer subagent (Task 3)
**Method:** full source read (630-line single-file app)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | The app is a single-estimate converter, not a table-entry tool. There is no `<input type="file">` anywhere and no column-mapping logic. The shared `csv-upload.js` can be wired to accept a canonical `m1,sd1,n1,m2,sd2,n2` row format for the SMD-from-means mode (the most common academic use case). Wire it in: clicking a row populates the derive fields and triggers conversion. |
| Chart download | present-good (different) | The app renders an inline `<svg id="forest-plot">` showing all converted effect sizes on the SMD scale. The SVG is generated dynamically via `renderForest()` with `innerHTML` joins (no download button). The shared `chart-download.js` adds PNG/PDF buttons; however, this app's inline SVG is not a canvas — defer chart-download wiring. No download button was present pre-retrofit; do NOT add one as that is out of scope for this cycle. |
| Axis controls | absent | The inline forest plot auto-computes its X domain from `xPad = maxAbs * 1.15` (line 470). No user-adjustable axis range. The shared `axis-controls.js` renders min/max inputs — wire it in; domain override deferred (same precedent as heterogeneity Cycle 2.2 Task 1). |
| Results export | absent | The app has no download or save mechanism at all — zero `<a download>` patterns, no JSON/CSV export, no Blob URLs. The shared `results-export.js` adds CSV + JSON buttons. Wire in. |
| URL state | absent | Zero matches for `location.hash`, `URLSearchParams`, `pushState`, `replaceState`, or `localStorage`. Sharing a pre-populated state is impossible. Wire in `url-state.js`. |
| Reset/undo | present-broken | No reset/undo UI exists. All form fields are static HTML defaults. No snapshot stack. Wire in `reset-undo.js` providing an Undo button and a dialog-confirmed Clear. |
| Tooltips | absent | No `data-gloss` attributes. Footer references Cox constant, Hedges' *g*, OR, RR, RD, SMD, MD, HR — all with glossary entries. Wire in `tooltips.js` and wrap 6–8 abbreviations. |

## Modules to wire in (absent / present-broken)

- `csv-upload.js` — wire for SMD-from-means mode: columns `m1, sd1, n1, m2, sd2, n2`; on parse, populate derive fields + trigger runConvert
- `axis-controls.js` — renders controls; domain override deferred
- `results-export.js` — adds CSV + JSON export of the current conversion table
- `url-state.js` — shareable URL via base64 hash
- `reset-undo.js` — Undo stack + dialog-confirmed Clear
- `tooltips.js` — hover glossary for OR, RR, RD, SMD, MD, HR, NNT, CI, SE terms

## Modules to skip (present-good / N/A)

- `chart-download.js` — no pre-existing download button; the inline SVG forest plot is read-only display. Adding download is out of scope for this cycle.

## CSV upload decision

The app has seven input modes (OR, RR, RD, SMD, MD, HR, IRR). A single canonical CSV format for all modes would require mode-detection logic. Decision: **provide CSV for SMD-from-means** (`m1, sd1, n1, m2, sd2, n2`) only — the most common academic use case and the mode with the cleanest escalc(`measure="SMD"`) R-parity fixture. On CSV parse, the six fields populate the derive-section inputs and the type selector is set to SMD; the user clicks Convert or it auto-fires.

## R-parity coverage (escalc family)

- `escalc(measure="SMD", m1i, sd1i, n1i, m2i, sd2i, n2i)` — 2 rows, yi + vi at tol=1e-6
- `escalc(measure="OR",  ai, bi, ci, di)` — 2 rows (2×2 table), yi + vi at tol=1e-6

The JS engine validates against the same arithmetic embedded in the test (computed directly, not via the browser UI). See `tests/test_against_metafor.py`.

## Browser sanity (Cycle 2.2 Task 3, 2026-05-13)

Verified via `effect-size-converter/tests/sanity.spec.mjs` (Playwright on Chromium, 5/5):

- [x] Page loads with zero real console errors
- [x] All 5 wired `alm.*` modules expose their init function (`csvUpload`, `axisControls`, `resultsExport`, `urlState`, `resetUndo`, `tooltips`)
- [x] All 4 mount points initialise (`#alm-csv-mount`, `#alm-axis-mount`, `#alm-export-mount`, `#alm-undo-mount`)
- [x] Pre-retrofit feature: forest plot SVG still renders in `#forest-plot`
- [x] results-export JSON contains conversion rows (`_schema: esc-results-v1`)

### Items deferred to human-eyeball review

- Visual quality of the inline forest plot on SMD scale
- Tooltip hover behaviour in footer
- URL state round-trip in a real browser
- Reset-undo confirm dialog UX in interactive use
- Axis-controls domain override (renders but does not drive forest plot domain)
- CSV upload for OR/RR/HR/MD modes (only SMD-from-means wired)
