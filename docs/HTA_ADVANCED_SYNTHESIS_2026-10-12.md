# HTA advanced synthesis repair

This addresses [issue #100](https://github.com/mahmood726-cyber/allmeta/issues/100) on a separate branch based on PR #101, commit `2f36b081dacfa4817a445bedb8a17f0c99ba97b1`. PR #101 and main were both checked again before publication: #101 remained open, and main remained `6036f3b6c1fd404b6da7916460faa8b3ebaf56bc`. Neither is merged by this work.

## Reproduced problem

A browser loaded the existing valid HTA demo project, navigated to the persistent advanced Meta-Analysis panel, uploaded a CSV containing four synthetic study estimates, and clicked Run Analysis. On the unchanged #101 branch the import did not populate usable input; the app reported “Please enter at least 2 studies” and rendered no forest plot. The same browser actions on this repair produce the fitted result and populated plot.

The previous advanced controller read nonexistent data tables, called `MetaAnalysisMethods.analyze`, supplied data directly to `NetworkMetaAnalysis.run` instead of `setData`, and targeted elements absent from the actual markup. Several older unit tests mocked those broken contracts, so they could not establish that the real panels worked.

## Supported contracts

| Panel | Input | Calculation and interpretation |
|---|---|---|
| Pairwise | CSV `study,effect,se,year` or JSON array / `{studies:[...]}`; year optional; `yi,sei` aliases accepted | REML, DL or PM random effects; selected 90%, 95% or 99% normal intervals; SEs positive; one independent estimate per study |
| Pairwise ratios | Effects and SEs already on natural-log scale | Labels say log(OR), log(RR) or log(HR); changing the selected measure never silently transforms supplied estimates |
| Network binary | CSV `study,treatment,n,events` or equivalent JSON | Frequentist fixed-effect log odds ratios; treatment/reference direction; two distinct arms per independent study |
| Network continuous | CSV `study,treatment,n,mean,sd` or equivalent JSON | Frequentist fixed-effect SMD (Hedges' g), using the engine's existing approximate variance convention |
| Bias diagnostics | Current pairwise estimates and settings | Requested Egger/Begg diagnostics and observed/imputed funnels; trim-and-fill explicitly described as an exploratory fixed-effect adjustment |
| Beginner DTA sample | Existing diagnostic sample | Explicit unavailable-method explanation; no bivariate/HSROC fit, success claim or replacement graphics; previous beginner fits/plots cleared |

HKSJ, small-study interval corrections, the legacy EB-as-DL alias, unsupported Peters/selection-model input, Bayesian/random-effects NMA, survival NMA and multi-arm NMA are not exposed as supported advanced-panel methods. Disabled choices explain the limitation; forced incompatible settings are rejected. Network node-splitting is not presented or exported as a validated diagnostic. P-scores are labelled as scores, with an explicit higher/lower outcome preference, rather than SUCRA or simulated rank probabilities.

Pairwise prediction intervals retain the engine's actual t/normal rule and display the returned method. The optional I² interval is labelled an approximate test-based **95%** interval, independently of the selected primary effect confidence level. Influence diagnostics retain the engine's existing implementation and are not separately certified by these reference fixtures.

## Numerical corrections

1. **Binary contrast orientation.** The odds-ratio helper returned baseline/arm, but the design matrix models arm minus baseline. The contrast now uses log odds(arm)/odds(baseline), consistent with the forest and league-table labels. For 10/100 events on A and 20/100 on B, log(OR) B vs A changes from `-0.8109302162163288` to `+0.8109302162163288`. Reversing input-arm order and changing reference treatment are checked independently.
2. **Heterogeneity p-values.** The upper incomplete-gamma continued fraction was incorrectly initialised. A zero-event fixture previously returned a negative Q-test p-value (`-0.013508143103726944`); its independent expected value is approximately `0.020694389173826065`. The corrected continued fraction agrees with SciPy.
3. **P-score variance.** A fixed `0.0001` variance floor distorted scores for precise comparisons. P-scores now use the fitted covariance, with the mathematical deterministic limit only for zero variance. A high-precision fixture catches the former floor.
4. **Model metadata.** The frequentist fitter still uses within-study-variance weights. Its returned model is now `fixed`, with the requested model recorded separately, fitted τ² = 0, and a flag that its diagnostic heterogeneity estimate is not used in the fit. This is not a random-effects NMA implementation.

**Existing HTA binary NMA analyses should be rerun.** This change affects calculated effect direction and rankings, not just drawing. PR #101's canonical REML repair is retained; the shared `AlmMaCore` implementation is unchanged.

## Plots, exports and state

- Advanced pairwise forest and cumulative plots, network geometry/forest/P-scores/comparison-adjusted funnel, and observed/trim-and-fill funnels use fitted values and supplied studies. No demonstration graphics are substituted.
- Native SVGs mount at the persistent panel's actual chart targets. Tables, plot data, SVG model metadata, JSON snapshots and CSV estimates/weights share the saved fit. SVG exports are checked against the exact selected SVG bytes and parsed as XML.
- Resizing and revealing a tab redraw saved values without refitting. Tabs are scoped to their own section. Phone panels use a constrained grid and scrollable tables instead of widening beyond the screen.
- Input/settings changes, failed imports and failed reanalysis invalidate prior fits and exports. Generation counters prevent a delayed import or NMA completion from restoring stale results.
- Tooltip decoration excludes SVG/data/code/input elements. It must not append HTML help icons to JSON model metadata or SVG geometry.
- The HTA cache version is updated, local vendored libraries and repaired modules are precached, and cache migration preserves other applications' caches.

## Independent verification

`HTA/validation/advanced_synthesis_reference.py` runs no application JavaScript. It uses SciPy restricted-profile-likelihood optimisation for REML, independent DL arithmetic, a bracketed PM root, and NumPy linear-system solves for fixed-effect NMA. The committed JSON contains **36 pairwise cases**, **8 network cases**, plus cumulative and leave-one-out references. It covers heterogeneity/boundary/unequal-precision/two-study fits, all three offered primary CI levels, two references, binary and continuous data, zero-event correction and precise-ranking inputs.

Primary estimates/intervals/p-values are checked to six decimal places; P-scores to absolute `1e-5` percentage points, consistent with the engine's normal-CDF approximation. These are scoped synthetic-data checks, not proof of every numerical condition, design or clinical application. No live R run is claimed. The normal/HKSJ distinction is consistent with the [metafor documentation](https://wviechtb.github.io/metafor/reference/rma.uni.html).

Final local execution: **412 unit tests passed**, **30 Chromium browser tests passed**, no failures or skipped tests in either run and no browser retries. The browser run includes **20 advanced-panel cases and 10 existing beginner regression cases**, at 1280px and 390px. It uses actual file chooser/import/navigation/run/export actions after loading a valid project. Final mobile forest and network screenshots are inspected.

Earlier verification found and corrected phone overflow and tooltip corruption of SVG metadata. Initial environment-only browser failures came from bundled Chromium's single-process mode; the local runner used normal process isolation. Those failed attempts are not counted as successful runs. Targeted ESLint completes with zero errors (17 existing warnings); shipped-asset lint, citation grounding and the repository drift gate pass.

## Reproduce

```sh
python -m pip install numpy==2.3.5 scipy==1.17.0
python HTA/validation/advanced_synthesis_reference.py
cd HTA
npm ci --ignore-scripts
npx jest tests/engine/advancedSynthesisReference.test.js tests/engine/nma.test.js tests/engine/metaMethods.test.js tests/ui/advancedSynthesis.test.js tests/ui/advancedUI.test.js tests/ui/advancedUI2.test.js tests/ui/beginnerMode.test.js tests/ui/beginnerMode2.test.js --runInBand
cd ../tests/playwright
npm ci
npx playwright install --with-deps chromium
npx playwright test --config hta-advanced.config.mjs
```

An optional local Chromium executable can be supplied through `HTA_CHROMIUM_EXECUTABLE` and its launch-argument JSON through `HTA_CHROMIUM_ARGS`. The retained read-only GitHub Actions workflow repeats the independent references and affected unit/browser checks. Its remote result is distinct from the independently executed local result above.
