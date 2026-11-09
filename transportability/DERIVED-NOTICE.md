# Derived-number notice: transportability

Synthetic R-backed stress inputs: `../hub/shared/tests/unit/tau-bracketing-reference.R` and adjacent JSON. Baseline: `a3f20c28096cb41c1f333bdd187ac00d92e5ef31`. No existing local corpus/reference JSON or paper text was edited. These are software stress cases, not clinical findings.

PM expansion no longer returns an unbracketed endpoint. Extreme-unit NMA normal equations normalize weights before inversion and rescale covariance back. Non-finite searches refuse visibly. The R generator fits regressions in normalized units then transforms back explicitly.

Every changed numeric leaf of the exercised public API is listed below, including values previously unavailable because of a refusal. R directly checks the PM root and regression coefficient/SE contract; remaining derived outputs retain their existing formulas. Reproduce with `node hub/shared/tests/unit/tau-downstream-report.mjs`; complete raw outputs are in `../tau-audit/downstream-before-after.json`.

| Dataset / field | Before | After |
|---|---:|---:|
| `transportability.regression.tau2` | 1152921504606847000 | 484671615807068960000 |
| `transportability.regression.q` | 4.486327682898222 | 1.0000000000000002 |
| `transportability.regression.trialMean` | 1.8512294510313227 | 1.967200709615475 |
| `transportability.regression.slope.est` | 9124470635.212147 | 5940426338.770073 |
| `transportability.regression.slope.se` | 7809755630.17801 | 7943920295.870626 |
| `transportability.regression.slope.ciLo` | -15729657315.216106 | -19340673456.291267 |
| `transportability.regression.slope.ciHi` | 33978598585.6404 | 31221526133.831413 |
| `transportability.regression.slope.t` | 1.1683426559409733 | 0.7477953098117058 |
| `transportability.regression.slope.p` | 0.32706972222596953 | 0.5088649367559661 |
| `transportability.regression.atTrialMean.x` | 1.8512294510313227 | 1.967200709615475 |
| `transportability.regression.atTrialMean.est` | 5985126111.778709 | 4491348628.979567 |
| `transportability.regression.atTrialMean.se` | 11653499613.01005 | 11458542795.788536 |
| `transportability.regression.atTrialMean.ciLo` | -31101510675.26966 | -31974848555.41234 |
| `transportability.regression.atTrialMean.ciHi` | 43071762898.82708 | 40957545813.371475 |
| `transportability.regression.transported.est` | 7342578617.227797 | 4686190397.472767 |
| `transportability.regression.transported.se` | 11711275578.829931 | 11461504782.712639 |
| `transportability.regression.transported.ciLo` | -29927927078.77825 | -31789433151.262043 |
| `transportability.regression.transported.ciHi` | 44613084313.23385 | 41161813946.20758 |
| `transportability.regression.shift` | 1357452505.4490864 | 194841768.49319968 |
