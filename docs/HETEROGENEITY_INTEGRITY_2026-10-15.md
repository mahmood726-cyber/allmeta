# Heterogeneity integrity repair — 15 October 2026

## Scope and release state

Base: `bdf777fb074804e09de59ac63db55f0ad90b2241`. Tested application commit: `509b2a35c41c82e993d128bd07d4c68b231ddc89`, on `fix/heterogeneity-integrity-20261015`. These changes have not been merged or deployed by this repair task. The shared variance estimators in `shared/ma-core.js`, R runner, publication reference files and numerical tolerances are unchanged. Pending REML #84, validation #94 and HTA #101/#102 changes remain separate.

This is a tested, scoped repair. It is not a comprehensive certification of the app, a claim of superiority to R, or independent human peer review.

## Repairs

### Reject invalid study sets rather than pool a silently selected subset

The native parser now requires complete finite numerical fields and a positive, representable SE/variance. `0.2junk`, empty cells, arbitrary fake headers and variance underflow are rejected. A single recognised header is allowed after blank/comment lines. Any invalid study row blocks the full fit, clears the previous numerical result and removes the old diagnostic plot.

The CSV adapter no longer filters away invalid studies or treats null effects as zero. It requires unique exact `study,yi,vi` headers and validates every study. Invalid or ambiguous uploads are rejected visibly; previous input is available through the tested Undo operation. The app explicitly refuses newline/tab-containing labels that cannot be faithfully represented in its native one-row-per-study textarea. Comma-containing quoted labels and full-precision variances are preserved. Shared-study and GRADE exports do not overwrite prior data with an invalid subset.

An injected numerical-engine exception now clears the previous fit, rather than leaving apparently current cached results. This test does not claim to cover every possible failure in every export route.

### Make heterogeneity and interval conventions explicit

The historic `I2` output remains **Q-based** for compatibility. `I2_Q` is an explicit alias; the additional `I2_model` is `100*tau2/(tau2+v_typical)`. The interface labels the two separately and pairs the transformed Q-profile interval with model-based I² only. Neither definition is inherently invalid; a point using one definition should not be silently presented as if it shares another definition's interval.

The app already calculated three distinct interval conventions. Their algorithms are preserved and identified:

- Normal pooled CI: `test="z"`.
- Modified Hartung–Knapp pooled CI: variance factor floored at one, `test="adhoc"`.
- Prediction interval: unadjusted model SE and t_(k−1), matching `predict(rma(..., test="t"))`.

The PI is an approximation, especially with few studies; the old claim that other degrees-of-freedom conventions had been universally superseded was removed. The eight variance estimators and their existing regression checks remain intact. The app's pre-existing DL refusal below k=10 is preserved, not asserted to be a universal methodological requirement.

**Rejected candidate:** the suggested zero-Q I² defect was not a defect in the original implementation. A zero-effect fixture returned Q=0 and I²=0 before and after this change. That good behaviour now has an explicit regression.

### Restore diagnostic controls and export meaning

Both Baujat X and Y limits now actually control the plot. Missing endpoints remain automatic; invalid negative/nonfinite ranges are rejected. A cropped view reports how many points lie outside the selected range without removing those studies from the analysis or numerical export. Unsupported logarithmic controls are disabled.

The SVG has an accessible title/description naming the study count, estimator and crop state. Actual SVG download, XML validity and metadata are tested. Small-screen axis-control styling is improved, but this work does not claim a complete mobile, screen-reader or WCAG audit.

### Render shared CSV warnings as literal text

`hub/shared/csv-upload.js` previously interpolated untrusted CSV warning contents with `innerHTML`. It now uses `textContent`. The adversarial fixture inserted an SVG element into the original warnings panel; the repaired panel contains literal text and no injected SVG. The harmless script marker did not execute in the original test run, so this report does not claim a demonstrated arbitrary-code exploit. The change prevents that unnecessary HTML interpretation across consumers without changing the shared parser's numerical behaviour or global fuzzy-matching policy.

## Numerical examples from fresh R execution

For `yi=(-0.5,0.1,1.2)` and `sei=(0.1,0.4,0.2)`, PM gives:

| Quantity | App result |
| --- | ---: |
| Pooled effect | 0.2636048510479969 |
| Model SE | 0.5094058140060472 |
| tau² | 0.7135964071699605 |
| Q-based I² | 96.56371446103498% |
| Model-based I² | 94.6921190680546% |
| Normal CI | −0.7348121979191651 to 1.262021900015159 |
| Modified-HK CI | −1.9281914651353107 to 2.4554011672313045 |
| Model-SE/t prediction interval | −3.980762392271679 to 4.507972094367673 |

The model-based I² is newly displayed; the previous Q-based output and pooled model calculations are retained. Fresh R values agree within the predeclared test thresholds. The nearly homogeneous and exact zero-effect fixtures also pass, including their distinct normal and modified-HK intervals.

## Executed before/after validation

**Final successful run:** [38710660131](https://github.com/mahmood726-cyber/allmeta/actions/runs/38710660131), job `116340922697`.

- Original application: **16 failed, 2 passed** among the 18 new non-R baseline checks. The fresh-R test was intentionally excluded from this baseline-only run.
- Corrected application: **39/39 affected Chromium tests passed**, consisting of 19 new tests and 20 existing Heterogeneity/shared-CSV tests. No failures or skips were reported.
- The retained publication corpus executed **131,781 numerical comparisons**, all passed. Reference hashes and the 1e-9 comparison tolerances were not changed. Maximum recorded relative difference was `3.1084734786190893e-10`, absolute difference `1.8537349433245254e-10`; structural comparisons were exact.
- The separate rendered-number audit checked **121,424 numbers with zero display failures**. This is the original 120,720 display checks plus one additional model-based I² point in each of 704 configurations. The original Q-based point and model-based interval checks remain present.
- **Fresh R, not saved-reference replay:** three new datasets plus the existing built-in example were executed using SHA-256-verified self-hosted **webR 0.5.5, R 4.5.1, metafor 4.8-0**. The new checks cover normal and modified-HK pooled CIs, tau², model I² and the separate model-SE/t prediction interval. Numerical thresholds are `1e-8*max(1,abs(reference))`, with interval-specific checks to seven decimal places. Full values and versions appear under `HETEROGENEITY_FRESH_R_EVIDENCE` in the log.
- Existing stored-reference tests exercise all eight variance estimators on the BCG dataset and the publication corpus. Those are distinct from the three new fresh-R datasets.
- Actual browser flows include textarea edits, file upload, pasted CSV, Undo, shared-bus/GRADE actions, axis changes and downloaded SVG. The displayed study count and fit are checked, not merely whether a button or plot exists.

[Final before/after artifact](https://github.com/mahmood726-cyber/allmeta/actions/runs/38710660131/artifacts/11960925710): `before.log`, `after.log`, `source.patch`. ZIP SHA-256: `0fc2c974fce5f77d44c9b8093941ee9ccba452e7bc9baad8f10a424a725cc2dc`.

### Initial integration failure, retained rather than hidden

[Initial run 38709927147](https://github.com/mahmood726-cyber/allmeta/actions/runs/38709927147) produced **38 passes and one failure** after the first patch. All 131,781 numerical comparisons and the new fresh-R cases passed, but the display auditor still searched for old card labels, causing 5,632 display failures. No application files were committed by that failed run.

The display adapter was then updated to read the separate I² cards and accurate CI labels. Coverage was increased by 704 displayed model-I² checks, and the test now requires the entire display-failure array to be empty. No valid numerical test was removed, no tolerance widened, and no reference values changed.

[Initial failure artifact](https://github.com/mahmood726-cyber/allmeta/actions/runs/38709927147/artifacts/11959609412), ZIP SHA-256: `461832ba3a8143bb5153e73d2ba0a74190eaa6ee3815b80894eec5a7b23485f4`.

## Reference integrity and reproduction

Unchanged corpus SHA-256: `b3d7ea381e31a70dc45d2d2f613ac390592fef4184e3fb989cb21ef54ee21fac`.

Unchanged publication reference SHA-256: `aecb7c1ef7f3d290fd53b6709c2ce11d3d8f02fe0fcef4cb0e3d6febe47ad8f2`.

The publication reference identifies metafor 5.2-1/metadat 1.6-0; fresh browser-R execution in this repair identifies metafor 4.8-0. They are deliberately not reported as the same runtime.

```sh
cd hub/shared/tests
npm ci
npx playwright install --with-deps chromium
npx playwright test heterogeneity csv-upload --reporter=line
```

Temporary branch-writing build workflows and patch builders were removed after the tested source commit. The retained `.github/workflows/heterogeneity-integrity.yml` has `contents: read`. PR-wide CI is a separate release gate; its completion is not implied by the targeted results above.

## Remaining scope

Native JSON import validation, every receipt/state-restoration route, extreme numerical regimes, complete mobile/assistive-technology testing, and multi-app workflow interoperability still require individual review. The app's pre-existing DL threshold/substitution policy and shared REML correction are not newly validated or altered by this scope. Neither this app nor the entire portfolio is marked comprehensively complete on the basis of these repairs.

Method references: [metafor rma.uni](https://wviechtb.github.io/metafor/reference/rma.uni.html), [predict.rma](https://wviechtb.github.io/metafor/reference/predict.rma.html), and [heterogeneity FAQ](https://www.metafor-project.org/doku.php/faq).
