# hsroc — Cycle 2.7 retrofit audit

**Date:** 2026-05-14
**Auditor:** Cycle 2.7 Task 3 implementer subagent
**Method:** full source read (279-line single-file app)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | The textarea expects `TP, FP, FN, TN, label` (comma-separated, no header row). No file input exists. The shared `csv-upload.js` module adds RFC-4180 parsing + fuzzy header matching for `study, TP, FP, FN, TN`. Wire in. |
| Chart download | absent | No SVG/PNG download buttons exist. The SROC plot renders via `svg.innerHTML` assignment into `#sroc`. The shared `chart-download.js` adds native SVG and PNG export. Wire in. |
| Axis controls | absent | ROC domain is hard-coded [0,1]×[0,1] (correct for ROC space). The shared `axis-controls.js` renders range inputs — wire in with override deferred. |
| Results export | absent | No export mechanism. Summary stats (muSe, muFPR, tauSe², tauFPR², ρ) computed but not exportable. Wire in `results-export.js`. |
| URL state | absent | No `location.hash`, `URLSearchParams`, `pushState`, or `replaceState`. Wire in `url-state.js`. |
| Reset/undo | absent | No reset button at all. Wire in `reset-undo.js`. |
| Tooltips | absent | No `data-gloss` attributes or glossary system. Header and footer reference DTA jargon (Se, Sp, FPR, HSROC, ρ). Wire in `tooltips.js`. |

## Modules to wire in (all 7)

- `csv-upload.js` — columns: `study, TP, FP, FN, TN`
- `chart-download.js` — SVG/PNG export of the SROC plot
- `axis-controls.js` — ROC domain [0,1]×[0,1]; override deferred
- `results-export.js` — export per-study Se/Sp/FPR + bivariate summary
- `url-state.js` — shareable URL via hash
- `reset-undo.js` — undo stack + dialog-confirmed clear
- `tooltips.js` — glossary hover on DTA/HSROC jargon

## Modules to skip

None — all 7 modules absent or missing.

## Engine parameterisation

The JS engine uses **logit(FPR)** throughout:
  `logitFPR = Math.log(fpr/(1-fpr))` where `fpr = 1 - sp`

This matches `mada::reitsma` parameterisation exactly:
  `mu1` = mean logit(Se), `mu2` = mean logit(FPR)

No sign-flip needed between the JS engine and mada output.

## R-parity approach

The JS engine implements a **Harbord-Whiting-style DL approximation** (alternating
univariate DerSimonian-Laird + empirical correlation), NOT full bivariate REML.
These produce different mu1/mu2/rho values than `mada::reitsma` (REML) — testing
JS against mada at tol=1e-6 is not meaningful.

**Primary R-parity gate**: verify the fixture values by running `mada::reitsma` live
and confirming our pinned expected values match R's output at tol=1e-6. This documents
the canonical bivariate model output for the fixture and validates that mada is available
and behaves as expected.

**Secondary gate**: direct formula test of the JS DL approximation using Python arithmetic
(no subprocess), confirming the JS engine logic is arithmetically correct.

## Fixture

- `hsroc-tiny.csv`: 7 heterogeneous studies with wide Se/Sp spread (no boundary convergence)
- R output captured: `mu1=1.428039825037`, `mu2=-1.898869844426`,
  `tau1_sq=1.015957863695`, `tau2_sq=0.5762041201539`, `rho=-0.8844495722827`, `k=7`
- rho=-0.884 is well within (-1, +1); no boundary artefact.
- Fixture studies have deliberate Se/Sp trade-offs to induce negative threshold-effect ρ.

## Override removed

Cycle 7.2 `non-numerical` override for `hsroc` removed from `triage/triage-overrides.yaml`.

## Browser sanity (Cycle 2.7 Task 3, 2026-05-14)

Verified via `hsroc/tests/sanity.spec.mjs` (Playwright on Chromium).

- [x] Page loads with zero console errors
- [x] All 7 wired alm.* modules expose their init function on `window.alm`
- [x] SROC SVG renders in `#sroc` after retrofit
- [x] results-export JSON contains `hsroc-results-v1` schema with bivariate fields

### Items deferred to human-eyeball review

- Visual quality of the SROC plot (curve, summary point, CI rectangle)
- Tooltip hover behaviour on `<abbr data-gloss>` markers
- URL state round-trip in a real browser
- Reset-undo confirm dialog UX
- Axis-controls domain override (ROC [0,1]×[0,1] is correct by default)
