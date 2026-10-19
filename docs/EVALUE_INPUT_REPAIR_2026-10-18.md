# E-value input integrity

PR #125 repairs the standalone E-value app's input contract. A complete finite
confidence interval must contain the point estimate; ratio-scale values must
be positive. A deliberately omitted interval yields no CI E-value. Refusals
clear the previous table, interpretation, plot and result accessor.

The remaining defect was the browser's number-input state: unfinished text such
as `1e` or `-` can expose an empty `.value` with `validity.badInput == true`.
If the other CI field was blank too, the PR accepted this as missing uncertainty.
The reader now checks `badInput` before checking for an empty value and returns
an invalid numeric sentinel, which the existing finite-input guard refuses.
The shared numerical engine and effect-measure approximations are unchanged.

## Verification

- 12 focused Python tests pass, including an independent 50-digit decimal
  solution of the equal-strength confounding bound and reciprocal symmetry.
- Fresh R 4.6.0 execution of unmodified EValue 4.1.4 source functions agrees with
  the engine for 13 synthetic RR/OR/HR cases at absolute tolerance 1e-6. Cases
  cover protective/harmful/null effects, missing CI, null crossing, near-null,
  large effects, and rare/common outcome conversions. The source files are
  pinned by Git blob hash; jsonlite 2.0.0 writes the fixture. This executes source
  functions, not an installed EValue package namespace. The CI=missing case is
  checked through the browser UI because the unchanged engine still returns 1.
- The existing full Python suite passed 415 tests with 5 optional linkedom skips
  before adding the nine new numerical cases. The expanded focused suite above
  passed afterward. Lint, citation grounding and repository drift checks pass.
- 36 genuine HTTP Chromium tests are prepared: original CI integrity cases,
  typed malformed lower/upper/both/point inputs, clearing/recovery, completed
  scientific notation, and the 13 R-reference UI comparisons. They assert actual
  browser `badInput` states and do not mock the DOM or calculation engine.
- Local browser execution is blocked before app load by `connect EACCES` on
  127.0.0.1:8000. No local browser pass is claimed. The dedicated read-only
  workflow and existing full/shared browser workflows must pass at the final
  PR head before merge; an older passing run is not sufficient.

Reproduction from the repository root:

```text
Rscript tests/fixtures/evalue-input-reference.R SOURCE_DIR
python -m pytest tests/test_evalue.py -q
```

Obtain `R/EValue.R`, `R/effect_measures.R`, and `R/utils.R` in SOURCE_DIR from
[the pinned CRAN EValue mirror](https://github.com/cran/EValue/tree/44c2dc41ce49444619bc2d97c16d87c7caef6f07).
The script verifies their exact Git blob hashes before sourcing them.
Run `npx playwright test --config=evalue.config.mjs --reporter=line` from
`hub/shared/tests` after installing its locked dependencies and Chromium.

| Item | Static or dynamic | Disclosure |
|---|---|---|
| Regression inputs | Static | Explicitly synthetic software test cases |
| R reference values | Fresh calculation, stored for replay | Pinned external source; no altered formulas |
| Decimal reference | Calculated in tests | Independent of the JavaScript helpers |
| Browser output | Actual served app | Keystrokes and UI results, no mocked input validity |

Existing automated PR review was quota-blocked; there were no formal reviews or
inline review threads at initial inspection. Exact-head CI and review state must
be checked again before merge. This scoped input repair is not comprehensive
application certification or independent human methodological review.
