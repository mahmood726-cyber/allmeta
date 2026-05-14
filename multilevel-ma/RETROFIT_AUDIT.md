# multilevel-ma — Cycle 2.6 retrofit audit

**Date:** 2026-05-14
**Auditor:** Cycle 2.6 implementer subagent
**Method:** grep heuristic + full source read (296-line single-file app)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | Data entry is textarea-only (`id="src"`, line 58). Format: `study, effect, SE, label`. No `<input type="file">` anywhere. The shared `csv-upload.js` module adds RFC-4180 parsing with fuzzy header matching — wire it in. |
| Chart download | absent | No download button of any kind exists. The forest SVG is drawn inline into `<svg id="forest">` via `innerHTML` assembly. The shared `chart-download.js` module adds SVG + PNG + PDF download buttons — wire it in. |
| Axis controls | absent | No x-axis min/max inputs or log-scale toggle. The plot domain is auto-computed from CI extremes with 10% pad. The shared `axis-controls.js` module adds numeric min/max fields + log toggle — wire it in. |
| Results export | absent | No export button of any kind. Pooled `mu`, `tau2_study`, `tau2_within`, HKSJ SE are computed but never downloadable. The shared `results-export.js` module emits these as CSV and JSON — wire it in. |
| URL state | absent | No `location.hash`, `URLSearchParams`, `pushState`, or `replaceState` anywhere. No `localStorage` either. The shared `url-state.js` module adds shareable URL encoding — wire it in. |
| Reset/undo | absent | No reset button and no undo stack. A bare `<button id="btn-run">Fit</button>` triggers the engine but there is no way to revert to the previous state. The shared `reset-undo.js` module adds a 20-depth snapshot stack — wire it in. |
| Tooltips | absent | No `data-gloss` attributes, no glossary import, no `window.Glossary` or `window.Tooltips` call. The shared `tooltips.js` module + `glossary.json` covers tau2, I², heterogeneity terms — wire it in. |

## Modules to wire in (all 7 absent)

- `csv-upload.js` — textarea-only data entry; no CSV file input
- `chart-download.js` — no download buttons; SVG forest rendered inline
- `axis-controls.js` — no x-axis range inputs or log toggle
- `results-export.js` — no export; pooled estimates computed but not downloadable
- `url-state.js` — no shareable URL; no persistence at all
- `reset-undo.js` — no reset button and no undo stack
- `tooltips.js` — no glossary integration

## Modules to skip

None — all 7 are absent and need wiring.

## R-parity

**Engine note:** The JS engine uses iterated method-of-moments (MoM) per Cheung (2014)
/ Raudenbush style — explicitly NOT REML. The footer states: "Implementation here:
iterated method-of-moments per Cheung MWL. Psychol Methods 2014;19:211–229 — NOT REML".
Therefore `metafor::rma.mv(method='REML')` is NOT the correct parity target; it would
give different variance components. The R parity script (`mlma-tiny.R`) replicates the
identical MoM algorithm in R, ensuring the test asserts genuine JS<->R numeric equivalence.

- **Cycle 7.2 override removed**: the `kind: non-numerical` override is retired.
- Fixture: `tests/fixtures/mlma-tiny.csv` (6 rows, 3 studies × 2 effects each; `study,effect,SE,label`).
- R script: `tests/fixtures/mlma-tiny.R` (pure MoM replication — NOT rma.mv REML).
- Values captured 2026-05-14: `mu = 0.31308364`, `tau2_study = 0.01266049`, `tau2_within = 0`.
- Tolerance: `1e-6`.

## Browser sanity

Verified via `multilevel-ma/tests/sanity.spec.mjs` (Playwright on Chromium) after retrofit.
