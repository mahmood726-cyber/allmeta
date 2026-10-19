# Forest Plot integrity repair — 15 October 2026

## Scope and release state

Base: `bdf777fb074804e09de59ac63db55f0ad90b2241` (Effect-Size Converter #111 merged). Tested application and catalog-register commit: `3a2b6c473514d326e0afd8841ed8495086dba200`. The Forest changes are on `fix/forest-integrity-20261015`, not deployed or merged by this work. Existing shared REML #84, validation #94 and HTA #101/#102 work is preserved; `shared/ma-core.js` and `shared/webr-runner.js` are unchanged.

This is a scoped numerical/input/export/plot repair, not certification of every Forest workflow or any other app. It does not establish superiority over R or independent human methodological review.

## Demonstrated defects and corrections

1. **Mismatched R inference.** The app already used modified Hartung–Knapp with variance multiplier `max(1,Qstar/(k-1))`, but its live-R settings and report specified ordinary `test="knha"`. Both now use metafor's `test="adhoc"`. The existing pooled estimate, Paule–Mandel estimator and floored CI algorithm remain unchanged. The model is explicitly described on screen and in JSON.
2. **I² convention mismatch.** The app paired its Q-based point I² with tau²-based Q-profile limits and a live comparator using metafor's model-based I². The main `I2` field now equals `100*tau2/(tau2+v_typical)`; the previous Q-based quantity is separately preserved as `I2_Q`. Neither definition is intrinsically illegitimate: they must not be silently interchanged.
3. **Silent selection of study rows.** A numeric prefix such as `0.2garbage` was accepted; arbitrary initial malformed rows could be treated as headers; invalid rows were otherwise excluded while the remaining subset was pooled and shared. Complete numeric fields and a specifically recognised header are now required. Any invalid textarea row blocks the full fit and clears the previous result. Positive finite SE, representable variance/weights, and finite fits are checked.
4. **Prediction-interval geometry.** Auto-ranging ignored the PI it drew, and the axis could run through the PI row. Auto-ranging now includes the full finite PI, with the axis below the pooled block. This does not claim exact PI coverage with very few studies.
5. **Partial axis limits.** `isFinite(null)` treated an automatic endpoint as zero. `Number.isFinite` preserves the missing endpoint's automatic value. The redundant logarithm toggle is disabled; exponentiated labels use the existing axis selector.
6. **Reproduction lost small variances.** Ten-decimal formatting could export a positive variance of `1e-12` as zero. R inputs now retain full numerical precision, and labels are safely quoted. The downloaded report uses the actual PM/modified-HK configuration.
7. **Result provenance.** JSON includes the actual method/test, confidence level, I² definitions, approximation statement and study values. Table numbers remain on the input scale; the UI explicitly states that exponentiation changes axis labels only.

## Numerical consequences

For `yi=(0.20,0.21,0.19)` and `sei=(0.20,0.20,0.20)`, the app's modified-HK SE is **0.11547005383792516**, with CI **[-0.2968275423500527, 0.6968275423500528]**. The raw HK formula gives SE **0.00577350269189625**. The correction is to the R recipe and model identification, not a change to the already-floored displayed CI.

For `yi=(-0.5,0.1,1.2)` and `sei=(0.1,0.4,0.2)`, the model-based I² is **94.6921190680546%**, while the prior Q-based I² is **96.56371446103498%**. Both are now identifiable. Existing exported analyses comparing I² across versions should use the named definition, not assume the `I2` field retained the old convention. Pooled effects, tau² and CIs are unchanged by this definition correction.

For the two-study fixture `yi=(-0.5,0.5), sei=(0.1,0.1)`, the approximate PI is **[-10.930290605020257, 10.930290605020257]**. That full interval now determines the automatic plot domain, rather than extending beyond the plotting area.

## Executed validation

[GitHub Actions run 38707999855](https://github.com/mahmood726-cyber/allmeta/actions/runs/38707999855), job `116332097432`:

- **Before repair:** 13 new targeted regressions failed and 1 passed. The fresh-R test was deliberately excluded from this baseline-only run. The failures include genuine wrong/absent state and export contents, not a missing browser or dependency.
- **After repair:** **22/22 Chromium tests passed**, including seven unchanged Forest tests and fifteen new tests. No failures or skips were reported. The comparison thresholds were fixed in the tests before running the repair.
- **Fresh R:** five actual datasets were executed using the repository's SHA-256-verified self-hosted **webR 0.5.5, R 4.5.1, metafor 4.8-0**, not merely compared with stored oracle numbers. Checks cover pooled estimate, SE, CI bounds, tau², Q, model I² and both PI limits. Most comparisons agreed near machine precision; the declared gate is `1e-8*max(1,abs(reference))`, with PI checks to seven decimal places.
- **Data sets:** homogeneous/floored-HK, two-study PI, unequal variances/I² conventions, identical effects, and a heterogeneous eight-study case. Full executed values and verified versions are in the `FOREST_FRESH_R_EVIDENCE` log record.
- **Browser actions:** actual textarea editing, axis edits, shared-bus save, HTML report download and JSON download. These tests do not claim a complete accessibility or mobile-device audit.

[Retained before/after artifact](https://github.com/mahmood726-cyber/allmeta/actions/runs/38707999855/artifacts/11958834372): `before.log`, `after.log`, `source.patch`. ZIP SHA-256: `9b8425263a35cc1e980e06c29302f751694753f2cdd10df20b39306fc5aca03d`.

The temporary branch-writing build workflow and patch builder were removed after the tested source was committed. The retained `.github/workflows/forest-integrity.yml` uses `contents: read` and runs the affected tests. PR-wide CI is reported separately; this document does not claim it has completed.

Reproduce:

```sh
cd hub/shared/tests
npm ci
npx playwright install --with-deps chromium
npx playwright test forest --reporter=line
```

## Catalogue tracking and outstanding scope

`docs/APP_REPAIR_REGISTER.json` was generated by executing the current `hub/projects.js`: **128 catalog entries, 122 hosted in this repository, six external**. It explicitly separates scoped repair status from full-app completion. No entry is declared comprehensively complete merely because these tests pass.

Remaining review areas include every CSV-upload/preprocessing route, manually restricted-axis clipping, mobile and assistive-technology flows, validation-receipt freshness, very large/extreme datasets and all shared-workspace round trips. A blocked/unsupported design should be disclosed, not silently replaced by another model. The proposed next app is Heterogeneity; its shared REML dependency must remain aligned with the separately reviewed #84.

## Primary method references

- [metafor `rma.uni` documentation](https://wviechtb.github.io/metafor/reference/rma.uni.html): `test="adhoc"` versus raw `knha`.
- [metafor `predict.rma` documentation](https://wviechtb.github.io/metafor/reference/predict.rma.html): model-dependent approximate prediction intervals.
- [metafor heterogeneity measures FAQ](https://www.metafor-project.org/doku.php/faq): tau²-dependent I² and its relationship to Q-based I².
