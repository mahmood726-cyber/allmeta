# Complementary methods — pairing portfolio estimators to the registry-native findings (frontier 4)

Two portfolio methods are brought in as **honest pairs** to existing results — not as new headline claims.
Both operate on the node where the registry-native signal is sharpest: **semaglutide 2.4 mg vs placebo
(%TBWL)**, 13 published + 2 results-posted-but-unpublished "ghost" trials (see `GHOST_TRIALS.md`).

## 1. UBCMA — the *inferential* pair to the ghost-measurement (`ubcma_reporting_bias.py`)

The ghost-measurement **directly observes** the hidden effect (the pipeline is registry-native, so it sees
results-posted-but-unpublished trials a literature search cannot): the published pool is 11.7 pp, the ghost
pool 8.5 pp. **UBCMA** (Unified Bias-Calibrated Meta-Analysis — joint heterogeneity + publication-selection +
quality-bias model) is the **inferential counterpart**: fit on the **literature-visible 13 alone, blind to
the ghosts**, and let its selection model *infer* a corrected pooled effect.

| Estimator (on the visible 13) | μ (pp) |
|---|---|
| DerSimonian–Laird | 11.60 |
| REML | 11.60 |
| **UBCMA** (selection-corrected) | **11.30** |
| *all-15 IV pool (registry truth, normally hidden)* | *11.47* |
| *ghost-only IV pool (directly observed)* | *8.50* |

**Result:** UBCMA, blind to the ghosts, infers a **downward** correction (−0.30 pp vs DL) — the **same
direction** the ghost-measurement directly reveals. The inferential and direct tools corroborate each other.
Honest nuance: on the **inverse-variance** scale the all-15 pool (11.47) sits close to published, because IV
weighting downweights the imprecise ghosts (var ≈ 1.0 vs published ≈ 0.2–0.5) — so the *IV* reporting-bias gap
is small (+0.24 pp) even though the unweighted ghost mean (8.5) is far lower. UBCMA detects only part of the
selection signal from the visible set; **the registry-native direct measurement remains the stronger,
model-free tool.** Reported as a reporting-bias **sensitivity pairing**, not a change to the headline ranking
(the sema-2.4 node is already saturated). Small ghost k (2) → signal, not proof.

## 2. GRMA — the *robust-pooling* sensitivity pair to the IV pool (`grma_robust_pool.py`)

**GRMA** (Grey Relational Meta-Analysis) is the portfolio robust estimator: it weights studies by
grey-relational similarity in a 2-feature space (effect, log-precision) with a redescending **Tukey bisquare
guard** against effect outliers, instead of pure inverse-variance. It stress-tests whether the conclusion
survives a deliberately outlier-resistant pooling rule.

| Pool (k=15) | μ (pp) | 95% CI |
|---|---|---|
| IV (inverse-variance, primary) | 11.47 | — (SE 0.18) |
| **GRMA** (grey-relational + Tukey guard, 999-boot) | **11.27** | [8.92, 12.52] |

**Result:** the effect holds at 11.27 pp under GRMA (Δ = −0.20 pp) → **robust to the pooling rule**, not an
artifact of IV weighting. GRMA's lowest weights fall on the effect-outlier (NCT04102189, 17.1 pp) and the low
extremes — the guard behaving as designed (n_eff 13.6 of 15).

## Honesty guardrails
- Both are **sensitivity/corroboration pairs**; IV/DL/REML stays the primary estimator and the headline
  ranking is unchanged.
- **GRMA port caveat:** `grma_robust_pool.py` is a faithful Python port of `C:/Projects/grma/grma_meta.R`
  (R unavailable in this environment). GRMA is **not in metafor**, so the standard 1e-6 metafor
  cross-validation is impossible — stated openly. GRMA does not estimate τ².
- **UBCMA** is the portfolio package (`C:/Projects/ubcma`); the fit is deterministic (`restart_seed`).
- Dissonance Field Synthesis is deliberately kept **out** of the guideline layer (novel/unvalidated).
- Data policy respected throughout: AACT arm-level contrasts + PubMed-confirmed ghost status; **no IPD, no
  full text.**
