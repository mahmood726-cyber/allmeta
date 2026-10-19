# DTA SROC import integrity — 15 October 2026

## Scope and approval

Mahmood's latest `Merge` instruction follows the DTA input-integrity audit and authorises this bounded correction once its review and CI gates pass. It does not authorise unrelated pending statistical PRs, the separate Heterogeneity proposals, or a claim of comprehensive app certification. This branch starts at actual main `4a053dd6c43d7adb4831b4fab07ed618e265eb4f`, retaining both Forest CSV PR #114 and the separately merged Limit-MA PR #115. No statistical estimator, shared numerical core, reference value, tolerance, or repository setting changes are included.

## Verified original behaviour

Original DTA file blob: `565b8f6e36524d66bab69364381325b1247ae8cc`.

The native parser treated any malformed numeric row among the first three physical lines as a possible header when no study had been accepted. Later invalid rows were warned about but removed before fitting the remaining set. The input below therefore leaves four valid studies and no parser warning for the first invalid record:

```text
BadTrial,-1,2,3,4
A,80,12,20,88
B,60,10,40,90
C,70,18,30,82
D,90,15,10,85
```

The original `parseFloat` path also accepts `80garbage` as 80 and fractional count 80.5. These are source-reproduced input-contract defects. A valid five-study pooled result cannot be supplied for a negative TP count; no corrected clinical effect or patient harm is inferred.

## Correction

The native parser recognises a TP/FP/FN/TN header explicitly, requires whole-person nonnegative safe-integer counts and positive diseased/non-diseased denominators, and blocks the entire analysis on any malformed record. Legitimate individual zero cells still follow the selected continuity-correction rule. Recognised native comments remain comments, not study records.

The CSV adapter checks exact unique headers, all parser warnings, all count matrices, compatible covariate mode, and lossless conversion into the native representation before accepting input. A failed upload clears the preceding fit and reports rejection as literal text. Pasted CSV remains available for correction, and Undo restores the preceding analysis. An omitted optional study column produces explicit numbered labels. Comment-like or multiline imported labels cannot silently become native comments or extra studies.

## Verification record

The current main Pages artifact from run `38769255364`, artifact `11990439528`, was downloaded and the DTA source blob matched the repository. The earlier proposed patch applies to this actual full application; it was previously checked only against a synthetic scaffold. Both inline application scripts passed local `node --check`. The committed candidate differs from the local patch by one harmless whitespace-only change in `deeksSvg`; candidate blob `222154a5625398973bb1aef0a9cefbdb5df193f2` matches the locally verified file.

Local Chromium navigation was blocked before application load with `ERR_BLOCKED_BY_ADMINISTRATOR`. No local browser pass is claimed. The new `hub/shared/tests/dta-import-atomic.spec.mjs` contains 16 browser cases, including malformed first/middle records, valid zero cells, negative/missing counts, duplicate/fuzzy headers, Undo, actual file upload with a quoted comma label, and the optional study column. These tests run against the actual application, not a parallel reimplementation. Current-head execution evidence belongs in the PR timeline and GitHub Actions logs; writing tests is not a pass.

The read-only DTA workflow runs `npx playwright test dta csv-upload --reporter=line`, including the existing `dta-bivariate-mada-parity.spec.mjs`. That suite compares the JavaScript engine and application controls against stored mada 0.5.12 reference outputs for its six example datasets, five estimation methods and relevant correction/meta-regression settings. This is stored-reference replay, NOT fresh R execution. Full shared-tests, wider Playwright and lint remain separate pre-merge gates. No checks have been relaxed or removed.

## Remaining review

This is not an exhaustive tokenizer or application audit. Shared CSV unmatched quotes and extra row-cell handling remain separate work, as do model validation on JSON/state import, validation-state freshness, exports/receipts, mobile/accessibility, numerical extremes and the scientific suitability of pooling each dataset. The native representation treats leading fields as a label, so explicit column interpretation remains important. None of the existing full-app completion flags should be changed to true on the strength of this repair.
