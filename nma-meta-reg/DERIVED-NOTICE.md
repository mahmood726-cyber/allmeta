# Derived-number notice: nma-meta-reg

Synthetic R-backed stress inputs: `../hub/shared/tests/unit/tau-bracketing-reference.R` and adjacent JSON. Baseline: `a3f20c28096cb41c1f333bdd187ac00d92e5ef31`. No existing local corpus/reference JSON or paper text was edited. These are software stress cases, not clinical findings.

PM expansion no longer returns an unbracketed endpoint. Extreme-unit NMA normal equations normalize weights before inversion and rescale covariance back. Non-finite searches refuse visibly. The R generator fits regressions in normalized units then transforms back explicitly.

Every changed numeric leaf of the exercised public API is listed below, including values previously unavailable because of a refusal. R directly checks the PM root and regression coefficient/SE contract; remaining derived outputs retain their existing formulas. Reproduce with `node hub/shared/tests/unit/tau-downstream-report.mjs`; complete raw outputs are in `../tau-audit/downstream-before-after.json`.

| Dataset / field | Before | After |
|---|---:|---:|
| `nma-meta-reg.regression.xMean` | unavailable: singular | 2 |
| `nma-meta-reg.regression.xRange.min` | unavailable: singular | 2 |
| `nma-meta-reg.regression.xRange.max` | unavailable: singular | 2 |
| `nma-meta-reg.regression.beta_at_mean.B.estimate` | unavailable: singular | 4686190397.472767 |
| `nma-meta-reg.regression.beta_at_mean.B.se` | unavailable: singular | 11461504782.712639 |
| `nma-meta-reg.regression.beta_at_mean.B.ci_lo` | unavailable: singular | -17777946185.277584 |
| `nma-meta-reg.regression.beta_at_mean.B.ci_hi` | unavailable: singular | 27150326980.223118 |
| `nma-meta-reg.regression.gamma.B.estimate` | unavailable: singular | 5940426338.770072 |
| `nma-meta-reg.regression.gamma.B.se` | unavailable: singular | 7943920295.870626 |
| `nma-meta-reg.regression.gamma.B.ci_lo` | unavailable: singular | -9629371337.193127 |
| `nma-meta-reg.regression.gamma.B.ci_hi` | unavailable: singular | 21510224014.73327 |
| `nma-meta-reg.regression.predictions.0.x` | unavailable: singular | 2 |
| `nma-meta-reg.regression.predictions.0.perTreatment.A.estimate` | unavailable: singular | 0 |
| `nma-meta-reg.regression.predictions.0.perTreatment.A.se` | unavailable: singular | 0 |
| `nma-meta-reg.regression.predictions.0.perTreatment.A.ci_lo` | unavailable: singular | 0 |
| `nma-meta-reg.regression.predictions.0.perTreatment.A.ci_hi` | unavailable: singular | 0 |
| `nma-meta-reg.regression.predictions.0.perTreatment.B.estimate` | unavailable: singular | 4686190397.472767 |
| `nma-meta-reg.regression.predictions.0.perTreatment.B.se` | unavailable: singular | 11461504782.712639 |
| `nma-meta-reg.regression.predictions.0.perTreatment.B.ci_lo` | unavailable: singular | -17777946185.277584 |
| `nma-meta-reg.regression.predictions.0.perTreatment.B.ci_hi` | unavailable: singular | 27150326980.223118 |
| `nma-meta-reg.regression.tau2` | unavailable: singular | 484671615807068960000 |
| `nma-meta-reg.regression.Q` | unavailable: singular | 3.000000000000001 |
| `nma-meta-reg.regression.n` | unavailable: singular | 5 |
| `nma-meta-reg.regression.p` | unavailable: singular | 2 |
