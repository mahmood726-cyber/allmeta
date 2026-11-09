# Derived-number notice: multiplicative-nma

Synthetic R-backed stress inputs: `../hub/shared/tests/unit/tau-bracketing-reference.R` and adjacent JSON. Baseline: `a3f20c28096cb41c1f333bdd187ac00d92e5ef31`. No existing local corpus/reference JSON or paper text was edited. These are software stress cases, not clinical findings.

PM expansion no longer returns an unbracketed endpoint. Extreme-unit NMA normal equations normalize weights before inversion and rescale covariance back. Non-finite searches refuse visibly. The R generator fits regressions in normalized units then transforms back explicitly.

Every changed numeric leaf of the exercised public API is listed below, including values previously unavailable because of a refusal. R directly checks the PM root and regression coefficient/SE contract; remaining derived outputs retain their existing formulas. Reproduce with `node hub/shared/tests/unit/tau-downstream-report.mjs`; complete raw outputs are in `../tau-audit/downstream-before-after.json`.

| Dataset / field | Before | After |
|---|---:|---:|
| `multiplicative-nma.intercept.effects.A.estimate` | unavailable: singular network design (is the network connected?) | 0 |
| `multiplicative-nma.intercept.effects.A.seFE` | unavailable: singular network design (is the network connected?) | 0 |
| `multiplicative-nma.intercept.effects.A.se` | unavailable: singular network design (is the network connected?) | 0 |
| `multiplicative-nma.intercept.effects.A.ciLo` | unavailable: singular network design (is the network connected?) | 0 |
| `multiplicative-nma.intercept.effects.A.ciHi` | unavailable: singular network design (is the network connected?) | 0 |
| `multiplicative-nma.intercept.effects.B.estimate` | unavailable: singular network design (is the network connected?) | 6000000000.000001 |
| `multiplicative-nma.intercept.effects.B.seFE` | unavailable: singular network design (is the network connected?) | 5477225575.0516615 |
| `multiplicative-nma.intercept.effects.B.se` | unavailable: singular network design (is the network connected?) | 12186057606.953943 |
| `multiplicative-nma.intercept.effects.B.ciLo` | unavailable: singular network design (is the network connected?) | -27833919994.48507 |
| `multiplicative-nma.intercept.effects.B.ciHi` | unavailable: singular network design (is the network connected?) | 39833919994.48507 |
| `multiplicative-nma.intercept.Q` | unavailable: singular network design (is the network connected?) | 19.8 |
| `multiplicative-nma.intercept.df` | unavailable: singular network design (is the network connected?) | 4 |
| `multiplicative-nma.intercept.phi` | unavailable: singular network design (is the network connected?) | 4.95 |
| `multiplicative-nma.intercept.I2` | unavailable: singular network design (is the network connected?) | 0.797979797979798 |
| `multiplicative-nma.intercept.n` | unavailable: singular network design (is the network connected?) | 5 |
| `multiplicative-nma.intercept.p` | unavailable: singular network design (is the network connected?) | 1 |
| `multiplicative-nma.intercept.level` | unavailable: singular network design (is the network connected?) | 0.95 |
| `multiplicative-nma.intercept.tCrit` | unavailable: singular network design (is the network connected?) | 2.776445105197749 |
| `multiplicative-nma.intercept.additive.tau2` | unavailable: singular network design (is the network connected?) | 419192049388624000000 |
| `multiplicative-nma.intercept.additive.aic` | unavailable: singular network design (is the network connected?) | 256.3615507980783 |
| `multiplicative-nma.intercept.additive.logLik` | unavailable: singular network design (is the network connected?) | -126.18077539903916 |
| `multiplicative-nma.intercept.multiplicative.phi` | unavailable: singular network design (is the network connected?) | 4.95 |
| `multiplicative-nma.intercept.multiplicative.phiML` | unavailable: singular network design (is the network connected?) | 3.96 |
| `multiplicative-nma.intercept.multiplicative.aic` | unavailable: singular network design (is the network connected?) | 257.8140214075712 |
| `multiplicative-nma.intercept.multiplicative.logLik` | unavailable: singular network design (is the network connected?) | -126.90701070378562 |
| `multiplicative-nma.intercept.aicDiff` | unavailable: singular network design (is the network connected?) | -1.4524706094928774 |
