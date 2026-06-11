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

The Python ports are **validated against the audited R-parity oracles** in
`tests/test_methods.py`:
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
```

Reproducibility: every replication draws from
`np.random.default_rng(SeedSequence([BASE_SEED, stable_hash(cell_id), k]).spawn(rep))`.
Same `--reps` and `BASE_SEED` → identical numbers, process-count-independent.

## Files

- `methods.py` — the ten estimators (validated ports + canonical kernels)
- `dgp.py` — known-truth data-generating process + selection mechanisms
- `harness.py` — grid, seeded replication loop, multiprocessing, aggregation
- `report.py` — leaderboard + `REPORT.md` writer
- `tests/test_methods.py` — R-oracle parity / correctness gate
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
