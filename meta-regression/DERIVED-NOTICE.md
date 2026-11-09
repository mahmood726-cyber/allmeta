# Derived-number notice: meta-regression

Synthetic R-backed stress inputs: `../hub/shared/tests/unit/tau-bracketing-reference.R` and adjacent JSON. Baseline: `a3f20c28096cb41c1f333bdd187ac00d92e5ef31`. No existing local corpus/reference JSON or paper text was edited. These are software stress cases, not clinical findings.

PM expansion no longer returns an unbracketed endpoint. Extreme-unit NMA normal equations normalize weights before inversion and rescale covariance back. Non-finite searches refuse visibly. The R generator fits regressions in normalized units then transforms back explicitly.

Every changed numeric leaf of the exercised public API is listed below, including values previously unavailable because of a refusal. R directly checks the PM root and regression coefficient/SE contract; remaining derived outputs retain their existing formulas. Reproduce with `node hub/shared/tests/unit/tau-downstream-report.mjs`; complete raw outputs are in `../tau-audit/downstream-before-after.json`.

| Dataset / field | Before | After |
|---|---:|---:|
| `meta-regression.permutation.p` | 0.48333333333333334 | 0.5666666666666667 |
| `meta-regression.permutation.tObs` | 1.0702809991096423 | 0.7477953098117054 |

The after p-value is independently checked against exact `metafor::permutest` in the R generator (`permutationP`), in addition to the slope t assertion.
