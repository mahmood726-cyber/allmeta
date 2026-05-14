# mh-peto — Cycle 2.6 retrofit audit

**Date:** 2026-05-14
**Auditor:** Cycle 2.6 implementer subagent
**Method:** grep heuristic + full source read (282-line single-file app)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | Data entry is textarea-only (`id="src"`, line 62). There is no `<input type="file">` anywhere; no CSV parser. The shared `csv-upload.js` module adds RFC-4180 parsing + fuzzy header matching for `study,e1,n1,e2,n2` columns — wire it in. |
| Chart download | absent | No download button of any kind exists. The forest SVG is drawn inline into `<svg id="forest">` with `innerHTML` assembly. The shared `chart-download.js` module adds SVG + PNG + PDF download buttons — wire it in. |
| Axis controls | absent | No x-axis min/max inputs or log-scale toggle exist. The plot domain is auto-computed from CI extremes (lines 254-257) with 10% pad. The shared `axis-controls.js` module adds numeric min/max fields + log toggle — wire it in. |
| Results export | absent | No export button of any kind exists. Pooled MH OR, Peto OR, Q, p-value are computed but never downloadable. The shared `results-export.js` module emits these as CSV and JSON — wire it in. |
| URL state | absent | No `location.hash`, `URLSearchParams`, `pushState`, or `replaceState` anywhere. No `localStorage` either. The shared `url-state.js` module adds shareable URL encoding — wire it in. |
| Reset/undo | absent | No reset button and no undo stack exist. A bare `<button id="btn-run">Pool</button>` triggers the engine but there is no way to revert to the previous state. The shared `reset-undo.js` module adds a 20-depth snapshot stack with a `<dialog>`-based confirm and Undo button — wire it in. |
| Tooltips | absent | No `data-gloss` attributes, no glossary import, no `window.Glossary` or `window.Tooltips` call. The shared `tooltips.js` module + `glossary.json` covers MH, Peto, OR, RR, RD, heterogeneity terms — wire it in. |

## Modules to wire in (all 7 absent)

- `csv-upload.js` — no CSV file input exists; textarea-only data entry
- `chart-download.js` — no download buttons exist; SVG forest rendered inline
- `axis-controls.js` — no x-axis range inputs or log toggle; domain auto-only
- `results-export.js` — no export; pooled estimates computed but not downloadable
- `url-state.js` — no shareable URL; no persistence at all
- `reset-undo.js` — no reset button and no undo stack
- `tooltips.js` — no glossary integration

## Modules to skip

None — all 7 are absent and need wiring.

## R-parity

- **Cycle 7.2 override removed**: the `kind: non-numerical` override is retired.
- Real R-parity established via `metafor::rma.peto()` and `metafor::rma.mh()`.
- Fixture: `tests/fixtures/mhpeto-tiny.csv` (5 studies, `study,e1,n1,e2,n2`).
- R script: `tests/fixtures/mhpeto-tiny.R` (calls both `rma.peto` and `rma.mh`).
- Values captured 2026-05-14: Peto OR logOR = −1.081012806542; MH logOR = −1.205880041393.

## Browser sanity

Verified via `mh-peto/tests/sanity.spec.mjs` (Playwright on Chromium) after retrofit.
