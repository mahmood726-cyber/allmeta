# pubbias-tests extras: PET-PEESE and leave-one-out sensitivity (#alm-plus)

The `#alm-plus` section adds two things to the publication-bias page, each checked against R:

1. **PET and PEESE limit estimates with 95% confidence intervals, and the conditional PET-PEESE choice.**
   PET is the weighted regression `lm(yi ~ sei, weights = 1/vi)`, PEESE is `lm(yi ~ vi, weights = 1/vi)`;
   the intercept is the limit estimate, with t inference on k-2 degrees of freedom. PET is algebraically the same
   weighted model as the page's Egger test (the page regresses yi/sei on 1/sei without weights: its slope is the PET
   intercept and its intercept is the PET slope). **Rule:** use PEESE when PET's intercept test rejects at two-sided
   5% (p < 0.05), otherwise PET. If |p - 0.05| <= 1e-9 (the p-value comparison tolerance) the branch is refused
   as a tie rather than decided by rounding. R reference: `metafor::regtest(yi, vi=vi, model="lm",
   predictor="sei")` and `predictor="vi"` (`est`, `ci.lb`, `ci.ub`, and the slope test `zval`/`pval`), with the
   intercept test from `coef(summary(fit))` of the returned `lm`. The conditional rule is explicit code, not an R
   function.
2. **One-click leave-one-out of every validated test.** For each study omitted in turn: Egger t, p and limit
   estimate; PEESE estimate and the PET-PEESE branch; Begg tau and p; trim-and-fill k0, side and estimate; for 2x2
   data, Peters and Harbord t and p. Each omission is flagged when it moves a test's p-value across 0.05, changes
   trim-and-fill k0 or changes the PET-PEESE branch. The table can be filtered to flagged rows and exported as CSV.
   In R this needs a loop over omissions with several calls per omission; the R reference is exactly that loop
   (`validate/generate-plus.R`) using the publication archive's calls:
   `regtest(rma(y, v, method="REML"), model="lm", predictor="sei")`, `ranktest(y, vi=v)`,
   `trimfill(rma(y, v, method="REML"), estimator="L0")`, and
   `metabias(metabin(e1, n1, e2, n2, sm="OR", method="Inverse", allstudies=TRUE), method.bias="Peters"/"Harbord", k.min=3)`.

Egger, Begg, trim-and-fill, Peters and Harbord in the extras are computed by **calling the page's own inline engine**
(`window.__almPubBiasEngine`), so the full-data row of the leave-one-out table cannot differ from the main results
table. The panel shows this as a visible identity check after every run (exact `Object.is` equality with the page's
results object for Egger, Begg and trim-and-fill; the rendered 3-decimal text for Peters and Harbord), and a test
repeats it on every corpus configuration with 5 <= k <= 100 (121 configurations: 120 identical; for
`dat.baker2009/OR:Placebo:Salmeterol` the main analysis is refused because trim-and-fill's REML does not converge,
and the extras show the same trim-and-fill refusal). New computation (PET intercept test and CI with an
accurate t quantile, PEESE, the conditional rule, the omission loop and flags) lives in `pubbias-tests/plus-engine.js`.
`shared/selmodel.js`, `shared/trimfill.js`, the inline engine, the original corpus, reference, manifest and
`validate/adapter.js` are unchanged. The original adapter has no page-text contract, so it needs no `#alm-plus`
exclusion; the extras use their own nodes and their own validation mount.

Refusals are explicit: fewer than 3 studies (PET-PEESE), fewer than 4 or more than 100 studies (leave-one-out;
100 is the validated range), equal standard errors (singular regression), REML or trim-and-fill non-convergence,
fewer than 3 informative 2x2 rows, and the alpha tie. The selection model on the page remains experimental, does not
reproduce metafor, and is not part of the extras or their checks.

**Thompson-Sharp (page table).** The test in the main results table is now checked by this panel against
`regtest(rma(yi, vi, method="REML"), model="rma", predictor="sei")` (metafor 5.2-1) on all 152 configurations:
statistic, p, sei coefficient, intercept (limit) and tau2, or the refusal when R's parent REML fit does not converge
(`dat.baker2009/OR:Placebo:Salmeterol`, refused by both). Result: 152/152 configurations, 756/756 checks
(max |difference|: statistic 6.0e-13, p 4.7e-13). The build before this version failed all 152. Root cause, two
parts: (1) it tested the intercept (the limit estimate) instead of the sei coefficient; (2) it fitted Egger's
multiplicative-dispersion weighted lm with a t test (regtest `model="lm"`) instead of Thompson and Sharp's
additive between-study variance (REML meta-regression, z test). Fixing (1) alone still matched 0/152. The page now
ports metafor's REML Fisher scoring for the two-coefficient model. Tolerance: 1e-6 relative for the iterative REML
quantities (the paper's trim-and-fill tolerance), 1e-9 absolute for p.

## Corpus

The extras reuse the 152 configurations of the paper corpus (`validate/corpus/corpus.json`, unchanged; same
SHA-256 as the original panel) from the publication archive
[pubbias-reproducible](https://github.com/mahmood726-cyber/pubbias-reproducible): the installed metadat 1.6-0
catalogue enumerated 114 datasets, 75 used and 39 excluded; `plus-corpus/dataset-disposition.json` is the archive's
per-dataset disposition (identical to the archive's `data/dataset-disposition.json` after CRLF-to-LF
normalisation; the pin is on the LF bytes that a git checkout produces), recording for every excluded dataset its columns and the reason
(no supplied effect/variance or supported paired binary structure with at least three finite positive-variance rows).
The replay checks that the used datasets' configurations are exactly the corpus.

- PET-PEESE: all 152 configurations (k = 3 to 1653).
- Leave-one-out: the 138 configurations with 4 <= k <= 100 (2,885 omissions). The cap at k = 100 excludes 6
  configurations (k = 113, 118, 136, 172, 678, 1653), whose leave-one-out is a recorded refusal; the 8 configurations
  with k = 3 refuse because each reduced data set would have 2 studies. Both refusals are compared exactly with R's.

## Tolerances and checks

Closed form: |app - R| / max(1, |R|) <= 1e-9. Trim-and-fill estimate (iterative REML): 1e-6, as in the paper.
p-values: |app - R| <= 1e-9. Counts (k0, df), sides, branches, flags and refusal reasons: exact. A refusal passes only
when both refuse with the same reason. Each configuration also has one display check: every displayed number has
exactly one node whose stored value equals the engine value and whose text is its formatted value; every refusal and
branch label is shown once with its reason; every flags cell lists exactly the true flags.

The 60,972 checks are 60,819 numerical/categorical comparisons (60,063 for the extras and 756 for Thompson-Sharp),
152 display checks and 1 disposition check.

**Result (offline replay, pinned native R 4.6.0, metafor 5.2-1, meta 8.5-0): 60,878/60,972 checks pass;
94 documented failures, 0 unexpected.** Measured 2026-10-19 in headless Chromium (page panel) and by the Node
mirror `check-plus.mjs` (60,725/60,819 numerical checks; the 153 display and disposition checks are browser-only).
The reference was regenerated on a second machine with `generate-plus.R` and agrees with the pinned file in every
one of its 105,121 numbers (difference 0). A second, independent oracle for PET, PEESE, the conditional branch and
the leave-one-out PET/PEESE estimates (base-R `lm(yi ~ x, weights = 1/vi)` and its own omission loop, not
`regtest`) agrees on 12,303/12,303 checks. Planted defects make the comparison fail (see Reproduce).

All documented failures belong to two classes, each decided by a generic rule (no dataset identifiers in the rules);
in both, R refuses because a REML fit inside the R call does not converge with default controls while the app returns
a value, and a documented R fallback agrees with the app at the stated tolerance:

- **parent-reml-refusal** (90 checks: `dat.baker2009/OR:Placebo:Salmeterol`, base row and every omission, 84;
  `dat.collins1985a/OR:d.xti:d.xci` omitting study 23, 6). The parent REML model required by the archive's call
  (rma for regtest; metabin's random-effects fit for metabias) does not converge. Fallback: `regtest` on the vectors;
  `metabin(..., method.tau="DL")`, which does not change the Peters/Harbord regression. This is the same cause as the
  three Baker Egger/Peters/Harbord exceptions of the original paper replay.
- **side-regression-refusal** (4 checks: `dat.karner2014/sgrq.md` omitting study 1 and
  `dat.karner2014/OR:tiotropium.deaths:placebo.deaths` omitting study 6). metafor's `trimfill` first fits the
  side-determining meta-regression `rma(yi, vi, mods=sqrt(vi))`, whose Fisher scoring does not converge with default
  controls; the page determines the side with its own REML slope fit. Refitting that regression with step halving
  (`control=list(stepadj=0.5, maxiter=1000)`) and passing its side to `trimfill` gives k0, side and estimate equal to
  the app's (k0 3 and 5; estimates agree to 1e-15). The fallback is recorded as a diagnostic, never as the reference.

Flags whose R value is undefined because of such a refusal inherit the class (53 of the 94; 41 are refusal checks).
They remain FAIL and are pinned by identity and class in `MANIFEST-plus.json`; a new, missing, reclassified or
changed failure fails the replay.

## Live tier

"Validate current PET-PEESE and leave-one-out in R" runs the same calls in the bundled webR (metafor 4.8-0,
meta 8.3-0) on the current input (3 to 100 studies) and compares every quantity the extras compute, including
refusals and flags. Versions are shown; the paper reference used metafor 5.2-1 and meta 8.5-0. An R parent-REML
refusal shows as a FAIL there too.

## Reproduce

From `pubbias-tests/`, with R 4.6.0, metafor 5.2-1, meta 8.5-0 and jsonlite (the script prints `.libPaths()` and
versions and stops on other metafor/meta versions):

    Rscript validate/generate-plus.R          # writes validate/plus-corpus/reference-plus-raw.json
    cd .. && node pubbias-tests/validate/pin-plus.mjs --drop-raw   # canonical JSON + LF, MANIFEST-plus.json, plus-pins.js
    node pubbias-tests/validate/check-plus.mjs                     # Node mirror of the replay (page engine extracted from index.html)
    node pubbias-tests/validate/check-plus.mjs --plant ts-intercept   # planted defect: Thompson-Sharp statistic/p must fail

    Rscript validate/generate-ts.R            # Thompson-Sharp reference -> plus-corpus/thompson-sharp-reference.json (LF)
    Rscript validate/lm-oracle-petpeese.R validate/corpus/corpus.json validate/plus-corpus/petpeese-lm-reference.json
    node pubbias-tests/validate/check-lm-petpeese.mjs [--plant]    # second PET/PEESE oracle (base-R lm), 12,303 checks
    node pubbias-tests/validate/check-original.mjs [index.html]    # Node mirror of the original 2,113-check paper replay

Measured counts, planted-defect outcomes and the before/after record are in `plus-corpus/comparison-plus.json`;
versions and tolerances in `plus-corpus/versions-plus.json`.

Browser tests: `hub/shared/tests/pubbias-tests-plus.spec.mjs` (worked example and keyboard use, BCG example with
labels, line-numbered input refusals, base-row identity on the corpus, identity negative, refusals, offline replay,
13 planted negatives, SHA-256 tamper, live webR `@slow`). These specs were not run on the lane machine (Playwright
is not installed there); the replay and negatives above were run in headless Chromium through the page's own panel.

| Item | Static or dynamic | Source |
|---|---|---|
| Inputs, disposition | Static, archive copies | validate/corpus/corpus.json, plus-corpus/dataset-disposition.json |
| R references | Generated by native R, SHA-256 pinned on LF bytes | generate-plus.R, plus-corpus/reference-plus.json |
| Rule, tolerances, LOO range, documented-class rule | Static | plus-engine.js, plus-compare.js |
| App values, flags, display | Dynamic, recomputed on every replay | page engine + plus-engine.js |

## Scope

This panel checks the extras' numbers, labels, refusals and flags against R and audits the rendered values. It does
not check the original page's table (see the original panel), it draws no plot, and it does not resist CSS
deliberately injected into the page. Agreement with R on this corpus is numerical parity on these configurations;
it does not show that any publication-bias method detects bias, and leave-one-out flags are descriptive sensitivity,
not evidence of bias. Small-study tests have low power with few studies.
