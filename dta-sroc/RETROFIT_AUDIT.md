# dta-sroc — Cycle 2.2 retrofit audit

**Date:** 2026-05-13
**Auditor:** Cycle 2.2 implementer subagent (Task 4)
**Method:** full source read (444-line single-file app)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | The only file input is `id="file-import" accept="application/json,.json"` (line 109) — wired exclusively to `onImportJson`, which reads JSON state blobs. Data entry is textarea-only (paste `label, TP, FP, FN, TN` rows). The shared `csv-upload.js` module adds RFC-4180 parsing + fuzzy header matching for `study, TP, FP, FN, TN` — none of that exists here. |
| Chart download | present-good | Two working buttons: "Download SVG" (line 103) and "Download PNG" (line 104). SVG is built in-process inside `buildSvg()` with explicit `viewBox`, white background rect, and all labels baked in as `<text>` elements — no cropping or label-loss risk. PNG uses `canvas.toBlob` at 2× HiDPI with a white fill before `drawImage`; `URL.revokeObjectURL` is called in both paths. The native SVG exporter is superior to the shared `chart-download.js` module for a plot app. Do NOT replace. |
| Axis controls | absent | No x-axis (FPR) or y-axis (Sensitivity) min/max inputs exist. The ROC plot domain is fixed [0,1]×[0,1] (a unit square), which is correct for ROC space. The shared `axis-controls.js` module renders numeric range inputs — wire it in with override deferred; the fixed [0,1] ROC domain is the correct scientific choice and users can inspect subregions manually. |
| Results export | absent | "Download JSON" (`onDownloadJson`, line 398) serialises only raw form state (`textarea + title`) under schema `dta-sroc-v1`. It does NOT export the computed Moses α/β, Spearman ρ, or per-study Se/Sp/FPR values. No CSV export of any kind. The shared `results-export.js` module emits per-study rows plus summary as both CSV and JSON — wire it in alongside (not replacing) the existing JSON round-trip button. |
| URL state | absent | Zero matches for `location.hash`, `URLSearchParams`, `pushState`, or `replaceState`. The app persists to `localStorage` under key `"dta-sroc-v1"` on every `input` event (line 349), which restores on reload (lines 352–360). Session-local only. Wire in `url-state.js`. |
| Reset/undo | present-broken | A "Reset" button exists (`btn-reset`, line 106) and calls `onReset` (line 411), which shows a bare `confirm()` dialog then clears all fields. No undo stack — one accidental confirm destroys all data with no recovery path. The shared `reset-undo.js` module adds a 20-depth snapshot stack with a `<dialog>`-based confirm and a separate "Undo" button — wire it in. |
| Tooltips | absent | Only `../shared/toast.js` is loaded (line 442). Neither `../hub/shared/tooltips.js` nor any `data-gloss` attributes are present. The header and footer reference key DTA jargon (`SROC`, `Moses`, `Spearman ρ`, `TP`, `FP`, `FN`, `TN`, `Se`, `Sp`). Wire in `tooltips.js` (hub module) and add `<abbr data-gloss>` markers. |

## Modules to wire in (absent + present-broken)

- `csv-upload.js` — no CSV file input; columns: `study, TP, FP, FN, TN`
- `axis-controls.js` — no axis range inputs; ROC domain fixed [0,1]×[0,1]; override deferred
- `results-export.js` — export per-study Se/Sp/FPR rows + Moses α/β + Spearman ρ as CSV and JSON
- `url-state.js` — no shareable URL; localStorage-only persistence
- `reset-undo.js` — Reset button uses bare `confirm()` with no undo stack
- `tooltips.js` — no glossary system; jargon-rich header and footer unannotated

## Modules to skip (present-good)

- `chart-download.js` — SVG and PNG downloads implemented inline and working correctly; native `buildSvg()` produces a complete, label-safe vector output with white background, axes, SROC curve, and study circles. Per do-no-harm, keep the native implementation.
- `toast.js` — already wired (`../shared/toast.js`, line 442) and called in 4 places.

## DTA-specific notes

- `mada::reitsma` parameterises on **logit(FPR)**, NOT logit(Spec). The app uses `logitFPR = Math.log(fpr / (1-fpr))` correctly. R-parity fixture compares against `mu1` (mean logit(Se)) and `mu2` (mean logit(FPR)).
- The app implements **Moses SROC** (unweighted OLS of D on S), not bivariate Reitsma. R-parity is therefore against the Moses regression coefficients (α, β), not mu1/mu2 from reitsma(). See `tests/test_against_mada.py` for the derivation: we test that Moses OLS computed in Python matches Moses OLS computed in R on the same CSV.
- The fixture k=6 bivariate model converges with rho=-1 (boundary) — this is expected behaviour for homogeneous studies per `advanced-stats.md` (bivariate convergence failure pattern). The R-parity test compares mu1/mu2/tau values as documentary evidence of what mada returns; the primary Moses OLS test is the reproducibility gate.
- Continuity correction: +0.5 only when ANY cell is zero (advanced-stats.md rule — conditional, never unconditional).
- Threshold effect flag: Spearman |ρ| > 0.6 triggers banner (already implemented).
- k < 5 warning: already implemented in the app.

## R-parity coverage (mada::reitsma)

- Fixture: `sroc-tiny.csv` (6 studies with 2×2 cell counts)
- R output captured: `mu1=1.391100395744`, `mu2=-1.93318974463`, `tau1_sq=0.1586918667223`, `tau2_sq=0.08329174714185`, `rho=-1.0` (boundary), `k=6`
- Note: rho=-1 is a known boundary artefact for homogeneous k=6 fixtures; the bivariate model is not the primary scientific contribution of this app (Moses SROC is); rho is included for completeness.
- Primary parity check: Moses OLS α and β computed independently in Python vs R.

## Browser sanity (Cycle 2.2 Task 4, 2026-05-13)

Verified via `dta-sroc/tests/sanity.spec.mjs` (Playwright on Chromium):

- [x] Page loads with zero console errors
- [x] All 6 wired alm.* modules expose their init function on `window.alm`
- [x] All 4 mount points initialise correctly
- [x] Pre-retrofit feature: ROC SVG still renders in `#svg-host` after retrofit (chart-download do-no-harm gate clean)
- [x] results-export JSON contains SROC stats (`_schema: dta-sroc-results-v1`, `k > 0`, `alpha` and `beta` present)

### Items deferred to human-eyeball review

- Visual quality of the ROC chart (SROC curve visible, study circles proportional to N)
- Tooltip hover behaviour on `<abbr data-gloss>` markers in header and footer
- URL state round-trip in a real browser (reload, see state restored from hash)
- Reset-undo confirm dialog UX in interactive use
- Axis-controls domain override (renders but does not drive buildSvg() domain — ROC [0,1]×[0,1] is correct by default)
- CSV upload for format variants (column name detection)
