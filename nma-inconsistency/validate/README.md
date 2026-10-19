# NMA inconsistency validation

The panel has two distinct tiers. **Validate this analysis in R** sends the current parsed independent two-arm contrasts and selected FE, DL or PM model to the self-hosted webR packages. **Replay published corpus (stored references)** replays the declared pinned subset below through this page's own parser, engine, renderer and bus importer. The shared button name is retained; the panel explicitly identifies this as a subset of the archived paper comparison.

## Reference and numerical rules

P16 used R 4.6.0, netmeta 3.7-0, metafor 5.2-1, meta 8.5-0 and metadat 1.6-0. Its final patched comparison passed **76,601/76,601 checks over 540 configurations**, with **319/319 separate focused checks**. Refusals establish input support only, not numerical parity for multi-arm data.

The live tier uses the repository's pinned webR 0.5.5 package archives: netmeta 3.4-0 and metafor 4.8-0. Package versions are reported by the shared widget. FE and DL use netmeta; PM solves the uncentred metafor `.QE.func` equation with the contrast design and supplies the resulting tau to netmeta. It does not call centred `rma(..., method="PM", intercept=FALSE)` as an oracle. Splits use back-calculation at the shared tau, with explicit independent-path membership, lexical pair orientation and signed effects. Global random-effects Q uses `decomp.design(..., tau.preset=tau)`, not the default within-design tau. A network without loops has Q=0, df=0 and unavailable p.

FE/DL estimates, SEs, Q and tau² use `abs(App-R)/max(1,abs(R)) <= 1e-9`; PM-derived quantities use `1e-6`. P-values have a separate strict absolute `1e-9` comparison, including PM. Counts, labels, model, membership, refusals and displayed text are exact. The replay also checks complete result structure, including empty arrays. No tolerance is relaxed for a package-version difference.

The live tier rejects unsupported input and results that no longer correspond to the current input or model. It compares all numerical result fields and exact table/global text against the displayed result state, model controls and static page text. The pinned replay additionally checks the entire generated plot. R errors are refusals, never passes. The generated live scripts passed 115 quantities each for FE, DL and PM against native R on the archived Baker OR two-arm input; **the webR browser execution is not yet verified**.

## Declared deterministic replay

**122 configurations / 4,627 checks**, comprising:

- **68 original archived configurations:** first configuration in corpus order for every tuple of model, effect measure, acceptance/reason, availability of closed loops, positive tau², and global p below 0.05.
- **54 supplementary configurations:** each FE/DL/PM model with repeated study IDs, a singular numerical fit, empty bus, unsupported HR/RD bus, each of four multi-arm bus measures, all eight archived OR/RR/MD/SMD bus transformations (ordinary and zero-cell fixtures), and the first accepted archived configuration with its optional study-ID column omitted.
- **54 refused configurations**, covering too few valid contrasts, disconnected network, multi-arm contrasts, repeated study IDs, singular/numerically invalid fit, empty bus and unsupported bus measure.

All three page models, four- and five-column input, loops and no loops, positive and zero heterogeneity, significant and non-significant global tests, and every refusal message are represented. The key, source, model and exact input of every configuration are in `corpus/corpus.json`. There is no treatment-reference or confidence-level selector on this page.

For original and four-column configurations, numerical references come from the final archived `reference/*.json`, including the corrected uncentred PM references. Accepted bus transformations compare treatment labels, effect and SE directly against P16's metafor `escalc` input references; they do not claim a separate R NMA fit. Supplementary refusal fixtures are policy tests. The singular-fit fixture extends the archived focused coverage.

Display contracts are pinned snapshots of the patched page, whose full archived numerical/markup/export comparison was rerun successfully. They are **not independently generated R outputs**. For every accepted and refused case, replay compares the full canonical table, global result region and SVG tree: all text, numbers, chips, attributes, marks, confidence limits and positions. It also compares parsed rows, selected model and option labels, input text, enabled controls, static page text and accessible labels/titles. Whitespace-only nodes are omitted and rendered whitespace is normalised. A complete DOM tree comparison counts as one check; the 4,627 total is not a count of scalar numbers alone.

Static text includes the skip/back links, header, input guidance, table headings, plot guidance, footer, shared continuation buttons and result-export controls. Dynamic result regions have their own checks. Chart-download buttons, when mounted by the shared layout-dependent helper, have a separate exact text/accessibility contract. The validation panel, script/style contents and overlays appended outside page landmarks (including the returning-user draft banner) are outside this template contract. Browser layout, visibility, accessibility behaviour and download UI require browser checks.

Replay seeds accepted output before every case to test clearing stale results on refusal. It restores pending input, model, exact results/plot, bus and draft storage in `finally`, including when an exception occurs. Bus-import input events are stopped at the window during the synchronous replay so autosave does not persist test data. Page calculations are unchanged beyond the supplied P16 patch; the only engine-adjacent addition is an observation-only state-restoration hook.

## Pins and reproduction

`MANIFEST.json` and the adapter pin the LF bytes of both corpus files with SHA-256. `.gitattributes` preserves those bytes. The shared widget verifies files before execution, and the adapter independently verifies original bytes, including on direct calls. File URLs use the two-file picker; HTTP preparation fetches only same-origin resources. Prepared replay needs no network.

To regenerate deliberately from the supplied P16 archive (never as part of testing):

```text
node nma-inconsistency/validate/build-fixtures.cjs <extracted-P16-validation-directory>
```

The builder requires linkedom 0.18.12. It declares its selection, consumes final R references, checks bus transformations against R, writes LF corpus bytes and derives the check count by executing the adapter. Regeneration changes pins and requires review of both evidence and contracts.

**Browser re-pin (2026-10-18).** The first browser run (Edge/Chromium) failed 196 of 4,627 checks against the linkedom-built contract, and every failure was a linkedom artefact, not a page or R difference: linkedom nests siblings inside non-void SVG `<line/>` elements (68 plot trees), splits `|z| &gt; 1.96` into three text nodes (122 page-text checks), and Node's V8 returned the OR bus log-odds one ulp from R (`1.960835799271989` vs R `1.9608357992719891`; the browser equals R), changing the exact parsed-row and input-text contract in three bus cases. The page-text, input-text, parsed-row and display parts of `reference.json` were therefore re-derived in the browser from the same corpus; every R numerical reference, refusal reason and the check count (4,627) are unchanged, and the bus rows were re-checked against R to 1e-9. The display contract is now browser evidence, so the linkedom builder and Node DOM tests no longer reproduce it exactly.

**Engine-independent bus log and bus refusal wording (2026-10-19).** The 2026-10-18 re-pin was derived in Edge 155, whose V8 returns `Math.log(7.105263157894737)` (the zero-cell-corrected log-OR of bus study s3) as `1.9608357992719891`; V8 in Chromium 147 and Node 24 returns `1.960835799271989`. ECMAScript does not require `Math.log` to be correctly rounded, so the exact input-text, parsed-row and (DL/PM) plot contracts of `bus::OR::TRUE::{FE,DL,PM}` passed in one browser and failed in the other (8 checks). `shared/ma-comparisons-v1.js` now computes OR/RR log effects with `MaComparisons.detLog`, a port of fdlibm `__ieee754_log` built only from IEEE `+ - * /` and bit extraction, which gives the same bits in every conforming engine (bit-identical to Node's `Math.log` on 6,000,012 sampled inputs; `hub/shared/tests/ma-comparisons-detlog.spec.mjs`). Those three cases were re-derived; no tolerance was added. The R references are unchanged and the bus rows still match metafor `escalc` to 1e-9 (detLog's value is within one ulp of R's). In the same change the bus importer's refusals were made specific: they now say that the import was refused, name multi-arm studies and their arm counts, and state that the input box was left unchanged and nothing was analysed. That changed the reason and global-region contract of the 21 empty, unsupported-measure and multi-arm bus cases (and their `reason` in `corpus.json`). All other configurations are byte-identical. The full reference was derived in Chromium 147 and Edge 155, and the two outputs were identical.

Node DOM tests, from the repository root:

```powershell
npm install --prefix .validation-tools --no-save linkedom@0.18.12
$env:NODE_PATH = (Resolve-Path .validation-tools/node_modules).Path
node hub/shared/tests/validate-nma-inconsistency.node.cjs
```

Direct Node execution avoids this environment's child-process restriction on `node --test`. These **13 tests** check positive replay/restoration, number/label/refusal/static-text/control corruptions, both pin corruptions before execution, exception restoration, FE/DL/PM live snapshots/scripts and stale/refused live input. This is Node DOM evidence, not browser evidence.

Browser specs are `hub/shared/tests/validate-nma-inconsistency.spec.mjs` (10 ordinary tests, 3 live-R `@slow` tests) and the two nma-inconsistency cases in `validate-integration.spec.mjs`. The lane's `BROWSER_TODO.md` provides exact host commands. Existing FE and RE parity specs remain unchanged.
