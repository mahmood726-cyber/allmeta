# Derived-number notice: P05 heterogeneity

Baseline: `a3f20c28096cb41c1f333bdd187ac00d92e5ef31` (HEAD and origin/main at audit). No manuscript or paper text was edited. Inputs below are synthetic regression cases, not clinical findings.

PM/EB previously returned the unbracketed endpoint 2^30. Expansion now continues until Q crosses its target, or throws a visible RangeError on non-finite arithmetic. Q-profile already passed the reported scale cases in this baseline; its arbitrary 200-doubling refusal is now removed.

Both original R generators were rerun with R 4.6.0 / metafor 5.2.1. All numerical objects are identical. Regeneration differs only in line endings and Q-profile provenance reporting installed jsonlite 2.0.0 (unused). Original reference JSON files remain unchanged.

## App versus R reproduction

DL here is core DL; the page deliberately substitutes PM for DL below k=10. EB delegates to PM. Slight R root-finder rounding is within the unchanged tolerances.

| Dataset | Quantity | Before | After | R |
|---|---|---:|---:|---:|
| scale_6000 | PM | 35640000 | 35640000 | 35640000.0000009 |
| scale_6000 | EB | 35640000 | 35640000 | 35640000 |
| scale_6000 | REML | 35640000 | 35640000 | 35640000 |
| scale_6000 | DL | 35640000 | 35640000 | 35640000 |
| scale_6000 | QP.tau2Lo | 9399061.10454541 | 9399061.10454541 | 9399061.10454541 |
| scale_6000 | QP.tau2Hi | 1421564047.3874598 | 1421564047.3874598 | 1421564047.38746 |
| scale_60000 | PM | 1073741824 | 3563999999.999999 | 3564000000.00009 |
| scale_60000 | EB | 1073741824 | 3563999999.999999 | 3564000000 |
| scale_60000 | REML | 3564000000 | 3564000000 | 3564000000 |
| scale_60000 | DL | 3563999999.999999 | 3563999999.999999 | 3564000000 |
| scale_60000 | QP.tau2Lo | 939906110.4545412 | 939906110.4545412 | 939906110.454541 |
| scale_60000 | QP.tau2Hi | 142156404738.74597 | 142156404738.74597 | 142156404738.746 |
| above_2_40 | PM | 1073741824 | 17416264183971.84 | 17416264183972.3 |
| above_2_40 | EB | 1073741824 | 17416264183971.84 | 17416264183971.8 |
| above_2_40 | REML | 17416264183971.84 | 17416264183971.84 | 17416264183971.8 |
| above_2_40 | DL | 17416264183971.84 | 17416264183971.84 | 17416264183971.8 |
| above_2_40 | QP.tau2Lo | 4593056433166.584 | 4593056433166.584 | 4593056433166.58 |
| above_2_40 | QP.tau2Hi | 694678310991477.8 | 694678310991477.8 | 694678310991477 |

## Every changed P05 pinned numerical field

This is the complete list of 55 changed numeric leaves across every case and method in the P05 R reference, including rounding-only changes. `loo.0` omits the first study. Cards round these values; exports use the same fields. `sum.I2Model` maps to `I2_model`, `pi.lo/hi` to `pi_lb/ub`, `tauEstimates.pm` to `tau2_pm`. Baujat reference values below are explicit transformations of the R full/LOO fits: x=(yi-mu)^2/(vi+tau2), y=(mu-mu_LOO)^2/se_LOO^2. All other fields are unchanged on these fixtures, including Q, p(Q), Q-based I2, modified-HK intervals and both Q-profile limits.

| Dataset / method / field | Before | After | R or transformation of R fit |
|---|---:|---:|---:|
| `P05.scale_60000.pm.tau2` | 1073741824 | 3563999999.999999 | 3564000000.0000863 |
| `P05.scale_60000.pm.sum.se` | 19233.146943059874 | 34641.016151377546 | 34641.01615137795 |
| `P05.scale_60000.pm.sum.ciLo` | -37696.27531776399 | -67895.1440445703 | -67895.14404457109 |
| `P05.scale_60000.pm.sum.ciHi` | 37696.27531776399 | 67895.1440445703 | 67895.14404457109 |
| `P05.scale_60000.pm.sum.I2Model` | 96.75600223210115 | 98.99999999999999 | 99.00000000000001 |
| `P05.scale_60000.pm.sum.tau2` | 1073741824 | 3563999999.999999 | 3564000000.0000863 |
| `P05.scale_60000.pm.tauEstimates.pm` | 1073741824 | 3563999999.999999 | 3564000000.0000863 |
| `P05.scale_60000.pm.pi.lo` | -163481.31411850435 | -296976.5595515446 | -296976.55955155625 |
| `P05.scale_60000.pm.pi.hi` | 163481.31411850435 | 296976.5595515446 | 296976.55955155625 |
| `P05.scale_60000.pm.loo.0.mu` | 30000 | 30000.000000000004 | 30000 |
| `P05.scale_60000.pm.loo.0.se` | 23555.6980792334 | 30000 | 30000.000000000313 |
| `P05.scale_60000.pm.loo.0.ciLo` | -16168.31986599679 | -28798.919536201614 | -28798.91953620223 |
| `P05.scale_60000.pm.loo.0.ciHi` | 76168.31986599679 | 88798.91953620162 | 88798.91953620223 |
| `P05.scale_60000.pm.loo.0.tau2` | 1073741824 | 1764000000 | 1764000000.0000374 |
| `P05.scale_60000.pm.loo.1.se` | 23555.6980792334 | 59999.99999999999 | 60000.00000000077 |
| `P05.scale_60000.pm.loo.1.ciLo` | -46168.31986599679 | -117597.83907240322 | -117597.83907240473 |
| `P05.scale_60000.pm.loo.1.ciHi` | 46168.31986599679 | 117597.83907240322 | 117597.83907240473 |
| `P05.scale_60000.pm.loo.1.tau2` | 1073741824 | 7163999999.999998 | 7164000000.000187 |
| `P05.scale_60000.pm.loo.2.mu` | -30000 | -30000.000000000004 | -30000 |
| `P05.scale_60000.pm.loo.2.se` | 23555.6980792334 | 30000 | 30000.000000000313 |
| `P05.scale_60000.pm.loo.2.ciLo` | -76168.31986599679 | -88798.91953620162 | -88798.91953620223 |
| `P05.scale_60000.pm.loo.2.ciHi` | 16168.31986599679 | 28798.919536201614 | 28798.91953620223 |
| `P05.scale_60000.pm.loo.2.tau2` | 1073741824 | 1764000000 | 1764000000.0000374 |
| `P05.scale_60000.pm.baujat.0.x` | 3.2439977678988514 | 1.0000000000000002 | 0.999999999999976 |
| `P05.scale_60000.pm.baujat.0.y` | 1.6219988839494253 | 1.0000000000000002 | 0.9999999999999792 |
| `P05.scale_60000.pm.baujat.2.x` | 3.2439977678988514 | 1.0000000000000002 | 0.999999999999976 |
| `P05.scale_60000.pm.baujat.2.y` | 1.6219988839494253 | 1.0000000000000002 | 0.9999999999999792 |
| `P05.scale_60000.eb.tau2` | 1073741824 | 3563999999.999999 | 3564000000 |
| `P05.scale_60000.eb.sum.se` | 19233.146943059874 | 34641.016151377546 | 34641.01615137755 |
| `P05.scale_60000.eb.sum.ciLo` | -37696.27531776399 | -67895.1440445703 | -67895.1440445703 |
| `P05.scale_60000.eb.sum.ciHi` | 37696.27531776399 | 67895.1440445703 | 67895.1440445703 |
| `P05.scale_60000.eb.sum.I2Model` | 96.75600223210115 | 98.99999999999999 | 99 |
| `P05.scale_60000.eb.sum.tau2` | 1073741824 | 3563999999.999999 | 3564000000 |
| `P05.scale_60000.eb.tauEstimates.pm` | 1073741824 | 3563999999.999999 | 3564000000.0000863 |
| `P05.scale_60000.eb.pi.lo` | -163481.31411850435 | -296976.5595515446 | -296976.5595515527 |
| `P05.scale_60000.eb.pi.hi` | 163481.31411850435 | 296976.5595515446 | 296976.5595515527 |
| `P05.scale_60000.eb.loo.0.mu` | 30000 | 30000.000000000004 | 30000 |
| `P05.scale_60000.eb.loo.0.se` | 23555.6980792334 | 30000 | 30000 |
| `P05.scale_60000.eb.loo.0.ciLo` | -16168.31986599679 | -28798.919536201614 | -28798.919536201618 |
| `P05.scale_60000.eb.loo.0.ciHi` | 76168.31986599679 | 88798.91953620162 | 88798.91953620162 |
| `P05.scale_60000.eb.loo.0.tau2` | 1073741824 | 1764000000 | 1764000000 |
| `P05.scale_60000.eb.loo.1.se` | 23555.6980792334 | 59999.99999999999 | 60000 |
| `P05.scale_60000.eb.loo.1.ciLo` | -46168.31986599679 | -117597.83907240322 | -117597.83907240324 |
| `P05.scale_60000.eb.loo.1.ciHi` | 46168.31986599679 | 117597.83907240322 | 117597.83907240324 |
| `P05.scale_60000.eb.loo.1.tau2` | 1073741824 | 7163999999.999998 | 7164000000 |
| `P05.scale_60000.eb.loo.2.mu` | -30000 | -30000.000000000004 | -30000 |
| `P05.scale_60000.eb.loo.2.se` | 23555.6980792334 | 30000 | 30000 |
| `P05.scale_60000.eb.loo.2.ciLo` | -76168.31986599679 | -88798.91953620162 | -88798.91953620162 |
| `P05.scale_60000.eb.loo.2.ciHi` | 16168.31986599679 | 28798.919536201614 | 28798.919536201618 |
| `P05.scale_60000.eb.loo.2.tau2` | 1073741824 | 1764000000 | 1764000000 |
| `P05.scale_60000.eb.baujat.0.x` | 3.2439977678988514 | 1.0000000000000002 | 1.0 |
| `P05.scale_60000.eb.baujat.0.y` | 1.6219988839494253 | 1.0000000000000002 | 1.0 |
| `P05.scale_60000.eb.baujat.2.x` | 3.2439977678988514 | 1.0000000000000002 | 1.0 |
| `P05.scale_60000.eb.baujat.2.y` | 1.6219988839494253 | 1.0000000000000002 | 1.0 |
| `P05.scale_60000.reml.tauEstimates.pm` | 1073741824 | 3563999999.999999 | 3564000000.0000863 |

## Corpus, references and replay

- All numeric leaves for all 88 published datasets and all eight methods are bit-identical before/after, including LOO and diagnostics. No corpus number changed.
- No existing corpus, reference JSON, manifest or paper number was rewritten. `p05-qprofile-replay.mjs` retains every original 1e-9 comparison and its output-hash assertion.
- New oracle: `../hub/shared/tests/unit/tau-bracketing-reference.R` and adjacent JSON. Regression fits use normalized units in R and explicitly transform coefficients/SE/variance back. The beyond-200 case uses the exact symmetric-pair Q equation and R qchisq.
- P05-R1/R2 TODOs are active. The Q-profile refusal assertion now uses ?1e308 instead of ?1e40; an additional R-derived assertion requires success at ?1e40. No tolerance was relaxed.
- Reproduce: `node hub/shared/tests/unit/tau-impact-report.mjs`; `node hub/shared/tests/unit/p05-qprofile-replay.mjs`. Raw field changes: `../tau-audit/p05-number-changes.json`.

This list is exhaustive for pinned P05 reference/corpus inputs. Arbitrary user inputs are not enumerable; their changed behavior is specified by the checked-bracketing contract.

| Component | Static | Dynamic |
|---|---|---|
| Input | Explicit synthetic vectors | No simulated research output |
| Oracle | Retained R-generated JSON | Recomputed by the R script |
| App | No hardcoded statistical result | Checked Q evaluation and bracketing |
| Notice | Baseline commit and labels | Executed before/after engines |
