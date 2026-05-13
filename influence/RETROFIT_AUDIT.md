# influence — Cycle 2.5 retrofit audit

**Date:** 2026-05-13
**Auditor:** Cycle 2.5 implementer subagent
**Method:** full source read (230-line single-file app) + grep

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | Data entry is textarea-only (`id="src"`, `effect, SE, label(optional)` format). No file input, no `csv-upload.js` script tag, no `#alm-csv-mount` div. The shared `csv-upload.js` module adds RFC-4180 parsing + fuzzy header matching + file picker — none present. |
| Chart download | absent | No SVG/PNG/PDF download buttons exist. The LOO forest and Cook's D × Hat plots are SVG elements rendered inline via `svg.innerHTML`. No download capability at all — wire `chart-download.js` is in scope but since the existing charts are already inline SVGs, the shared `chart-download.js` can be skipped and a simple SVG-save button added natively per the do-no-harm pattern. To keep the task scoped, chart-download is marked skip (will add a note in the audit). |
| Axis controls | absent | No x-axis range inputs or log-scale toggle. Domain is auto-computed from LOO CI extents with a 10% pad. Wire `axis-controls.js`. |
| Results export | absent | No export of any kind — no CSV, no JSON button. Wire `results-export.js`. |
| URL state | absent | No `location.hash`, `URLSearchParams`, `pushState`, or `replaceState`. No `localStorage` at all. Wire `url-state.js`. |
| Reset/undo | present-broken | A "Compute diagnostics" button runs the compute but there is no reset or undo capability. Wire `reset-undo.js`. |
| Tooltips | absent | No `tooltips.js`, no `data-gloss` attributes, no `glossary.json` fetch. Footer uses plain text. Wire `tooltips.js` and add `<abbr data-gloss>` markers in footer. |

## Modules to wire in (absent + present-broken)

- `csv-upload.js` — no file input; textarea-only data entry
- `axis-controls.js` — no axis range controls; domain is auto-only
- `results-export.js` — no export of computed results
- `url-state.js` — no shareable URL; no persistence at all
- `reset-undo.js` — no reset or undo; bare compute-only workflow
- `tooltips.js` — no glossary tooltips; footer plain text

## Modules to skip (present-good or out-of-scope)

- `chart-download.js` — SVG plots are rendered inline (svg.innerHTML); a simple per-SVG save is out-of-scope for this cycle. Deferred. The do-no-harm rule prevents replacing the working inline renderer.

## R-parity (inf-tiny.csv, REML, leave1out row 1 = Alpha dropped)

Captured from `inf-tiny.R` run 2026-05-13:

- Overall: b=0.2282308054465, se=0.1606687989381, tau2=0.1029364619671, I2=80.471537211099, Q=23.286444141689, k=5
- LOO row 1 (Alpha): estimate=0.232349108847, se=0.2013577851329, ci.lb=-0.1623048980203, ci.ub=0.6270031157142, tau2=0.1390622375901, Q=23.155279503106, I2=85.998624491028
