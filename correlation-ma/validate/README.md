# Correlation meta-analysis: Validate in R

The page offers a live check of the current accepted studies against the self-hosted webR metafor build, and an offline replay of a **declared subset**, not the full paper corpus. The shared widget's “Re-run full validation” button replays **17,716 checks across 72 configurations** here. The panel explicitly reports this scope. The complete P17 comparison has 149,379 checks.

The archived R reference used R 4.6.0, metafor 5.2-1 and metadat 1.6-0. The repository's live metafor build is 4.8-0. The shared widget reports that version difference; it does not widen tolerances. Live webR execution and browser rendering have not been run in this lane.

## Declared subset

All eight input variants with at most 100 supplied rows, each under REML, Paule–Mandel, DerSimonian–Laird and fixed effect:

| Input | Supplied / accepted rows |
|---|---:|
| dat.cohen1981, ri / ni | 20 / 20 |
| dat.craft2003, ri / ni | 60 / 54 |
| dat.crede2010, ri / ni | 97 / 97 |
| dat.curtin2002, corr / N | 21 / 21 |
| dat.lehmann2018, RM_r / Total.SampleSize | 81 / 12 |
| dat.metap/validity, r / n | 20 / 20 |
| dat.molloy2014, ri / ni | 16 / 16 |
| dat.nakagawa2007, Correlation / SampleSize | 15 / 15 |

These supply 32 configurations. Another 36 are the P17 empty, singleton, boundaries, numeric-junk, escaped-label, comment-blank-short, two-studies, near-boundary and built-in probes under all four methods. The 2,001-row capacity probe is excluded from the interactive replay but remains in the full lane comparison. Four additional empty-field probes exercise empty r/n, negative n, nonfinite n and negative infinity, automatic study labels and comma-containing labels. Their two accepted rows use the archived two-study R reference, with labels changed explicitly by the extraction script. Other parser probes with those same numerical rows also reuse that reference; their results are not inferred from the app.

There are 64 accepted and eight refused configurations. Empty and singleton inputs exercise the page's sole analysis refusal, fewer than two accepted studies. Mixed valid/invalid inputs exercise silent omission for short rows, blank fields, malformed numeric fields, nonfinite values, correlations at/outside ±1 and n ≤ 3. Comments and blank lines are skipped. There is no raw-r pooling, configurable confidence level, Knapp–Hartung control or other analysis option on this page.

## What is compared

Replay fills the actual controls and calls the page's original parser, estimator and renderer through observation hooks. It checks all exported result fields against independent R values, accepted membership and labels, every table cell and headline, every SVG label and plotted study/pooled coordinate, axis labels/positions, chart and result export control labels/states, method options/selection, input values/states, exact refusal messages and cleared output, and the page's static text and accessible labels. Static text is a committed, pinned DOM contract outside the validation panel. It is never learnt during validation.

The exact display checks use the page output's full-precision numbers at the shown precision, with those numbers independently compared to R. Study r/n/z and weights also have explicit reference checks. PM/REML tau² tolerance is 1e-6 relative to max(1, |R|); other numerical outputs use 1e-9, with I² compared on the fraction scale. SVG effect coordinates allow 190 × 1e-9 pixels, matching the r-to-pixel mapping. Other geometry uses 1e-9 absolute. Text, labels, control states and membership are exact. No conditional reference or relaxed flat-likelihood rule is used.

Replay disables the analysis inputs and restores their values, disabled states, original result object and original output DOM nodes in a `finally` block. Keeping the original nodes preserves chart download handlers. It does not write storage or navigation. Files are verified both by the shared widget and again by the adapter before running; modified bytes, including CRLF conversion, are refused. The manifest and `pins.js` record SHA-256 over UTF-8 LF bytes. HTTP preparation loads the files once; replay after preparation needs no network. With `file://`, select both JSON files from `corpus/` in the panel's file picker.

The live tier checks nine numerical outputs, k, table/headline consistency and analysis controls (12 quantities). R performs `escalc(measure='ZCOR')` and `rma(test='z', method=...)`. Random-effects PI limits explicitly use `qt(.975,k-1)*sqrt(tau²+SE²)`; FE has no PI. Live validation refuses fewer than two accepted studies. The pinned static-text, forest and refusal audit belongs to replay. Both tiers report failures rather than asserting parity for arbitrary user input.

## Reproduction and provenance

`SOURCE.json` identifies the supplied P17 archive and original source hashes. `reference.R`, `supplemental.R` and `json17.R` are unmodified source scripts from that archive; run them with the other P17 corpus-building files in the extracted archive, following its README, to regenerate the full numerical reference. This lane reuses the completed R reference; it does not claim a fresh R run.

To rebuild this subset from the supplied archive, from the repository root:

```powershell
python correlation-ma/validate/build-fixtures.py <P17-validation.zip>
node hub/shared/tests/validate-correlation-ma.node.cjs --build
node hub/shared/tests/validate-correlation-ma.node.cjs
```

The Node harness requires linkedom 0.18.12, resolvable locally or through `NODE_PATH`. `--build` deliberately rewrites the pinned static-text contract and hashes; it is a maintainer operation, not a way to bypass a failing validation. Ordinary runs never rewrite evidence. The harness tests real page scripts under a Node VM with explicit linkedom form/layout shims. It verifies positives, state restoration and deliberately tampered numbers, labels, refusal text, static text, controls, forest coordinates and pinned bytes. This is not a browser rendering test.

Browser specs are `hub/shared/tests/validate-correlation-ma.spec.mjs` and the correlation-ma entries in `validate-integration.spec.mjs`. See the lane's `BROWSER_TODO.md` for host commands. Native downloads, raster/PDF output, visual layout and accessibility remain unverified. The offline subset does not exercise generated export blobs; the separate full lane comparison does, for JSON, CSV and three Markdown/text formats.
