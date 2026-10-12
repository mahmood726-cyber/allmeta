# IPD plotted-result and export fidelity — 12 October 2026

Follow-up to the user's request to fix the remaining AllMeta plotting problems. PR #97 was already merged and deployed at the start of this check; its IPD/R fixes and the separate Screenr/CardioOracle releases were verified rather than duplicated. See `PLOT_COMPLETION_2026-10-12.md` for that earlier scope.

## Additional defects reproduced

A live check of IPD Meta-Pro at baseline `689d9b0ab65cdffbd9ab0f310f72826efc63b153` found hard-coded heterogeneity, prediction-interval, tau and publication-bias narratives contradicting the computed output. The Q heading contained an example p-value. Source and browser tests additionally established that the main forest/headline and SVG export rebuilt normal-quantile intervals instead of using the saved HKSJ confidence limits, and could apply subsequently edited settings to an older fit.

The six-study synthetic regression fixture has a saved 90% HKSJ interval of **[-0.5071061343, 0.5558381275]**. Before repair, the forest received **[-0.4094667134, 0.4581987066]**. Both desktop/mobile baseline tests failed specifically on this discrepancy in run **38214574997**; this is not an inference from a missing screenshot.

The SVG download helper also routed funnel/network requests through the forest generator, allowing the wrong graphic to be exported. Negative confidence-limit padding and overlapping tick/axis labels were identified during export inspection.

## Repairs

- Read plotted confidence limits, confidence level, effect scale and HKSJ selection from saved fitted results/settings, not a fresh normal approximation or changed controls.
- Populate heterogeneity and asymmetry narratives with the current computed values; remove initial example statistics. Label Egger's existing statistic as t, not Z. Do not infer a beneficial outcome direction merely from a positive continuous effect.
- Show explicit unavailable states for absent/nonfinite saved limits. Reject null prediction bounds before exponentiation. Fixed-effect models do not display invented random-effects prediction intervals or between-study SD estimates.
- Export the forest using the same saved study/pooled intervals, finite geometry and padded bounds. Preserve the requested non-forest canvas instead of substituting a forest. Those non-forest SVG files are explicitly labelled as canvas images in SVG wrappers, not editable vector graphics.
- Give exported forest tick labels and the x-axis label separate baselines; ensure a usable export width even from a mobile viewport.

The `MetaAnalysis` and `PublicationBias` estimator blocks are unchanged. Display/plot adapters and exports are repaired; this is not a new independent validation of all underlying estimators.

## Executed evidence

**Run 38215492755**, artifact **11731607783**: **182 passed, zero failed/skipped/flaky**, in three sequential groups with no retries:

| Group | Passed | Duration |
|---|---:|---:|
| New saved-display and actual SVG-download checks | 12 | 12.0 s |
| Existing catalogue, flagship and NMA Pro checks | 148 | 130.0 s |
| Existing IPD and R-runtime checks | 22 | 194.7 s |

All cases use Chromium at 1280px or 390px. The new cases verify exact saved intervals, retained numerical state after redraw/control changes, correct confidence/measure labels, fixed-effect prerequisites, null-bound handling, actual downloaded SVG content, finite in-bounds geometry, and funnel canvas identity.

The earlier combined 170-case run in **38214574997** had two NMA Pro five-second completion-flag timeouts (168 passed). Traces/screenshots showed completed plotted output; no NMA production code or assertions were changed. The same checks passed in the final run when native and R-heavy groups were executed separately. The earlier failures are not omitted from the record or counted as passing.

After the final SVG-spacing-only adjustment, **run 38216151741**, artifact **11732088176**, repeated all 12 new display/download cases successfully. A retained assertion requires at least 18 SVG units between tick and axis text baselines. The changed export was also rendered and visually inspected. Only SVG bottom spacing and its test changed after the 182-case run.

Retained test: `tests/playwright/ipd-fitted-display.spec.mjs`. Temporary patch builders and write-enabled workflows were removed after successful testing.

## Reproduction and limits

From `tests/playwright`, after npm and Chromium installation:

```sh
npx playwright test ipd-fitted-display.spec.mjs --workers=2
npx playwright test flagship-plot-rendering.spec.mjs nma-pro-session-plots.spec.mjs catalog-svg-plots.spec.mjs --workers=3
npx playwright test remaining-plots.spec.mjs remaining-runtime-plots.spec.mjs --workers=2
```

Use valid inputs for each method. Net Heat requires eligible network designs; held-out calibration cannot be fabricated where predictions are absent. Browser rendering checks do not establish every optional workflow, all browsers/devices, or universal statistical/clinical validity. Old project files cannot recover fields discarded by earlier lossy saves. The fixture used here is deliberately synthetic, not patient data or a clinical-effect claim.
