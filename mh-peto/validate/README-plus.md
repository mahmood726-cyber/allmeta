# mh-peto v2 additions: heterogeneity, CMH / Tarone / Breslow-Day, leave-one-out and rare-event conventions

These are checked against native R on the full archive corpus of
[mhpeto-reproducible](https://github.com/mahmood726-cyber/mhpeto-reproducible). The corpus has 336 configurations,
each run as OR, RR and RD (1,008 configuration-measures). It is unchanged and has the same SHA-256 as the paper replay.
Configurations with fewer than 2 tables (84 x 3) are refused by the page and skipped by R.

| Addition | Page | R reference (metafor 5.2-1 / meta 8.5-0) |
|---|---|---|
| Cochran's Q, p, I², H² for MH (OR, RR, RD) and Peto OR | Heterogeneity table, export `mh_QE` ... `peto_H2` | `rma.mh(ai,bi,ci,di, measure, add=c(.5,0), to=c("only0","none"), drop00=c(FALSE,FALSE), correct=FALSE)`, `rma.peto(ai,bi,ci,di, add=0, to="none", drop00=TRUE)`: `QE, QEp, I2, H2` |
| Cochran-Mantel-Haenszel, Tarone, Breslow-Day (OR) | Association table, export `cmh` ... `breslow_day_p` | the same `rma.mh` fit: `MH, MHp, TA, TAp, BD, BDp` |
| Leave-one-out of MH and Peto (estimate, SE, z, p, CI, Q, Q p, I², H²; p<0.05 crossing flag) | "Run leave-one-out" (one click), CSV | `leave1out()` of both fits; the flag compares R's own p-values |
| Rare-event conventions: meta's default MH and inverse-variance fixed effect | Conventions table, export `metamh_*`, `ivfe_*` | `meta::metabin(ai,n1i,ci,n2i, sm, method="MH")` with its defaults (incr 0.5 to zero-cell studies, allstudies FALSE, MH.exact FALSE); `rma(yi, vi, data=escalc(measure, ai,bi,ci,di), method="EE")` |

`analyse()` in `mh-peto/index.html` computes every one of these numbers, and `run()` renders them, so the page
table, the export and the check all use the same values. `leaveOneOut()` calls `analyse()` on each reduced set of
tables. Leave-one-out needs at least 3 tables, so that each reduced set can still be pooled; with fewer it is refused
with that reason, and R's `leave1out` is not run either.

## Tolerances

- Values: |app - R| / max(1, |R|) <= 1e-9.
- p-values: absolute difference <= 1e-9.
- Flags and refusals: exact.
- A null (R `NA` or an R error) matches only a null.

These are the archive's full-precision tolerances. None is widened.

## Result

**120,000/120,010 checks pass; 10 documented failures, 0 unexpected.** The 120,010 checks cover 1,008
configuration-measures and break down as follows:

| Family | Checks |
|---|---|
| Full-data MH | 7,560 |
| Full-data Peto | 2,520 |
| CMH / Tarone / Breslow-Day | 1,512 |
| Leave-one-out MH (6,837 omissions x 11, including the flag) | 75,207 |
| Leave-one-out Peto (2,279 x 11) | 25,069 |
| Conventions | 7,560 |
| Refusals and skips | 582 |

The largest differences are 2.3e-12 for Tarone/Breslow-Day (1.4e-12 for their p-values) and 2.4e-13 for I² (full
data and leave-one-out). All other families are at or below
8e-14. Measured on 2026-10-19 by `check-plus.mjs` (Node, with the engine extracted verbatim from the page).
Per-family counts are in `plus-corpus/comparison-plus.json`.

Further checks:

- **Leave-one-out through the real UI path.** In headless Chromium, each configuration was loaded, the button was
  clicked and the result compared with `leave1out`: 91,577/91,577, with 417 refusals (k < 3) agreeing.
- **Archived reference.** A fresh `rma.mh`/`rma.peto` run agrees with the archive's own metafor 5.2-1
  `reference.json` on all 7,472 shared values (max 4.9e-15).

**Documented failures (class `metabin-reml-refusal`, 10 checks).** `meta::metabin(method="MH")` fits a REML tau²
for its heterogeneity output even with `random = FALSE`. For `dat.baker2009|exac|Placebo vs Salmeterol` (OR and
RR), that fit does not converge and metabin stops. As a diagnostic, `metabin(..., method.tau = "DL")` was run. tau²
does not enter the common-effect MH estimate, and this run equals the app on all 5 quantities. The classification
rule is generic and contains no dataset identifiers. The checks remain FAIL and are pinned by identity in
`MANIFEST-plus.json`.

**Planted defects.** Each of the following makes the comparison fail (exit code 1):

| Planted defect | Unexpected failures |
|---|---|
| Tarone term x (1 + 1e-7) | 450 |
| Continuity-corrected CMH | 468 |
| Leave-one-out omits the wrong table | 83,536 |
| I² computed with k instead of k - 1 | 6,383 |
| meta-default MH keeping double-zero tables | 288 |

**Text claims (test-backed).** Two sentences on the page are about R calls other than the validated ones. They are
checked by `check-plus.mjs` against `plus-corpus/claims-plus.json` (written by `generate-plus.R`; SHA-256 pinned
in `MANIFEST-plus.json` under `claims`). These 3,793 checks are counted separately from the 120,010 above:

| Claim on the page | Check | Result |
|---|---|---|
| For OR and RR, `metabin(..., method = "MH", MH.exact = TRUE)` matches the page | beta, SE and p equal the page's MH at 1e-9 | OR 756/756, RR 756/756 |
| For RD, meta's MH variance differs from metafor's | beta equal at 1e-9; SE differs | 252/252 and 252/252 (p differs in 217/252) |
| `rma.mh` with metafor's defaults gives the same pooled estimate | beta equal at 1e-9 | 756/756 |
| ... but a different Q when a table has no events (or only events) in both groups | Q differs exactly on those configuration-measures | 754/754 (172 differ; 2 have no Q under either call) |
| ... and a continuity-corrected CMH | CMH differs, except where \|O - E\| = 0.25 (where (\|O - E\| - 0.5)² = (O - E)²) | 252/252 (1 such case) |
| Pinned double-zero example (rv610 review, `102_struct_k4`, OR and RR) | page Q, p, I², H² (and CMH) equal the stated call; the default call differs in Q, I² (and CMH). RR: I² 0% on the page, 32.8% with the default | 15/15 |

Planted claim defects: Q leaving out double-zero and all-event tables (as `drop00 = TRUE` would),
`--plant q-drops-double-zero`: 3,609/3,793; MH RR variance x (1 + 1e-7), `--plant mh-rr-variance`: 3,391/3,793. Both
exit 1.

**Paper replay unchanged.** The primary 68,461-check replay (Tier 2, `adapter.js`) gives 68,461/68,461 before
(2cd75db) and after, with tails 106/106, in headless Chromium. All 26,208 exported values of the 1,008
configuration-measures are identical before and after.

## What this is, and is not

- Q/I², CMH, Tarone, Breslow-Day and leave-one-out are R parity: `print(rma.mh(...))` and `leave1out()` give them in
  a few lines of R.
- The conventions table shows, in one place, the pooled result under the conventions of the two main R packages,
  together with Peto and an inverse-variance fixed effect. To reproduce it in R, a user needs two packages, several
  calls and knowledge of `MH.exact`. On sparse data the conventions can disagree on significance: the page flags
  this, and the flag rule is shown on the page. These are conventions, not errors, and none is "more accurate".
- The live webR check ("Validate this analysis in R") still compares only the pooled estimates. The additions are
  checked here and by the exported self-checking R script.

## Reproduce

From `mh-peto/`, with R 4.6.0, metafor 5.2-1, meta 8.5-0 and jsonlite (the script prints `.libPaths()` and versions,
and stops on other metafor/meta versions; 6 to 8 minutes):

    Rscript validate/generate-plus.R                # -> validate/plus-corpus/reference-plus.json + claims-plus.json (LF)
    Rscript validate/generate-plus.R --claims-only  # -> claims-plus.json only (about 5 minutes)

From the repository root:

    node mh-peto/validate/check-plus.mjs            # 120,010 checks + pin/count/identity contract; 3,793 claim checks + contract
    node mh-peto/validate/check-plus.mjs --plant tarone   # also: cmh-continuity-correction, loo-omits-wrong-table,
                                                    #       i2-uses-k, metamh-keeps-double-zero,
                                                    #       q-drops-double-zero, mh-rr-variance (claims)

Browser tests: `hub/shared/tests/mh-peto-v2.spec.mjs`, `validate-mh-peto.spec.mjs`, `validate-integration.spec.mjs`,
`mh-peto-sanity.spec.mjs` and `mh-peto-bus.spec.mjs`. Run record: Playwright 1.59.1, msedge, `--workers=1`, on the
commit that added the text claims (parent 0064c4f): 76/76 passed (mh-peto-v2 30/30, validate-mh-peto 10/10 including
the 68,461/68,461 replay with tails 106/106, validate-integration 26/26, mh-peto-sanity 6/6, mh-peto-bus 4/4). Earlier
record: 74/74 on ee4af92 (lane p610b). Six shared specs hard-code `localhost:8088`; they were run as untracked
port-swapped copies.

| Item | Static or dynamic | Source |
|---|---|---|
| Corpus | Static, archive copy | validate/corpus/corpus.json (SHA-256 in MANIFEST.json and MANIFEST-plus.json) |
| R references | Generated by native R, SHA-256 pinned on LF bytes | generate-plus.R, plus-corpus/reference-plus.json |
| Tolerances, documented-class rule | Static | check-plus.mjs |
| App values | Dynamic, recomputed on every run | analyse() / leaveOneOut() in index.html |
