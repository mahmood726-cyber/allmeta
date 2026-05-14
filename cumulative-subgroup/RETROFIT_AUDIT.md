# cumulative-subgroup — Cycle 2.7 retrofit audit

**Date:** 2026-05-14
**Auditor:** Cycle 2.7 Task 2 implementer subagent
**Method:** grep heuristic + full source read (651-line single-file app, pre-retrofit)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | Data entry is textarea-only (`id="f-data"`). No `<input type="file">` wired to `alm.csvUpload`. The shared `csv-upload.js` module adds RFC-4180 parsing — wire it in. |
| Chart download | absent | Download buttons (SVG/PNG) are hand-coded via `downloadBlob` rather than via the shared `chart-download.js` module. Replace with the shared module for consistency. |
| Axis controls | absent | No `alm-axis-mount` or `alm.axisControls` call. The cumulative view's y-axis is auto-computed; the shared `axis-controls.js` module adds override inputs — wire it in. |
| Results export | absent | JSON download is hand-coded via `onDownloadJson`. No `alm-export-mount`. The shared `results-export.js` module standardises this — wire it in. |
| URL state | absent | State is persisted via `localStorage` only; no `URLSearchParams`/`location.hash`. The shared `url-state.js` module adds shareable URL encoding — wire it in. |
| Reset/undo | absent | Reset button (`#btn-reset`) uses a `confirm()` dialog with no undo stack. The shared `reset-undo.js` module adds a 20-depth snapshot stack — wire it in. |
| Tooltips | absent | No `data-gloss` attributes, no glossary import. Added `data-gloss="tau2"` and `data-gloss="i2"` to stat cards. The shared `tooltips.js` module + `glossary.json` covers these terms — wire it in. |

## Modules to wire in (all 7 absent)

- `csv-upload.js` — textarea-only data entry; no CSV file input
- `chart-download.js` — SVG/PNG download hand-coded, not using shared module
- `axis-controls.js` — no x-axis range inputs for cumulative or subgroup view
- `results-export.js` — no export; pooled estimates computed but not via shared module
- `url-state.js` — no shareable URL; localStorage-only persistence
- `reset-undo.js` — no undo stack; bare `confirm()` reset only
- `tooltips.js` — no glossary integration

## Modules to skip

None — all 7 are absent and need wiring.

## R-parity

**Engine note:** The JS engine's cumulative pooling (`cumulative()` function) sorts studies
by year (if all have years) then computes `pool(subset)` at each prefix step using
Paule-Mandel tau² via bisection. The final cumulative pooled estimate equals a full-data
RE pool on all studies. This maps exactly to `metafor::cumul(rma(yi, vi, method="PM"), order=year)`.

- **Cycle 7.2 override removed**: the `kind: non-numerical` override for `cumulative-subgroup`
  is retired from `triage/triage-overrides.yaml`.
- Fixture: `tests/fixtures/cumul-tiny.csv` (5 rows: `study,year,yi,vi` spanning 2010–2020).
- R script: `tests/fixtures/cumul-tiny.R` — calls `metafor::cumul(rma(..., method="PM"), order=year)`
  and emits the final and penultimate cumulative pooled estimates + full-data tau²/I²/Q.
- Values captured 2026-05-14 (R 4.5.2, metafor):
  - `mu_final  = -0.3432098765432097`
  - `se_final  =  0.08606629658238701`
  - `lo_final  = -0.511896718127431`
  - `hi_final  = -0.1745230349589884`
  - `mu_penu   = -0.3403508771929825`
  - `se_penu   =  0.1025978352085154`
  - `lo_penu   = -0.5414389390934481`
  - `hi_penu   = -0.1392628152925168`
  - `tau2      =  0` (PM converges to 0; fixture Q=1.673 < df=4)
  - `i2        =  0`
  - `Q         =  1.672942386831276`
  - `k         =  5`
- Tolerance: `1e-6`
- Note: tau2=0 means PM bisection floor (`if q0 <= target: return 0`) matches metafor
  exactly; the parity test exercises both the final and penultimate sequential code paths.

## Browser sanity

Verified via `cumulative-subgroup/tests/sanity.spec.mjs` (Playwright on Chromium) after retrofit.
