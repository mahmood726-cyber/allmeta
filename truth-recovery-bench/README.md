# Truth-Recovery Yardstick for Meta-Analysis Methods

An **honest, known-truth simulation benchmark** that injects BOTH heterogeneity
(true τ²) AND a parameterised **publication-selection** mechanism, then scores
every pooling / publication-bias method in the portfolio on how well it recovers
the **true μ**. This is the measured bar a genuinely-superior unified method must
beat — it replaces the *reasoned* ranking in
`MA_METHODS_INVENTORY_2026-06-10.md` §7b with a *measured* one.

> Truth-first: no fabricated numbers. Every figure in `REPORT.md` is produced by
> `harness.py` from seeded simulations and is reproducible.

## Why this exists

The inventory established that the portfolio already has all the ingredients
(GRMA, the allmeta `shared/` joint likelihoods, PET-PEESE, Copas, RoBMA …) but
**no benchmark that injects heterogeneity and publication bias together and
scores truth-recovery**. Without those numbers, "which method captures the truth
best under both distortions" was a reasoned guess. This harness makes it
measured.

## What is scored

Ten methods, each as `fn(y, v) -> {mu, ci_lo, ci_hi, tau2, ok}`:

| Method | Family | Source of truth (port) |
|---|---|---|
| DL | RE pooling | canonical |
| REML | RE pooling | restricted-likelihood maximiser |
| PM (Paule–Mandel) | RE pooling | canonical |
| HKSJ | RE pooling | Hartung–Knapp + floor `max(1, Q/(k-1))`, t_{k-1} |
| Vevea–Hedges | joint selection (τ²+δ) | `allmeta/shared/selmodel.js` |
| Copas–Shi | joint selection (τ²+ρ) | `allmeta/copas/index.html` (metasens port) |
| RoBMA core | BMA effect×heterogeneity | `allmeta/shared/robma.js` |
| PET-PEESE | small-study FE regression | `allmeta/pet-peese/index.html` |
| GRMA | robust grey-relational pooling | `GRMA_paper/grey_meta_v8.py` (imported verbatim) |
| Trim-and-fill | L0 + DL re-pool | `allmeta/shared/trimfill.js` |

### Unified-estimator contributions (branch `truth-recovery-unified-estimator`)

Three new methods are plugged into the SAME harness and scored on the SAME grid,
aimed at the brief's target: **≥0.90 coverage of the true μ across k=5→50 under
unknown/multiple selection mechanisms, with bias ≤ Vevea's and no small-k
blow-up.**

**Measured outcome (full 55-cell × 1000-rep confirmation grid, see `REPORT.md` §7):**
NPE achieves **0.98 mean** coverage of the true μ over all selection cells with
mean **|bias| 0.028** (vs Vevea's 0.79 / 0.107) and **no small-k blow-up** (k=5
RMSE 0.16 vs Vevea 9.18). It holds ≥0.90 on 24 of 25 selection×k cells; the lone
exception is the hardest cell, **step_strong k=50 = 0.88** (the calibration
preview had projected 0.90 there — the confirmation grid measures 0.88). So the
strict "≥0.90 *everywhere*" target is missed by one cell at 2 points, while the
substantive claim — honest coverage where the entire incumbent field collapses
(naive RE → 0.00, Vevea worst 0.56) — holds decisively.

| Method | Track | Idea (cross-disciplinary import) |
|---|---|---|
| **NPE** | 1 | Amortized simulation-based inference. A permutation-invariant feature map φ(D) (fixed DeepSets encoder, `features.py`) feeds gradient-boosted **quantile** regressors trained on a huge corpus of simulated (D → true μ) pairs spanning a **mixture of selection mechanisms** at continuous severity. Honest finite-sample coverage comes from **Mondrian conformalized quantile regression** (CQR, Romano et al. 2019) conditioned on observable (k, selection-severity). |
| **PVS** | 2 | Penalised, model-averaged Vevea–Hedges: weakly-informative ridge on log-δ + hard L-BFGS-B bounds (kills the k≤10 runaway) + BIC model-averaging over step structures. |
| **PartialID** | 2 | Manski-style **partial-identification bounds**: union of CIs over a severity ladder with δ fixed — an honest wide interval when the mechanism is unknown. |

Training is offline and seeded (`train_sbi.py`, `TRAIN_SEED` disjoint from the
harness `BASE_SEED`), producing `sbi_model.pkl` + `sbi_diagnostics.json` (SBC/PIT
uniformity, calibration curve, and a held-out evaluation on the EXACT benchmark
DGP). The harness then scores NPE/PVS/PartialID like any other method.

The original ten Python ports are **validated against the audited R-parity
oracles** in `tests/test_methods.py`:
- Vevea–Hedges ≈ `metafor::selmodel(type="stepfun", steps=0.025)` (μ, τ², δ₂, se)
- Copas–Shi ≈ `metasens` `copas.loglik.without.beta` profile MLE along the publprob path
- REML ≈ a brute-force restricted-likelihood grid maximiser
- HKSJ floor (widens, never narrows when Q<k−1)

## Metrics (per grid cell × method)

- **bias** = mean(μ̂) − μ_true
- **MSE / RMSE** to the true μ
- **coverage** = P(CI contains the TRUE μ) — target 0.95 (honesty of the interval)
- **mean width** of the interval
- **τ²-bias** = mean(τ̂²) − τ²_true (methods that estimate τ²)
- **reject0** = P(0 ∉ CI) → type-I rate at μ=0, power at μ=0.3
- **fail_rate** = share of replications with no usable estimate (e.g. Copas
  non-identification)

## The grid

- **primary** (leaderboard): μ=0.3, τ²=0.05, k ∈ {5,10,15,25,50} × 5 scenarios
- **hetero** sweep: μ=0.3, k=15, τ² ∈ {0, 0.02, 0.08, 0.20} × 5 scenarios
- **typeI**: μ=0, τ²=0.05, k ∈ {10,25} × 5 scenarios

Scenarios: `none`, `step_weak`, `step_strong`, `copas_weak`, `copas_strong`
(definitions and exact parameters in `dgp.py` and echoed into `REPORT.md`).

≥1000 replications per cell (configurable).

## Run it

```bash
# fast end-to-end check (~1 min)
python harness.py --profile smoke --reps 60 --procs 4 --out results_smoke.json

# full benchmark (seeded, ~1.5–2 h on 4 cores)
python harness.py --profile full --reps 1000 --procs 4 --out results_full.json

# build the leaderboard + REPORT.md
python report.py --results results_full.json --out REPORT.md

# validate the method ports against the R oracles
python -m pytest tests/test_methods.py -v

# --- unified estimators (this branch) ---
# 1) train the amortized SBI model offline (seeded, ~12 min on 4 cores)
python train_sbi.py --n-train 90000 --n-cal 40000 --n-val 15000 --iters 500
# 2) (re)run the full benchmark — NPE/PVS/PartialID are auto-registered
python harness.py --profile full --reps 1000 --procs 4
python report.py --results results_full.json --out REPORT.md
# 3) validate the new methods (contract, no-blowup, determinism, calibration)
python -m pytest tests/test_unified.py -v
```

Reproducibility: every replication draws from
`np.random.default_rng(SeedSequence([BASE_SEED, stable_hash(cell_id), k]).spawn(rep))`.
Same `--reps` and `BASE_SEED` → identical numbers, process-count-independent.

## Files

- `methods.py` — the ten estimators (validated ports + canonical kernels) + registry of the three new unified methods
- `dgp.py` — known-truth data-generating process + selection mechanisms
- `harness.py` — grid, seeded replication loop, multiprocessing, aggregation
- `report.py` — leaderboard + `REPORT.md` writer (incl. §7 unified verdict)
- `features.py` — permutation-invariant feature map φ(D) (shared by trainer + NPE)
- `train_sbi.py` — offline amortized SBI trainer + conformal calibration + SBC diagnostics
- `sbi.py` — online NPE estimator (loads `sbi_model.pkl`)
- `robust_selection.py` — PVS (penalised model-averaged Vevea) + PartialID (Manski bounds)
- `tests/test_methods.py` — R-oracle parity / correctness gate
- `tests/test_unified.py` — contract / no-blowup / determinism / calibration-regression gate
- `sbi_model.pkl`, `sbi_diagnostics.json` — trained artifact + calibration evidence (generated)
- `REPORT.md` — the measured leaderboard (generated)

## Scope / honesty notes

- This scores the **existing field only**. No new method is claimed superior.
- **Copas** is reported at its maximum-likelihood *identified* publprob-path
  point (|ρ|<0.95); metasens's auto-`TE.adjust` additionally needs a port of
  R's `contourLines()` goodness-of-fit machinery (out of scope) — non-identified
  runs are counted in `fail_rate`, not hidden.
- **RoBMA core** is the effect×heterogeneity sub-ensemble only (no publication-
  bias models — those need the full RoBMA MCMC package), so it is the
  *honest-but-bias-blind* reference, exactly as in the inventory.
- **PET-PEESE** is fixed-effect WLS (no τ²) by construction.
