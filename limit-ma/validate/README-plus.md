# Independent limit-ma sensitivity validation

This panel is separate from the frozen primary limit-ma replay. It contains the
same 169 source configurations. The original corpus, reference, inline engine,
and 55,525-check contract are unchanged.

## Methods and evidence

- RE: `meta::metagen(..., method.tau="DL", method.random.ci="classic")`.
- Limit and diagnostics: `metasens::limitmeta(m, method.adjust="beta0")`.
- Trim-and-fill: `meta::trimfill(m, type="L", ma.common=TRUE)`. Common-effect
  trimming, average ranks for ties, then DL pooling; sensitivity analysis only.
- PET and PEESE: weighted `lm(TE ~ seTE)` and `lm(TE ~ I(seTE^2))`, weights
  `1/seTE^2`, residual variance and t inference with `k-2` degrees of freedom.
- Conditional PET-PEESE: two-sided PET intercept p below alpha selects PEESE;
  otherwise PET. Default alpha 0.10; absolute p/alpha difference below 1e-8
  refuses the decision. This rule is explicit R code, not a packaged R method.
- 3PSM: `metafor::selmodel(rma(TE, vi=seTE^2, method="ML"),
  type="stepfun", steps=0.025)`, default R optimizer controls. The JS path
  reproduces the ML parent's Fisher-scoring stopping rule and BFGS start,
  includes the fixed first selection weight in optimizer dimensionality, and
  removes near-boundary tau-squared from the uncertainty Hessian as R does.
  Empty p-value intervals refuse the fit before optimization.
- Egger: `meta::metabias(m, method.bias="Egger", k.min=10)`.
- Peters: `meta::metabias(metabin(...), method.bias="Peters", k.min=10)`.
  Two existing configurations have verified binary counts: `dat.bcg::001`
  (RR) and `dat.bornmann2007::001` (OR). Their original row indices, effects,
  and SEs are checked against `metadat` source records. All other configurations
  refuse Peters because the generic effect/SE rows carry no verified arm counts.
  The UI supports positive integer event/non-event cells for log OR and log RR;
  it refuses zero cells and counts inconsistent with the entered effects/SEs.
- Q.small and Q.resid p-values use chi-square survival functions, respectively
  with 1 and k-2 degrees of freedom. G-squared is one minus the shrunken radial
  regression R-squared, not a publication-bias probability.

Closed forms use normalized relative error `abs(app-ref)/max(1,abs(ref)) <= 1e-9`,
matching the primary replay's convention. Counts, sides, branches, statuses and
refusal reasons compare exactly. Selection mu/tau-squared/delta/logLik use 1e-6;
SE and confidence endpoints use 1e-4. Every scalar and imputed effect/SE is
compared. Each configuration also checks the rendered numerical output.
A matching refusal is a pass only when its reason also matches. Required refusal
nodes must occur once in each applicable table row and detail block. Branch and
side labels must occur once in their method's detail block; deletion, relocation,
and duplication fail validation.

The rendered forest estimates, CI endpoints and row positions, and funnel study,
shrunken and imputed points, regression curves and contours are read from SVG.
The validator independently derives axis domains from the computed source values,
inverts coordinates, and checks effect/SE values at normalized relative tolerance
1e-9 (unit floor). It also compares effective screen positions (element CTMs,
rendered bounds/endpoints, and text character positions) to the axes' rendered
numeric ticks and source values, within 0.02 CSS pixels for browser rounding.
Paint is checked against a fresh reference rendering of the same configuration and
layer toggles in an offscreen shadow tree in the same page/browser. The
validator captures the clean page template, stylesheets and plot-renderer function
before replay; document CSS selectors cannot enter the shadow tree. HTTP mode
copies the accessible stylesheet rules. In file mode, where linked `cssRules`
are security-restricted, the reference loads clean copies of stylesheet links and
captures the initial document-root custom properties. It awaits
stylesheet loading and finite page entrance animations before enabling validation. No HTTP request is required for
the file-mode path. Document language is preserved in both modes. References
are cached only for the same result object, toggles, viewport and color scheme.
Each SVG node (including the plot root and ancestors of marks) is matched in
render order and compared using **all properties enumerated by getComputedStyle**.
There is no hand-maintained list of paint properties or stored browser-specific
style values. Extra/missing nodes or changed roles fail closed. Cursor differences are ignored because they affect interaction, not plot paint.
Fill properties on straight lines and one-segment tick paths are immaterial
because these roles have no fill area. Other channel properties are compared
only if the reference or actual channel paints: `none`, zero opacity, transparent
color and (for strokes) zero width disable a channel. Enabling visible ink on a
reference-disabled channel still fails. Class, inline and presentation-attribute styles with identical computed
values pass. Geometry, inherited visibility, HTML ancestor opacity/clipping,
viewport intersection and forest row-bound checks remain independent.
These are DOM/style contracts, not pixel-occlusion detection.
This includes independent CSS transforms and SVG text/tspan offsets. The
existing transform and raw-coordinate guards remain. Node and coordinate deletion fail closed. Tests exercise all
16 layer-toggle combinations on all 169 configurations and corrupt/delete
coordinates and nodes for each plotted role and toggle combination.

`shared/selmodel.js` preserves the legacy implementation byte-for-byte (LF).
Only limit-ma loads `plus-selmodel.js` and calls `AlmLimitPlusSelModel`; its ML
start, BFGS optimizer and boundary Hessian cannot alter legacy callers, even when
both engines are loaded. The permanent selmodel corpus test compares every
legacy result field with `fixtures/selmodel-legacy-plus.json` using `Object.is`,
including NaN placement and signed zero, in standalone and plus-loaded contexts.
The spec pins the legacy source SHA-256; tests need neither Git history nor network.
The fixture is generated explicitly with `node scripts/build-selmodel-legacy-fixture.mjs`
from the unchanged legacy engine and the existing plus corpus, never during tests.

The existing primary `dat.hartmannboyce2018::001` mismatch remains unchanged.
The new panel independently runs the convergence check for the internal REML
fit to shrunken effects and refuses the affected limit-derived results, matching
R. This check uses the data, not a dataset identifier or an archived answer.

## Reproduce

Run R from `limit-ma/`. Each script puts `../re/Rlib_dta` first in `.libPaths`.
Set `R_LIBS` to the supplemental library containing metasens/jsonlite, without
an alternative metafor installation; set `R_ENVIRON_USER=NUL` on Windows.
The scripts print and enforce metafor 5.2-1, meta 8.5-0, metasens 1.5-3.
Binary source enrichment used metadat 1.6.0.

```text
Rscript validate/generate-plus.R
Rscript validate/generate-peters.R
Rscript validate/generate-peters-or.R
python validate/pin-plus.py
Rscript validate/verify-plus.R
```

`pin-plus.py` retains the exact original input values and verified binary
metadata, canonicalizes JSON to UTF-8/LF, writes `MANIFEST-plus.json`, and emits
browser pins in `plus-pins.js`. The original manifest is never regenerated.
The browser uses embedded pins, including in file-picker/offline mode.

From `hub/shared/tests`, with the standard port 8088 free or serving this checkout:

```text
node node_modules/@playwright/test/cli.js test limit-ma-plus.spec.mjs validate-limit-ma.spec.mjs validate-integration.spec.mjs trimfill-parity.spec.mjs selmodel-parity.spec.mjs --grep-invert @slow --workers=1 --reporter=line
```

Set `PW_CHANNEL=chrome` where bundled Chromium is unavailable. Python browser
checks can use `PLAYWRIGHT_MODULE` pointing at that installation's `playwright`
module. Live WebR tests marked `@slow` use different package versions and are
not the pinned desktop R oracle used here.

## Static versus dynamic disclosure

| Item | Static/pinned | Recomputed |
| --- | --- | --- |
| Source configurations and binary arm records | Original corpus plus verified metadat rows | No invented studies |
| R reference | Version-checked generator output; SHA-256 on LF bytes | Re-executable with the scripts above |
| Browser results | No cached estimates or dataset-ID branches | Current effect/SE rows, optional counts, selected alpha |
| Numerical controls | R defaults, alpha default, tolerances, plotting samples | Optimizer, Hessian, regressions, pooling and tests |
| Plots and interpretation | Clean renderer/template/CSS; no browser-specific style values | Current results, isolated reference render and all computed properties |

The corpus demonstrates parity on these configurations. It does not show that
any publication-bias method is more accurate, identify bias causally, or validate
arbitrary zero-cell corrections. Small-study tests have low power with few studies.
Implementation sources: [metasens limitmeta](https://github.com/guido-s/metasens/blob/master/R/limitmeta.R) and [meta metabias](https://github.com/guido-s/meta/blob/master/R/metabias.R). Runtime parity uses the installed versions named above, not the moving upstream branches.

## Scope and limits

The Validate panel checks displayed result numbers, refusals and categories, forest method names, both funnel axis titles, tick labels, estimates, intervals, funnel points and curves. Semantic names are defined independently of the renderer. For nonconstant axes, tick values are checked by inverting a least-squares data-to-screen fit, using compensated sums. Forest estimates are checked against the pinned R reference; funnel calibration uses the original study inputs supplied to R. All these calibration marks participate; at least two distinct values must span more than 0.02 CSS px, and fit residuals must be at most 1e-7 CSS px. Label rounding tolerance is half the last significant digit of the renderer's 3-significant-digit format, plus `64 * Number.EPSILON * magnitude * leverage`: magnitude is max(1, absolute data endpoints, absolute inferred value, data span times maximum absolute screen coordinate divided by absolute fitted slope); leverage is `1 + abs(z_tick - mean(z)) * sum(abs(z - mean(z))) / sum((z - mean(z))**2)`, where z normalizes observed data to [0,1]. Exactly zero inferred values receive only the arithmetic allowance. Total tolerance must be less than half a tick interval. Labels must increase and their interval must agree with calibrated screen spacing. Each axis has only two endpoint ticks; no interior-spacing coverage is claimed. Insufficiently separated calibration marks fail closed. Existing coordinate, visibility and computed-style checks remain; style expectations use an isolated same-browser render. These checks do not establish correctness of all prose, arbitrary injected CSS, or every visual detail. Pixel tests cover only the ten configurations below within the stated raster tolerance; smaller semantic changes may pass pixels and require the independent text contract.

The `limit-ma-plus-pixels.spec.mjs` suite pins ten corpus/control configurations and captures every new plot at 1280 x 900, device scale 1, with animations disabled. Playwright `toHaveScreenshot` uses `threshold: 0.2` (per-pixel colour distance) and `maxDiffPixelRatio: 0.005` (at most 0.5% differing pixels), allowing small font rasterisation differences without skipping other browser builds. Reference PNGs are generated locally using Microsoft Edge 155.0.4283.45 (Chromium) on Windows; the same references run in CI. An expected-failure test hides a rendered plot and must fail the same screenshot assertion; an unexpected pass fails the suite. Update references only after reviewing the images.
