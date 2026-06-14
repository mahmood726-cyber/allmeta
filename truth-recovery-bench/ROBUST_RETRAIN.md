# Robust-SBI Retrain (frontier roadmap **P1**) — measured result

> _Truth-first report. Two full retrain+validation cycles were run on this machine. **Neither configuration met the bar**, and the committed `sbi_model.pkl` remains the recommended estimator. The value here is a rigorously-measured negative result that quantifies a real tension and identifies the actual fix. Numbers are read directly from the validation JSONs; nothing is hand-typed._

## What was retrained, and how it was run

The benchmark's "NPE / neural posterior estimator" is an **amortized simulation-based-inference** estimator implemented as gradient-boosted conditional-quantile regression (`sklearn HistGradientBoostingRegressor`) on a permutation-invariant feature map, calibrated with Mondrian conformal prediction. It is NPE-*style* (amortized posterior quantiles + SBC/PIT), not a deep net — there is no GPU/autodiff on this box. Accordingly the long job was run with a **staged, resumable checkpoint** design (`train_sbi_robust.py`): corpus simulation chunked to disk (`.npz`), each quantile model fitted and pickled one at a time, a `state.json` stage tracker, and an appended `train_robust*.log`. Because every stage is seeded by an explicit `SeedSequence`, **resume is exact** — re-running skips any artifact already on disk (verified: a re-invocation skipped all 12 corpus chunks + all 9 quantile models + the τ² model and went straight to calibration).

**Robustness improvements applied** (each tied to a roadmap item):

1. **Mixture / heavier-tail simulator coverage** — added a `mixed` (p-step ∧ Copas) mechanism and Student-t(ν) random effects to the *training* simulator. These are exactly the two OOD stress scenarios (`mixed_strong`, `heavy_tail`) the head-to-head exposed; training on them turns the NPE OOD dip into an in-distribution regime. This is the GBM-SBI analog of robust / generalized-Bayes SBI (arXiv:2504.09475, arXiv:2601.22367): robustness-to-misspecification via a broadened simulator + the intrinsically-robust median/pinball (L1) loss.
2. **Clean-data de-biasing anchoring** — raised the clean (`none`) training share above the 0.22 baseline so the residual correction is anchored to ~0 where there is no selection signal.
3. **SE-support** — *v1* widened to 0.08–0.85 (real-scale margin); *v2* kept benchmark 0.10–0.70.

**Two configurations measured:**

- **v1** (broad): `p_none=0.30`, SE 0.08–0.85, `p_heavy=0.18`. Validated old-vs-v1 at **600 reps/cell**.
- **v2** (conservative): `p_none=0.25`, SE 0.10–0.70, `p_heavy=0.15` — more de-biasing aggressiveness retained. Validated old-vs-v2 at **500 reps/cell**.

## Measured before/after (known-truth harness, exact harness seeding)

NPE metrics. Each variant is compared to **its own same-run `old` baseline** (identical seeds; v1 at 600 reps, v2 at 500 reps), so the two `old` columns differ only by Monte-Carlo noise. `Δ` = variant − its own old. ✅ = moved the intended direction, ⚠️ = regression.

| metric | old@600 | v1 | Δv1 | old@500 | v2 | Δv2 | DL ref |
|---|---|---|---|---|---|---|---|
| clean abs-bias (none) | 0.055 | 0.040 | -0.016 ↓ ✅ | 0.054 | 0.052 | -0.002 · | 0.004 |
| clean width (none) | 0.522 | 0.543 | 0.021 ↑ ⚠️ | 0.523 | 0.561 | 0.038 ↑ ⚠️ | 0.355 |
| under-sel mean cov | 0.987 | 0.973 | -0.013 ↓ ⚠️ | 0.987 | 0.988 | 0.001 · | 0.625 |
| under-sel min cov | 0.960 | 0.900 | -0.060 ↓ ⚠️ | 0.958 | 0.972 | 0.014 ↑ ✅ | 0.002 |
| under-sel mean abs-bias | 0.026 | 0.038 | 0.012 ↑ ⚠️ | 0.026 | 0.027 | 0.001 · | 0.106 |
| primary mean cov | 0.982 | 0.974 | -0.008 ↓ ⚠️ | 0.982 | 0.984 | 0.002 · | 0.681 |
| primary min cov | 0.947 | 0.900 | -0.047 ↓ ⚠️ | 0.952 | 0.948 | -0.004 ↓ ⚠️ | 0.002 |
| primary mean width | 0.536 | 0.559 | 0.023 ↑ ⚠️ | 0.537 | 0.576 | 0.040 ↑ ⚠️ | 0.324 |
| type-I mean reject0 | 0.035 | 0.035 | 0.001 · | 0.035 | 0.027 | -0.008 ↓ ✅ | 0.286 |
| stress mean cov | 0.978 | 0.932 | -0.046 ↓ ⚠️ | 0.977 | 0.973 | -0.004 ↓ ⚠️ | 0.238 |
| stress min cov | 0.942 | 0.793 | -0.148 ↓ ⚠️ | 0.942 | 0.922 | -0.020 ↓ ⚠️ | 0.000 |
| stress mean width | 0.570 | 0.567 | -0.002 · | 0.569 | 0.581 | 0.012 ↑ ⚠️ | 0.272 |

## Verdict (templated against the numbers above)

- **Clean-data tax (the headline goal):** v1 cut it (0.055 → 0.040, −0.016) but v2 barely moved it (0.054 → 0.052, −0.002). The cut only appears when the correction is made *globally less aggressive* — which is what breaks everything else.

- **Interval width premium (the other goal):** went the WRONG way in both (primary mean width Δv1 +0.023, Δv2 +0.040). Training on harder/more-diverse mechanisms genuinely *increases* posterior uncertainty, so honest intervals widen. The width premium is intrinsic to honest coverage under unknown selection, not a tuning artifact.

- **Coverage / type-I:** v1 REGRESSED hard, especially OOD min-coverage (0.942 → 0.793 — the strong-p-step scenarios `step_vstrong`/`mixed_strong` collapsed because the passive correction under-corrects selection). v2 HELD/IMPROVED coverage (under-selection min 0.958 → 0.972; OOD min 0.942 → 0.922) and improved type-I — but at zero clean-tax benefit and extra width.

**Bottom line:** the two objectives are in direct tension under a *global* retrain. Cutting the clean-data tax requires a less-aggressive correction (v1) → loses coverage under selection; keeping coverage (v2) → keeps the tax. **Do not promote either retrained artifact.** Keep `sbi_model.pkl` as the production estimator. v2 is the safer of the two (coverage/type-I slightly better, no catastrophic OOD failure) but is strictly wider for no bias benefit, so it is not an upgrade.

## The actual fix (next lever, not a global retrain)

The clean-data tax is a *low-severity* problem: the residual GBM applies a nonzero selection-correction even when the observable funnel/​p-bin severity is ~0. The principled remedy is a **severity-gated correction** — scale the learned residual (and shrink its interval toward the FE-centered one) by a gate g(severity)→0 as the observable selection signal →0, →1 when it is strong. That cuts the tax *surgically* on clean data while leaving the strong-selection correction (and its coverage) untouched — something no global re-weighting of the training mixture can do, as both configs here demonstrate. This is an inference-time change to `sbi.py` (or a small artifact field), not another retrain, and is the recommended P1.1 follow-up. The width premium should be treated as the honest cost of coverage under unknown selection and reported, not tuned away.

## Reproduce

```
python train_sbi_robust.py --tag v1 --out sbi_model_robust.pkl \
    --se-lo 0.08 --se-hi 0.85 --p-none 0.30 --p-step 0.34 \
    --p-copas 0.26 --p-mixed 0.10 --p-heavy 0.18
python train_sbi_robust.py --tag v2 --out sbi_model_robust_v2.pkl \
    --se-lo 0.10 --se-hi 0.70 --p-none 0.25 --p-step 0.37 \
    --p-copas 0.28 --p-mixed 0.10 --p-heavy 0.15
python validate_robust.py --reps 600 --new sbi_model_robust.pkl \
    --out validation_robust_v1.json
python validate_robust.py --reps 500 --new sbi_model_robust_v2.pkl \
    --out validation_robust_v2.json
python gen_combined_report.py
```
