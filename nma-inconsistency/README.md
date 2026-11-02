# NMA Inconsistency

Node-splitting inconsistency tests for network meta-analysis. Detects local inconsistency between direct and indirect evidence for each comparison.

Part of the [allmeta](https://github.com/mahmood726-cyber/allmeta) collection.

Live: https://mahmood726-cyber.github.io/allmeta/nma-inconsistency/

## Multi-arm studies

A study ID whose rows span more than two treatments is a multi-arm study. The page analyses it the way netmeta does:

- **Input.** Every one of the k(k−1)/2 pairwise contrasts must be present (each once, either orientation), with effect = first-named minus second-named treatment.
- **Refused, with a message naming the study:** an omitted or duplicated contrast; effects that are not consistent with one set of arm estimates (|observed − implied| > 1e-8 × max(1, |effect|), i.e. (A vs C) ≠ (A vs B) + (B vs C)); contrast variances that do not decompose as var(A vs B) = var(A) + var(B) (relative residual > 1e-8, possible only for k ≥ 4); a negative implied arm variance. netmeta itself accepts effect discrepancies up to `tol.multiarm = 0.001` and does not check variances by default; the page is stricter so that its answer does not depend on which contrasts netmeta happens to use. A two-treatment study ID repeated on several rows is still refused.
- **Consistency model.** Generalised least squares on each study's contrasts against its first treatment, with the exact within-study covariance Var = var(arm j) + var(arm 1) + τ², Cov = var(arm 1) + τ²/2 — algebraically netmeta's graph-theoretical fit (Rücker 2012, `multiarm()` weights). τ²: DerSimonian-Laird in netmeta's generalised form (`method.tau = "DL"`); Paule-Mandel solves Q(τ²) = df with the same multi-arm Q.
- **Node-splitting** follows `netsplit(method = "Back-calculation")`: direct = inverse-variance pool of every contrast of the pair (two-arm and multi-arm rows, SE² + τ²), P = Var(network)/Var(direct), indirect = (network − P·direct)/(1 − P), SE = SE(network)/√(1 − P). A comparison whose direct proportion is within √ε of 1 has no indirect estimate and is not split, as in netmeta. With multi-arm studies the back-calculated indirect estimate can draw on the same multi-arm study as the direct one.
- **Design-by-treatment** follows `decomp.design`: a design is a study's full treatment set; Q between designs = Q(consistency) − Q(one set of contrasts per design) at τ² = 0 (FE, `Q.decomp`) or the model τ² (DL/PM, `Q.inc.random.preset`), on Σ(arms − 1 per design) − (treatments − 1) df.
- **Leave-one-out** removes a whole study (all its contrasts).
- Networks without a multi-arm study run the unchanged two-arm code; their pinned replay is byte-identical.

**Validation.** `validate/multiarm-oracle.R` (R 4.6.0, netmeta 3.6-1, metafor 5.2-1) fits nine networks — a synthetic network with two 3-arm studies of one design, a further 3-arm and a 4-arm study; netmeta's `smokingcessation` and `Woods2010` via `pairwise()`; `Senn2013`; and the five corpus inputs the page used to refuse (Baker2009 OR/RR, Franchini2012 MD/SMD, dietaryfat IRR) — under FE, DL and PM and writes `validate/multiarm-oracle.json`. `node nma-inconsistency/tests/multiarm-parity.mjs` drives the page on all 27 fits and requires every estimate, SE, τ², Q, df, node-split quantity and global Q/df/p to agree to **1e-6 absolute** (observed maximum ≈2e-11; the tolerance is looser than the two-arm 1e-9 only because these references are new and computed on a different netmeta version from the archived P16 set). `tests/multiarm-negative.mjs` shows planted defects are refused and that the comparator fails on a 1e-3 data change and on the old independent-contrast treatment. The netmeta PM reference is checked against metafor's `.QE.func` on two-arm data before use. The generated R script (`Download R script`) uses `netmeta` directly for multi-arm networks; its Paule-Mandel step calls netmeta internals (`prepare`, `nma_ruecker`), whose signatures may change between netmeta versions. The reference machine runs netmeta 3.7-0; the multi-arm oracle has not yet been regenerated there.

<!-- ALM-AUTO-README-BEGIN (regenerate with scripts/gen_app_readmes.py) -->

## When to use

- **Category:** Network MA
- **Data shape:** contrast rows: A, B, effect, SE, optional study ID. Two-arm studies are one row each; a multi-arm study is entered as all of its pairwise contrasts under one study ID.
- **Purpose:** Node-splitting + design-by-treatment Q.

## Cite as

Click **📑 Cite as** inside the app for ready-to-paste Vancouver + BibTeX citations covering both the allmeta release and the relevant method paper(s).

## Reproducibility

- This page exports its numerical result state as JSON, CSV and Markdown. Record the source checkout commit separately; the shared `build-info.js` identity is not attached to this page’s result exports.
- For apps with a parity-checked engine, `shared/specs/` contains the R-reference test vectors. Run `python -m pytest tests/` for the full suite.
- Click **📝 Verify in R** to open a Shinylive R session with the current data pre-loaded for independent re-computation (where supported).

<!-- ALM-AUTO-README-END -->
