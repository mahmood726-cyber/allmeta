# Correlation meta-analysis: plus panel and its validation

The plus panel sits below the main page in `<section id="alm-plus">`. It reads the rows the page itself accepted (`window._almLastCorrMA().studies`). Every number comes from `AlmMaCore.pool()` in `shared/ma-core.js`, the same core the page uses. `correlation-ma/plus-core.js` re-implements no estimator. The page's parser, estimator, headline, study table and forest plot are unchanged.

## What the panel adds

| Feature | What it does | Independent check |
|---|---|---|
| Sensitivity table | REML, Paule–Mandel, DerSimonian–Laird and FE, each with three CI methods: Wald z, HKSJ (metafor `test="knha"`) and HKSJ with the ad-hoc floor max(1, q) (metafor `test="adhoc"`). Each cell shows the pooled r [95% CI], the 95% PI, τ², τ, I² and Q (df). The current selection is highlighted. Notes appear when the HKSJ CI is narrower than the Wald CI (q < 1), when the CI has zero width, and when the PI equals the CI. FE × HKSJ is marked "not applicable" because ma-core does not offer HKSJ for FE. | `rma(method, test)` for every cell |
| Prediction interval | μ ± qt(0.975, k − 1) · √(τ² + SE²) on the z scale, back-transformed with tanh. SE is the SE of the fit (Wald or HKSJ). | Formed explicitly in R. It also equals `predict()` on knha/adhoc fits. It is shown to *differ* from `predict()` on z fits, which uses qnorm. |
| Leave-one-out | Button-driven. For each omitted study it shows r [CI], PI (t, k − 2), τ², I² and Δr. Flags are computed only from these numbers: "omitting changes whether CI excludes 0" and "largest \|Δr\|". It refuses k < 3, k > 200 and FE × HKSJ visibly. | `leave1out(fit)` for every method and test with 3 ≤ k ≤ 200 |
| Download R script | A runnable metafor script for the current method and test: data literal, `escalc("ZCOR")`, `rma`, the explicit t PI, tanh back-transformation, and optionally `leave1out`. It prints `print(fit)`, a rounded summary and exactly one `ALMJSON:` line. Labels are escaped to ASCII R strings. The export is refused for non-finite values, k < 2 and FE × HKSJ. | Every generated script was executed in R and its ALMJSON compared with the app |
| Plain language, Methods and Results | Text built from the same display strings as the table. Size benchmarks are Cohen 1988 (.10/.30/.50, the default) or Gignac & Szodorai 2016 (.10/.20/.30). The text says when the CI spans more than one benchmark category. It gives the CI zero statement, the PI, and both signs in the PI. Caveats cover: not causation; pooled r = tanh(mean z); dependence is not modelled; k < 5 imprecision; PI = CI when τ² = 0. | Binding of numbers to display strings, banned phrases, category boundaries, a second-reader review |
| Usability | U1: an excluded-row notice (`#f-notice`, role=status, `window._almCorrRejected()`). U2: Load example, Clear, and Convert tabs/semicolons with decimal commas (`#f-tools`); these are inert while the replay disables `#f-data`. U3: a debounced live summary. U4: the forest SVG has role=img and an aria-label, and the study CI stroke token `--forest-ci` has 5.3:1 contrast in light mode and 6.3:1 in dark mode. | DOM harness against the P17 probe-refusal ledger and the full row ledger (5,089 supplied, 5,014 accepted); browser spec with axe-core |

`window._almCorrPlus()` returns the panel's results (schema `corr-ma-plus-v1`). A second results export uses the basename `correlation-ma-sensitivity`. The v1 export and the v1 `corr-ma-results-v1` object are untouched.

## Reference

`generate-plus.R` ran on R 4.6.0 with metafor 5.2-1 and metadat 1.6-0; the log prints `.libPaths()` and the package versions. Its inputs were the 17 archived P17 corpus inputs (`corpus.rds` in the P17 archive) plus 10 probes. The probes are:

- the built-in example
- k = 2 and k = 3
- identical effects (q = 0, which gives an HKSJ SE of 0)
- homogeneous effects with τ² = 0 and q < 1
- r = ±0.9999999999999999
- r near +1
- comma labels
- injection-style labels
- a case where leave-one-out flips whether the CI excludes 0

The run made 324 fits and 11,856 leave-one-out omissions with 0 warnings. Controls were `threshold=1e-12`, `maxiter=10000`, `stepadj=0.5` and `tol=.Machine$double.eps^0.75`. Numbers were written with 17 significant digits. In the metafor 5.2-1 source, `test="adhoc"` is `s2w[s2w < 1] <- 1`, which is the max(1, q) floor. `predict()` uses qnorm for z fits and `qt(ddf)` for knha/adhoc fits.

Files in `plus-corpus/` are pinned by `MANIFEST-plus.json` (SHA-256 over LF bytes):

- `reference-plus.json`
- `rscript-results.json`: R output of the 270 exported scripts
- logs
- `probe-row-refusals.csv` (P17)
- `row-ledger-summary.json` (built from the P17 `corpus.json` and `row-ledger.csv`)

The harness refuses to run if any of these files differs from its pin.

## Tolerances (same as v1 P17; never widened)

- Closed-form quantities: |app − R| / max(1, |R|) ≤ 1e-9.
- PM/REML τ² and τ: 1e-6.
- I²: |difference| / 100 ≤ 1e-9.
- Flags, counts, refusals and strings: exact.
- A flag is not compared when its R value lies within 1e-9 of the decision boundary. These comparisons are counted as `tie_guarded`, which was 0 in every run.

## Reproduce

From the repository root, with linkedom resolvable for the DOM test:

```
node correlation-ma/validate/plus-check.cjs --rjson correlation-ma/validate/plus-corpus/rscript-results.json
node hub/shared/tests/validate-correlation-ma-plus.node.cjs
node correlation-ma/validate/plus-check.cjs --tamper                     # must fail
node hub/shared/tests/validate-correlation-ma-plus.node.cjs --tamper     # must fail
```

To regenerate the R side, put `generate-plus.R`, `json17.R` and the P17 `corpus.rds` in one folder and run `Rscript generate-plus.R`. Then run `node plus-check.cjs --write-r rscripts`, followed by `Rscript run-rscripts.R`.

Browser spec: `hub/shared/tests/correlation-ma-plus.spec.mjs`. It covers rendering, the keyboard path, the R download, the usability tools, axe-core on the new regions in light and dark mode, and the forest stroke contrast.

## Not covered

- No influence diagnostics (`influence()`): they are not shipped.
- No raw-r or Hunter–Schmidt pooling, and no Q or effect p-values.
- No live webR for the plus extras.
- Leave-one-out is limited to k ≤ 200, the range in which the oracle ran `leave1out`.
- FE leave-one-out I² is withheld because it is not in the validated scope.
- Under HKSJ with τ² = 0, the PI equals the HKSJ CI by construction, and metafor `predict()` gives the same. This is flagged in the table and in the text rather than hidden.
