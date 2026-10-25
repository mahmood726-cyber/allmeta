# Straight Path advice

[Back to the guides](README.md)

Straight Path reads the app's current results, choices and available source records, then displays applicable methods advice. **It is advisory only and never changes a result or selects a model for you.** Open **Straight path** to read Recommended analysis, Pitfalls and Uncertainty; use **Why?** for the stored evidence and **Rules checked** to see which rules were considered. The compact notice can be dismissed. Sources: `shared/alm-straight.js` and `shared/alm-straight-ui.js`; browser contract: `hub/shared/tests/features-straight.spec.mjs`; notice and placement contracts: `hub/shared/tests/unit/alm-straight.test.mjs`.

## Where it appears

The app numbers below come from the headers of the named adapters. These are the current placements tested in `hub/shared/tests/features-straight.spec.mjs` and `hub/shared/tests/unit/alm-straight.test.mjs`.

| App | Source of its Straight Path inputs |
| --- | --- |
| 3: [Diagnostic accuracy](../../dta-sroc/index.html) | `dta-sroc/alm-straight.js` |
| 9: [Proportion meta-analysis](../../proportion-ma/index.html) | `proportion-ma/alm-straight.js` |
| 16: [Network inconsistency](../../nma-inconsistency/index.html) | `nma-inconsistency/alm-straight.js` |
| 17: [Correlation meta-analysis](../../correlation-ma/index.html) | `correlation-ma/alm-straight.js` |
| 18: [Multivariate meta-analysis](../../multivariate-ma/index.html) | `multivariate-ma/alm-straight.js` |

## Advice currently implemented

The active rule table in `shared/alm-straight.js` contains the approved **7 rules and 2 uncertainty statements**, asserted by `hub/shared/tests/unit/alm-straight.test.mjs`. The table below paraphrases those messages. All trigger conditions and placements come from that implementation; the unit contract tests a triggering case and a non-triggering control for each rule. `hub/shared/tests/features-straight.spec.mjs` exercises the advice in the listed apps.

| Rule | When the prompt matters | Where it is placed |
| --- | --- | --- |
| SP-REC-SMALLK | A small random-effects analysis uses DerSimonian–Laird or lacks Hartung–Knapp intervals; review estimator and interval choices. | Proportion, correlation |
| SP-PIT-I2ZERO | Displayed I² is near zero with few studies; that does not establish agreement between studies. | Proportion, correlation |
| SP-PIT-NONSIG | A confidence interval includes no effect; avoid interpreting this as proof of no effect. | Correlation, multivariate |
| SP-PIT-CLUSTER | Recorded provenance flags a cluster trial entered without a clustering adjustment; review its handling. | Proportion |
| SP-REC-DTA-SROC | Sensitivity and specificity are pooled separately, a Moses model is used, or the app flags varying thresholds; review bivariate/HSROC modelling and the SROC curve. | Diagnostic accuracy |
| SP-PIT-FUNNELSMALLK | A small-study test is shown with few studies; interpret it cautiously. | Diagnostic accuracy |
| SP-PIT-NMACONSIST | An inconsistency test is not statistically significant; assess whether studies are clinically and methodologically comparable. | Network inconsistency |
| SP-UNC-SMALLK | Few studies, or few per network comparison, make between-study variation and related estimates imprecise. | All apps in the table above |
| SP-UNC-WIDEPI | The prediction interval includes no effect while the confidence interval excludes it; the effect in a new setting remains uncertain. | Correlation; also registered for proportion, where it is inapplicable because a single-group proportion has no no-effect value |

## Limits

Advice depends on the fields the app supplies. A rule with missing required information reports **not applicable**; silence is not evidence that the analysis is sound. The clustering prompt depends on recorded provenance, so it does not discover trial design from unlabelled analysis rows. Recommendations do not add unavailable model options or apply adjustments. These boundaries follow `shared/alm-straight.js` and `shared/alm-straight-ui.js`, tested in `hub/shared/tests/unit/alm-straight.test.mjs` and `hub/shared/tests/features-straight.spec.mjs`.
