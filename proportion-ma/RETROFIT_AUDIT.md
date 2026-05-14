# proportion-ma — Cycle 2.6 retrofit audit

**Date:** 2026-05-14
**Auditor:** Cycle 2.6 implementer subagent
**Method:** grep heuristic + full source read (379-line single-file app, pre-retrofit)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | Data entry is textarea-only (`id="src"`, `events, n, label`). No `<input type="file">` anywhere. The shared `csv-upload.js` module adds RFC-4180 parsing with fuzzy header matching — wire it in. |
| Chart download | absent | No download button of any kind. The forest SVG is assembled via `innerHTML` into `<svg id="forest">`. The shared `chart-download.js` module adds SVG + PNG + PDF download buttons — wire it in. |
| Axis controls | absent | No x-axis min/max inputs. The plot domain is auto-computed from per-study CI extremes. The shared `axis-controls.js` module adds numeric min/max fields — wire it in. |
| Results export | absent | No export button. Pooled `poolP`, `tau2`, `Q`, `I²` are computed but not downloadable. The shared `results-export.js` module emits these as CSV and JSON — wire it in. |
| URL state | absent | No `location.hash`, `URLSearchParams`, `pushState`, or `replaceState` anywhere. The shared `url-state.js` module adds shareable URL encoding — wire it in. |
| Reset/undo | absent | No reset button and no undo stack. The shared `reset-undo.js` module adds a 20-depth snapshot stack — wire it in. |
| Tooltips | absent | No `data-gloss` attributes, no glossary import. Added `data-gloss="tau2"` and `data-gloss="i2"` to the heterogeneity display and τ² selector label. The shared `tooltips.js` module + `glossary.json` covers these terms — wire it in. |

## Modules to wire in (all 7 absent)

- `csv-upload.js` — textarea-only data entry; no CSV file input
- `chart-download.js` — no download buttons; SVG forest rendered inline
- `axis-controls.js` — no x-axis range inputs
- `results-export.js` — no export; pooled estimates computed but not downloadable
- `url-state.js` — no shareable URL; no persistence at all
- `reset-undo.js` — no reset button and no undo stack
- `tooltips.js` — no glossary integration

## Modules to skip

None — all 7 are absent and need wiring.

## R-parity

**Engine note:** The JS engine supports three transforms: Freeman-Tukey double-arcsine
(`ft`), logit, and raw. R-parity is established for the **logit** transform, which
matches `metafor::escalc(measure="PLO")` exactly (Cochrane Handbook §10.4.4 / Sweeting
2004 continuity correction at zero/complete cells). The τ² estimator used for parity is
**Paule-Mandel (PM)** — the app's default, per advanced-stats.md DL-bias rule.

The R script (`prop-tiny.R`) replicates the identical logit+PM algorithm so the test
asserts genuine JS↔R numeric equivalence (not `metafor::rma(method="REML")`, which is a
different estimator).

- **Cycle 7.2 override removed**: the `kind: non-numerical` override for `proportion-ma`
  is retired from `triage/triage-overrides.yaml`.
- Fixture: `tests/fixtures/prop-tiny.csv` (5 rows: `study,events,total` with varied
  proportions; range 8%–9.5% observed p across studies).
- R script: `tests/fixtures/prop-tiny.R` (logit+PM replication — NOT `rma()` REML).
- Values captured 2026-05-14 (R 4.5.2):
  - `mu_re   = -2.365861008193144` (logit scale)
  - `seRE    =  0.135031558107719`
  - `tau2    =  0` (PM converges to 0 for this homogeneous fixture)
  - `Q       =  0.167046675471034`
  - `i2      =  0`
  - `poolP   =  0.085813284563040` (back-transformed to proportion scale)
  - `poolLo  =  0.067199668149742`
  - `poolHi  =  0.108980324369442`
- Tolerance: `1e-6`
- Python pre-verification: values match to float rounding (confirmed via `python -c` cross-check session 2026-05-14).

## Transform used by the engine

The engine implements all three transforms in parallel (user selects via `<select id="trans">`):
- **Logit**: `ln(p/(1-p))` with Sweeting 2004 correction — R-parity target.
- **Freeman-Tukey (FT)**: `½(arcsin√(x/(n+1)) + arcsin√((x+1)/(n+1)))`, v=`1/(4n+2)`, Barendregt-Doi back-transform with harmonic mean of n.
- **Raw**: direct proportion with `v = max(p(1-p)/n, 1e-8)`.

## Browser sanity

Verified via `proportion-ma/tests/sanity.spec.mjs` (Playwright on Chromium) after retrofit.
