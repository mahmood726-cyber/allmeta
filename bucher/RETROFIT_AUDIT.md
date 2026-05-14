# bucher — Cycle 2.7 retrofit audit

**Date:** 2026-05-14
**Auditor:** Cycle 2.7 implementer subagent
**Method:** full source read (163-line single-file app, pre-retrofit)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | Data entry is two fixed fieldsets (dAC, seAC, dBC, seBC). No `<input type="file">` anywhere. The shared `csv-upload.js` module adds RFC-4180 parsing — wire it in to allow uploading a pairwise CSV (`treat1,treat2,TE,seTE` columns). |
| Chart download | present-good | No SVG download button exists. The forest plot is `<svg id="plot">` assembled via `innerHTML`. Wire in `chart-download.js`. |
| Axis controls | absent | No x-axis min/max inputs. The plot domain is auto-computed from CI extremes. Wire in `axis-controls.js`. |
| Results export | absent | No export button. Indirect estimate + SE + CI + p are computed but not downloadable. Wire in `results-export.js`. |
| URL state | absent | No `location.hash`, `URLSearchParams`, `pushState`, or `replaceState` anywhere. Wire in `url-state.js`. |
| Reset/undo | absent | No reset button and no undo stack. Wire in `reset-undo.js`. |
| Tooltips | absent | No `data-gloss` attributes. Wire in `tooltips.js` with `data-gloss` on the scale label and CI formula. |

## Modules to wire in (all 7 absent)

- `csv-upload.js` — fixed numeric fieldset only; no CSV file input
- `chart-download.js` — no download buttons; SVG forest rendered inline
- `axis-controls.js` — no x-axis range inputs
- `results-export.js` — no export; indirect estimates computed but not downloadable
- `url-state.js` — no shareable URL; no persistence
- `reset-undo.js` — no reset button and no undo stack
- `tooltips.js` — no glossary integration

## Modules to skip

None — all 7 are absent and need wiring.

## R-parity

**Engine:** Bucher (1997) closed-form indirect treatment comparison. Given pooled direct
estimates d(AB) and d(AC) (sharing common comparator A), the indirect BC estimate is:

    d_indirect(BC) = d(AC) − d(AB)
    se_indirect(BC) = √(se(AC)² + se(AB)²)

The JS engine performs this computation directly from user-supplied per-arm effect + SE
inputs. For the R-parity fixture, the AB and AC arms are pooled via fixed-effect
inverse-variance weighting first (matching the multi-study scenario), then the Bucher
formula is applied. `netmeta::netmeta()` is used as a cross-check on the indirect
component.

- **Cycle 7.2 override removed**: the `kind: non-numerical` override for `bucher` is
  retired from `triage/triage-overrides.yaml`.
- Fixture: `tests/fixtures/bucher-tiny.csv` (5 rows: `study,treat1,treat2,TE,seTE`;
  triangle network A-B, A-C, B-C with 2 AB studies, 2 AC studies, 1 BC study).
- R script: `tests/fixtures/bucher-tiny.R` (FE pooling of AB and AC, then Bucher
  closed-form; cross-checked with `netmeta::netmeta()`).
- Values captured 2026-05-14 (R 4.5.2, netmeta 3.2-0):
  - `mu_ab           = -0.2909502262443439`  (pooled AB, FE)
  - `se_ab           =  0.07399400733959438`
  - `mu_ac           = -0.4915294117647059`  (pooled AC, FE)
  - `se_ac           =  0.09111079228383559`
  - `mu_bc_indirect  = -0.200579185520362`   (Bucher indirect BC = AC − AB)
  - `se_bc_indirect  =  0.1173724396643445`
  - `lo_bc_indirect  = -0.4306249400400776`  (z95 × se)
  - `hi_bc_indirect  =  0.02946656899935363`
  - `p_bc_indirect   =  0.08746722782258598` (two-sided)
  - `te_indirect_nm  = -0.2005791855203728`  (netmeta cross-check)
  - `se_indirect_nm  =  0.1173724396643451`  (netmeta cross-check)
- Tolerance: `1e-6`
- netmeta agreement: |te_indirect_nm − mu_bc_indirect| = 9e-15 ✓

## Browser sanity

Verified via `bucher/tests/sanity.spec.mjs` (Playwright on Chromium) after retrofit.
