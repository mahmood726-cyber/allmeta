# NMA multi-arm variance preservation — 15 October 2026 (revised 19 October 2026)

## Status and provenance

A bounded engine correction with Node and browser regression cases is committed on `fix/nma-multiarm-variance-guard-20261015`, now merged up to main `1402854fcd3923b1ceaed4247b8363e8465015ac`. No merge or deployment is authorised by this repair task. GitHub Actions results must be recorded separately.

The complete deployed Pages artifact was obtained through the normal GitHub connector: run 38810267687, artifact 12007782752, SHA-256 `3da1c93ccbd3ca7bc567004a9ae224dae1bbb795757ffdcfcb32c9cf37d70116`. Original `shared/nma-multiarm-v1.js` Git blob `998c5fad8af806405e45ff1a7e8e3e2d92dd44f3` was checked against GitHub.

**Revision of 19 October 2026.** The first version of this guard refused any four-or-more-arm study whose supplied variances were not reproduced by the recovered arm variances to a relative 1e-8. Review showed that this refused real studies whose contrast SEs were rounded as published (a consistent four-arm study at 3, 4 and 6 decimal places), which netmeta fits. The guard now distinguishes rounding from genuine incompatibility, and studies within the rounding bound are fitted exactly as netmeta fits them. Details below.

## NMA-VAR-01: nonnegative inferred arm variances do not establish compatibility

The engine models independent treatment arms, with correlation between contrasts that share an arm. Recovered arm variances must satisfy `variance(i,j) = armVariance(i) + armVariance(j)` for **every** within-trial contrast. With four or more arms this is an overdetermined system. The pre-guard validation checked complete comparisons, consistent effects and nonnegative recovered arm variances, but not whether the supplied variances were reproduced. `buildStudies()` then silently replaced an incompatible variance structure by its least-squares independent-arm projection.

### Reproducible four-arm input

Use one study, arms A/B/C/D, arm effects 0/0.3/0.6/0.9, all six contrasts in the app's treatment2-minus-treatment1 convention:

| Contrast | Effect | Variance | SE |
|---|---:|---:|---:|
| A to B | 0.3 | 0.04 | 0.2 |
| A to C | 0.6 | 0.04 | 0.2 |
| A to D | 0.9 | 0.04 | 0.2 |
| B to C | 0.3 | 0.04 | 0.2 |
| B to D | 0.6 | 0.04 | 0.2 |
| C to D | 0.3 | 0.10 | sqrt(0.10) |

The original engine accepts this input and infers arm variances 0.01/0.01/0.04/0.04. All are nonnegative, but the inferred A–B variance becomes 0.02 instead of 0.04. The B-minus-A SE becomes **0.1414213562 instead of 0.20**. The supplied normal interval is **[-0.0919928, 0.6919928]**; the projected one is **[0.0228192, 0.5771808]**, which no longer includes zero. netmeta 3.6.1 (R 4.6.0, run in this cycle) keeps SE 0.2 and returns [-0.0919928, 0.6919928].

The input need not be intrinsically invalid: the baseline-contrast covariance `[[.04,.02,.02],[.02,.04,-.01],[.02,-.01,.04]]` is positive definite and reproduces all six variances. It represents correlated-arm data, which this independent-arm engine does not model.

## How netmeta handles multi-arm variances (read from netmeta 3.6.1 source, `netmeta:::multiarm`)

netmeta builds, for each multi-arm study, the matrix `R` of supplied pairwise variances, forms the Laplacian pseudo-inverse `Lt = -C R C / 2` (C the centring matrix), inverts it to Laplacian `L`, and uses the resulting (possibly negative) adjusted weights. Because the effective resistance of `Lt` between arms i and j is exactly `R_ij`, **netmeta reproduces every supplied variance**: it never projects SEs onto an independent-arm structure. It is equivalent to a GLS fit with baseline-contrast covariance `Cov(y_a,base, y_b,base) = (R_base,a + R_base,b - R_a,b) / 2`. One detail differs: netmeta sets to zero any negative adjusted weight smaller than 0.1% of the total absolute weight; this engine does not.

## Correction

1. **Covariance.** `buildStudies()` now builds each multi-arm block from the supplied variances with the formula above (the netmeta-equivalent form). For variances that are exactly sums of arm variances this equals the previous independent-arm block (`v_base`, plus `v_a` on the diagonal), so all exactly compatible and all three-arm studies are numerically unchanged. The block is used by the common-effect fit, the generalised DerSimonian–Laird τ², the random-effects fit (which still adds τ² on the diagonal and τ²/2 off it, as netmeta) and the design decomposition of Q.
2. **Audit (`auditStudies`, exposed also through `checkStudies`).** For a study with four or more arms:
   - The residual vector is `r = (I − H) s²`, where `s²` holds the supplied contrast variances and `H` is the hat matrix of the arm-incidence design. Closed form: `H_kl = (|k ∩ l| − 2/(m−1)) / (m−2)`, where `|k ∩ l|` is the number of arms shared by pairs k and l. A truly compatible structure has `(I − H) s²_true = 0`, so `r = (I − H)(s² − s²_true)`.
   - An SE reported to d decimal places lies within `δ = 0.5·10^−d` of the true SE, so its variance lies within `b = 2·se·δ + δ²` of the true variance. Hence `|r_k| ≤ Σ_l |(I − H)_kl| · b_l`. The allowance is that bound plus the existing numerical allowance `1e-8 × max variance`.
   - **Refuse** only when some `|r_k|` exceeds its allowance. In that case no rounding of the supplied SEs can make them compatible with independent arms. The error names the study, the pair, the supplied and reconstructed variances, the discrepancy, the allowance and the precision used, and says no network has been fitted.
   - **Within the bound but nonzero**, fit with the supplied SEs unchanged (exactly as netmeta does) after a positive-definiteness check. The result then carries a **disclosure** (`varianceDisclosures`): the decimal places used, the largest discrepancy as a share of its allowance, and for each contrast the SE an independent-arm projection would have produced and the percentage change. The NMA page shows the disclosure in its Notes banner, and the league CSV export appends it as a `Note:` line.
   - **Precision.** `row.seDecimals` takes precedence, then `opts.seDecimals` (accepted by `fit()` and `analyse()`). Otherwise the precision is the largest number of decimal places among the study's SEs, because one table has one reporting precision and parsing drops trailing zeros (0.150 reads as 2 places).
   - The bound is a necessary condition for rounding to explain the residual, not a sufficient one. It never refuses data that rounding could explain, and anything it accepts is fitted as netmeta would fit it.
3. The existing refusals are unchanged: incomplete or duplicated comparisons, inconsistent effects (0.001, netmeta's `tol.multiarm`) and negative recovered arm variances.

### Consequences for the counterexample

At the precision its values carry (C–D is `sqrt(0.10)` at full double precision), the counterexample is refused: discrepancy 0.0200 against an allowance of 1e-9. With C–D transcribed as 0.316 (3 dp) it is also refused (allowance about 3e-4). If the user states `seDecimals: 1`, it is accepted: with SEs known only to ±0.05, compatible independent-arm SEs exist (for example arm variances 0.0125/0.0125/0.05/0.05). It is then fitted with SE 0.2, as netmeta does, and the disclosure reports that a projection would have moved A–B by 29%. This is a deliberate difference from netmeta, which fits the full-precision counterexample without refusing. Beyond rounding, the input asserts a correlated-arm covariance, and this engine's random-effects structure and arm-variance reporting assume independent arms.

## netmeta comparison (fresh R 4.6.0, netmeta 3.6.1, meta 8.5-0)

Oracle script: `tests/fixtures/nma-multiarm-rounding-reference.R`. Output: `tests/fixtures/nma-multiarm-rounding-oracle.json`. The data are one consistent four-arm study (arm variances .011/.023/.031/.047, arm effects 0/.3/.5/.8) with SEs rounded to 3/4/6 dp, plus a two-arm A–B study (0.2, SE 0.15).

| SE precision | pre-guard engine (projection) B−A, SE | first guard | this revision B−A, SE | netmeta B−A, SE |
|---|---|---|---|---|
| 3 dp | 0.2398351, 0.1163490 | refused | 0.2399248, 0.1162623 | 0.2399248, 0.1162623 |
| 4 dp | 0.2398244, 0.1163594 | refused | 0.2398206, 0.1163630 | 0.2398206, 0.1163630 |
| 6 dp | 0.2398230, 0.1163607 | refused | 0.2398230, 0.1163608 | 0.2398230, 0.1163608 |

The whole 4×4 common and random league (TE and seTE), τ² and Q match netmeta to ≤1e-6. Observed differences are about 1e-15. The pre-guard projection differed from netmeta by about 9e-5 in the 3-dp estimate. Largest discrepancy as a share of its rounding allowance: 47.8% (3 dp), 17.2% (4 dp), 18.9% (6 dp). The largest SE change a projection would have made: 0.19%, 0.0079% and 0.00008%.

Borderline: in the 3-dp study, changing C–D from 0.279 to 0.278 (one unit in the last place) gives a discrepancy of 1.0032 times its allowance and is refused. 0.281 gives 0.79 and is fitted.

## Executed local evidence (19 October 2026)

- `node --test shared/tests/nma-multiarm-v1.spec.mjs`: **11/11 passed**. These are the 4 existing netmeta-gated tests, plus the 3/4/6-dp fits against the netmeta oracle with disclosures, the refused counterexample, the borderline pair, an exactly compatible study with no disclosure, and decimal inference.
- `hub/shared/tests/nma-multiarm-variance-guard.spec.mjs` in local Chromium: **11/11 passed**. These are the 9 original tests (refusal/clearing, export refusal, recovery, JSON import, FE/RE/CI controls, invariances, 250 seeded valid 4–8-arm trials preserving 4,000 SEs to 1e-10, the numerical-noise boundary, and the 410-check archived corpus), plus the in-page rounded fits with disclosure and CSV note, and the in-page borderline refusal. No assertion or tolerance in an existing test was changed.
- `npx playwright test nma` (69 tests in 15 files): **68 passed, 1 failed**. The failure is `nma-dose-response-contrast.spec.mjs` (dark scheme, `nma-dose-response-app`, which does not load this engine), and it fails identically on unmodified origin/main `1402854`. Thirteen of the specs hard-code `http://localhost:8088`, and port 8088 on this machine was held by an unrelated process. Those 56 tests (including the `@slow` live-R smoking-cessation run) were therefore executed from temporary copies that differed only in the port number (8132), and the copies were deleted afterwards. CI runs them unmodified.
- `python -m pytest nma/tests/test_nma.py tests/test_nmi.py`: **21 passed**.

## Remaining gates

This does not implement a correlated-arm NMA, does not assess arbitrary networks for every numerical pathology, and does not repair direct-parser silent row exclusions. It also does not certify rank simulation or stale validation receipts, and it does not complete mobile, accessibility or security review. Low-level `buildStudies()` is not itself a validated public fit. Full app/portfolio completion remains false.

## Primary methodological sources

Rücker G, Schwarzer G. *Trials and triangles: Network meta-analysis of multi-arm trials with correlated arms*. Research Synthesis Methods (2025), DOI: [10.1017/rsm.2025.10026](https://doi.org/10.1017/rsm.2025.10026). Rücker G. *Network meta-analysis, electrical networks and graph theory*. Research Synthesis Methods 2012;3:312–324 (the Laplacian/pseudo-inverse construction used by `netmeta:::multiarm`).
