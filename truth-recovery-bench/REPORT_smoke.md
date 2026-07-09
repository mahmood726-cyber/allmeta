# Truth-Recovery Yardstick — Measured Leaderboard

> Generated from `smoke` run · base_seed=`20260611` · 60 replications/cell · 6 cells · 50.1s · GRMA bootstrap B=199.

**What this is.** A known-truth simulation that injects BOTH heterogeneity (true τ²) AND a parameterised publication-selection mechanism, then scores every pooling/bias method in the portfolio on recovery of the TRUE μ. This replaces the inventory's *reasoned* ranking (sec 7b) with a *measured* one. No new method is claimed superior here — this establishes the bar one must beat.

## Data-generating process

- Studies drawn from θᵢ ~ N(μ, τ²), yᵢ ~ N(θᵢ, vᵢ); SEs log-uniform on [0.1, 0.7]. The observed meta-analysis is the set of *published* studies (oversampled to the target k), so k is the published count and the true μ is the unconditional mean a method must recover.
- **Step (Vevea–Hedges) selection**: one-sided p cutpoints [0.025, 0.05], publication weights weak=[1.0, 0.75, 0.55], strong=[1.0, 0.35, 0.1].
- **Copas latent selection**: z = γ₀ + γ₁/SE + d, publish if z>0, corr(d, study noise)=ρ. weak={'g0': -0.3, 'g1': 0.25, 'rho': 0.4}, strong={'g0': -0.55, 'g1': 0.35, 'rho': 0.8}.

## 1. Headline leaderboard — joint condition (selection + τ²=0.05, k 5→50 pooled)

Ranked by **RMSE-to-true-μ** across the four selection scenarios (step weak/strong, Copas weak/strong) and all k. Coverage is of the TRUE μ (target 0.95). `fail` = share of replications with no usable estimate.

| # | method | |bias| | RMSE | coverage | width | fail |
|---|---|---|---|---|---|---|


## 2. Per-scenario detail (primary block, μ=0.3, τ²=0.05)

### none

bias / coverage / RMSE per method × k.

*bias*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

*coverage*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

*RMSE*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

### step_weak

bias / coverage / RMSE per method × k.

*bias*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

*coverage*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

*RMSE*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

### step_strong

bias / coverage / RMSE per method × k.

*bias*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

*coverage*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

*RMSE*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

### copas_weak

bias / coverage / RMSE per method × k.

*bias*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

*coverage*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

*RMSE*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

### copas_strong

bias / coverage / RMSE per method × k.

*bias*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

*coverage*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

*RMSE*

| method |
|---|
| DL |
| REML |
| PM |
| HKSJ |
| VeveaHedges |
| Copas |
| RoBMA |
| PET-PEESE |
| GRMA |
| TrimFill |

## 5. Failure modes (where each method breaks)


## 6. Reproducibility

- Fully seeded: every replication draws from `np.random.default_rng(SeedSequence([20260611, stable_hash(cell_id), k]).spawn(rep))`. Re-running `python harness.py --profile smoke --reps 60` reproduces every number.
- Method ports validated against the audited R oracles in `tests/test_methods.py` (Vevea–Hedges ≈ metafor::selmodel, Copas ≈ metasens, REML ≈ brute-force restricted-likelihood grid).
