# Multiple-moderator validation

This extension is confined to `#alm-plus`. It fits ML meta-regression with two
or three numeric moderator columns, optionally adding the product of the first
two. The additive comparison adds the remaining moderators to a model with the
first moderator; the interaction comparison adds that product to the additive
model. Both fits use exactly the entered rows. Invalid or missing entries refuse
the entire analysis. An intercept is always included. Indicator columns can
represent categorical variables; automatic factor coding is not implemented.

Meta-regression has no in-app original Validate panel or `validate/MANIFEST.json`;
the paper's original validation is the public archive
`mahmood726-cyber/metaregression-reproducible` (v1.0.0, app commit `e47acf1`).
Its browser runner (`bench/run_app.cjs`, same extraction code, Edge) was replayed
over all 1,742 archive configurations on three trees: the archived `e47acf1`
bytes, `main` at `da66b89`, and this branch. Scored with the archive's own strict
comparator (`analysis/checks.py`), each gives **129,867/129,903** primary checks
(the same 36 documented differences, none unexpected) and 82,680/91,515
experimental location-scale checks, and every one of the 1,742 extracted records
(estimates, cards, SVG coordinates, permutation and LS results) is identical
across the three trees. The `shared/ma-core.js` REML change on `main` therefore
does not alter this app's outputs on that corpus (the app uses only
`predictionInterval` from that file). The original seven inline scripts are
unchanged, and two computation/serialised-DOM scenarios match exactly before and
after loading the extension. The existing external Validate (R) button remains.

## Reference calculation

`reference.R` independently uses `metafor::rma(..., method="ML", test="z")`,
`anova.rma`, `logLik`, `AIC`, `BIC`, `predict.rma`, and `weights.rma`. AIC and
BIC are the ML fit statistics, counting the heterogeneity parameter. LRT degrees
of freedom are the difference in coefficient counts. The prediction grid has
41 points spanning the first moderator, with the other moderators held at their
arithmetic means. Confidence intervals describe the fitted mean, not prediction
intervals for new studies. Bubble area is proportional to ML weight; observed
effects are unadjusted. This implements the quantities used in a regression
plot; it does not reproduce `regplot`'s graphical size defaults.

Desktop versions: metafor 5.2-1 (printed by `packageVersion` as 5.2.1), metadat
1.6.0, jsonlite 2.0.0; R 4.6.0. No packages were installed for this task.
The generator enforces these package versions and logs `.libPaths()` and versions.
Fisher scoring uses `stepadj=0.5`, `maxiter=10000`, and the absolute tau-squared
change threshold `1e-12 * max(1, var(yi))`. R's boundary likelihood check and
raw model-matrix eigenvalue threshold `evtol=1e-7` are retained. A preliminary
standardised-design rank check refuses redundant columns instead of silently
dropping coefficients. The JavaScript implementation uses reorthogonalised
weighted QR, with internal centring/scaling, and separate normal/chi-square tail
calculations. No fitted results or dataset identifiers enter the estimator.

Closed quantities (grid and moderator means) compare within
`1e-9 * max(1, abs(reference))`. Iterative fit outputs, including quantities
depending on estimated tau-squared, use the corresponding bound with `1e-6`.
Every p-value uses absolute `1e-9`. Counts, vector lengths, model terms, status
and refusal reasons compare exactly. Output fields and array shapes are also
checked. Displayed values use 12 significant digits; JSON exports preserve the
computed doubles and include all prediction-grid and weight values.

## Corpus and counts

`plus/candidates.json` accounts for all 114 metadat entries, with 126 outcome
candidate records. Explicit precomputed effect/variance pairs and supported
raw-data contrast mappings are in `generate-plus.R`. No variable meaning is
inferred from numeric values. Each candidate lists available and selected numeric
moderators, row exclusions and sampling. Datasets without an unambiguous supported
contrast or two varying numeric moderators are excluded with a reason; nested,
network, diagnostic and specialised structures are not converted automatically.
The first three eligible moderators are chosen using the documented priority
list, then column-name ordering. This is a numerical test corpus, not a set of
recommended substantive analyses; some datasets contain dependent effects.

Each configuration retains the first 80 complete finite rows in source order.
Rows omitted by that bound are listed separately from incomplete/invalid rows.
There are 194 configurations from 43 datasets, 5,972 configuration-row uses and
1,601 distinct dataset/row pairs. Coverage is 54 two-moderator additive, 54
two-moderator interaction, 43 three-moderator additive and 43 three-moderator
interaction configurations. R produces 162 fitted results and 32 refusals:
24 fail the raw model-matrix gate, four lack residual degrees of freedom and
four have redundant moderator columns. All refusals match exactly.

The manifest pins **52,573 numerical/structural checks** plus **194 aggregate
render checks**, giving **52,767** expected panel checks. Numerical tests pass
52,573/52,573. The DOM harness passes 356 checks (194 displays and 162 JSON
exports), 104,952 numerical/structural negative probes, and 251 display negative
probes. All 162 fitted plots also pass independent SVG coordinate/weight checks
against R; four deliberate point, curve, band and radius corruptions fail those
checks. These are serialised SVG checks, not browser paint checks. The suite also
runs invalid-input and singular-design assertions. Desktop R
executes the generated live-panel script for four successful model shapes and
one refusal: 1,301/1,301 quantities match. This last result tests the R script
protocol, **not webR execution**.

In Edge 155 (Playwright 1.64, `--workers=1`) the panel's full replay passes
**52,767/52,767** checks, and all seven tests in
`hub/shared/tests/meta-regression-plus.spec.mjs` pass, including the 57 plot
corruptions, the SHA-256 tamper rejection and the live webR tier (local webR
0.5.5 bundle and pinned metafor, served same-origin with no external network).
`meta-regression-usability.spec.mjs` adds five tests (one-click example,
row/column-specific refusals, keyboard fitting, axe WCAG 2 A/AA scan and 375 px
layout), each with a planted negative.

## The validation panel

“Validate the extras in R” uses the existing `shared/alm-validate.js` framework,
without changing that shared file. Its live tier supplies the current rows to
the metafor routines supported by the shared webR tier (metafor 4.8-0); package
versions and any differences are reported by the framework. Its replay tier fetches or accepts the pinned JSON
files, verifies SHA-256 against embedded pins, and then recomputes each fit and
render. Cached verified files can be replayed without a network connection;
file mode uses the framework's file picker. Hashes are on UTF-8 LF bytes.
The replay restores the user's inputs, result and control state in a `finally`
block. Original inputs, outputs, storage and URL state are not written.

## Plot contract and scope

The panel checks coefficient and summary values, their row/column association,
labels, refusals, held moderator values, and the plotted bubbles, regression
line, confidence band, tick marks and titles. Numerical results are compared to
R independently of the render contract. The latter creates a clean reference
render with a captured renderer and stylesheets in a closed shadow tree, in the
same browser. It compares structure, effective screen bounds and every curve
vertex within 0.02 CSS pixels. Computed CSS properties compare against the clean
render, excluding custom properties and non-paint cursor/origin metadata.
Ancestor hiding, opacity and clipping are checked separately. This uses DOM and
style geometry; it is not screenshot-based occlusion detection.
Separately, study marks calibrate the data-to-coordinate mapping, and every
curve/band vertex is inverted back to its R-validated value. Bubble area ratios
are checked against R weights; this does not depend on the renderer's scale
function.

Axis scales are inferred from the entered study marks supplied to R, using their
effective screen positions. Two distinct marks must span at least 0.02 CSS pixels.
Tick text uses six significant digits and allows half a final digit plus a
floating-point cancellation allowance. If marks do not determine a scale, the
axis label values are reported as **not checked**, rather than inferred from
renderer metadata. The browser suite includes clean light/dark and narrow/wide
views, and 57 plot corruptions covering every plotted role; all pass in Edge.

The panel does **not resist CSS deliberately injected into the page**. It does
not validate every prose statement, arbitrary page tampering, clinical
appropriateness, dependent-study modelling, or untested input configurations.
The reference renderer is captured at initialisation; it is not a security
boundary against changes made before that capture. In file mode, stylesheets
whose rules the browser disallows reading cannot be copied into the reference;
file-mode plot acceptance also needs browser verification.

## Reproduction

From the repository root in PowerShell:

```powershell
$env:R_LIBS_USER='<library containing metafor 5.2-1 and metadat 1.6-0>'
$env:R_LIBS='<library containing jsonlite>'
$env:R_ENVIRON_USER='NUL'
& <R 4.6.0>/bin/Rscript.exe meta-regression/validate/generate-plus.R
node meta-regression/validate/check-numeric.mjs
node meta-regression/validate/pin-plus.mjs
```

The DOM harness requires `linkedom`; set `LINKEDOM_MODULE` to its `esm/index.js`
if it is not installed in the normal module search path (for example
`npm install --no-save linkedom` in `hub/shared/tests`); it is not a runtime app
dependency.

```powershell
node --test-isolation=none --test meta-regression/validate/numeric.test.mjs
node meta-regression/validate/baseline-dom.mjs after-dom
node meta-regression/validate/check-live-script.mjs build
& <R 4.6.0>/bin/Rscript.exe meta-regression/validate/plus/live-protocol.R 2>&1 | Out-File -Encoding utf8 meta-regression/validate/plus/live-protocol.log
node meta-regression/validate/check-live-script.mjs
```

Keep `baseline-dom.json` unchanged: it was captured before the page edit.
`baseline.mjs` is an optional browser counterpart; the stronger before/after
evidence is the archive replay described above. `baseline-dom.mjs` loads the extras for the after comparison but
uses a minimal validation-widget mount in the DOM emulator.

From `hub/shared/tests`, with dependencies installed:

```powershell
$env:PW_CHANNEL='msedge'
npx playwright test meta-regression-plus.spec.mjs meta-regression-usability.spec.mjs --workers=1 --reporter=list
```

The repository Playwright configuration serves port 8088. Include `--grep-invert
@slow` to skip the live webR test, which boots the same-origin webR bundle in
`r-shiny/shinylive/webr/` (about two minutes). On a heavily loaded machine the
default 30 s per-test timeout can be exceeded by page loading alone; pass
`--timeout=120000` in that case.
