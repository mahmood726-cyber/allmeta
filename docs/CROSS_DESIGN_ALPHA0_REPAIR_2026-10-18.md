# Cross-design alpha=0 isolation

This bounded repair makes the documented zero-borrowing endpoint use RCTs alone
for both DerSimonian-Laird heterogeneity estimation and inverse-variance pooling.
Previously, observational rows affected tau-squared before their final weights
were set to zero. The input study counts remain descriptive counts of all rows.
With no RCTs, estimates and confidence limits remain null, tau-squared is zero
(no active studies), and the table/plot explicitly report non-estimability.
The plot no longer throws before updating the export-state provider.

For positive alpha, including alpha=1, the existing estimator is unchanged.
This preserves the existing discontinuity at alpha=0: for 0 < alpha < 1,
heterogeneity still uses all studies without discounting. This repair does not
validate that approximation as a full Bayesian power-prior model. Input parser
hardening, other estimators, and other applications are outside this change.

## Counterexample and independent calculation

The tests use synthetic RCT rows (yi, vi) = (-0.2, 0.01), (0.5, 0.25),
and synthetic observational rows (-4, 0.01), (6, 0.02). These are software test
inputs, not clinical findings. The previous alpha=0 estimate is +0.1479383949.
The independent RCT-only DL calculation gives tau-squared = 23/200 = 0.115,
mu = -3/140, and SE-squared = 73/784. Thus the correct endpoint estimate is
-0.0214285714, with SE = sqrt(73/784). Exact rational arithmetic in Python
checks all five reported numerical fields; the real Chromium UI checks the
result table, actual engine output, non-estimability, and state recovery.

Fresh reference generation used R 4.6.0, metafor 5.0.1, metadat 1.6.0 and
jsonlite 2.0.0. The version-checked script and generated JSON are committed in
`tests/fixtures/cross-design-alpha0-reference.R` and
`tests/fixtures/cross-design-alpha0-oracle.json`. Seven cases cover heterogeneous,
single-RCT, null-effect, alpha=1 and observational-only alpha=1 inputs, plus the
random-allocation subset of `metadat::dat.bcg` with explicitly synthetic added
observational rows. The original BCG source records are included, and log risk
ratios/variances are recalculated from their four cell counts. Comparator:
`metafor::rma.uni(method="DL", test="z", level=95)`; k=1 uses the equivalent
equal-effects calculation. Maximum permitted absolute difference is 1e-6.

References: [metafor rma.uni documentation](https://wviechtb.github.io/metafor/reference/rma.uni.html),
[metadat BCG source documentation](https://wviechtb.github.io/metadat/reference/dat.bcg.html).
The BCG fixture is reused from metadat under its GPL-2-or-later licence.

## Reproduction and evidence limits

From the repository root:

```text
Rscript tests/fixtures/cross-design-alpha0-reference.R
python -m pytest tests/test_cross_design.py tests/test_real_data_calibration.py -q
```

From `hub/shared/tests` after `npm ci` and installing Chromium:

```text
npx playwright test --config=cross-design.config.mjs --reporter=line
```

Before repair, the final focused Python suite failed 18 tests and passed 16;
the genuine HTTP Chromium suite failed 2 and passed 1. After repair, the focused
Python plus real-data calibration suite passed 43 tests and Chromium passed all
3 tests. The seven R cases were freshly generated locally; CI replays their
committed outputs. CI execution is not a fresh R run or human review.

| Item | Static or dynamic | Disclosure |
|---|---|---|
| Adversarial synthetic rows | Static inputs | Regression fixtures only |
| BCG rows | Read from pinned metadat | Original source fields retained |
| R expected values | Freshly calculated then stored | Version-checked regeneration script |
| Python rational oracle | Calculated during tests | Independent of JavaScript helpers |
| Browser output | Calculated from actual served source | No mocked engine or DOM |

This document records scoped verification, not comprehensive application
certification. Manual methodological review and exact-head release checks are
separate requirements under the repository quality policy. Previously exported
mixed-design alpha=0 analyses should be rerun with the corrected version.
