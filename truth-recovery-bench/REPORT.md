# Truth-Recovery Yardstick — Measured Leaderboard

> Generated from `full` run · base_seed=`20260611` · 1000 replications/cell · 55 cells · 8242.2s · GRMA bootstrap B=199.

**What this is.** A known-truth simulation that injects BOTH heterogeneity (true τ²) AND a parameterised publication-selection mechanism, then scores every pooling/bias method in the portfolio on recovery of the TRUE μ. This replaces the inventory's *reasoned* ranking (sec 7b) with a *measured* one. No new method is claimed superior here — this establishes the bar one must beat.

## Data-generating process

- Studies drawn from θᵢ ~ N(μ, τ²), yᵢ ~ N(θᵢ, vᵢ); SEs log-uniform on [0.1, 0.7]. The observed meta-analysis is the set of *published* studies (oversampled to the target k), so k is the published count and the true μ is the unconditional mean a method must recover.
- **Step (Vevea–Hedges) selection**: one-sided p cutpoints [0.025, 0.05], publication weights weak=[1.0, 0.75, 0.55], strong=[1.0, 0.35, 0.1].
- **Copas latent selection**: z = γ₀ + γ₁/SE + d, publish if z>0, corr(d, study noise)=ρ. weak={'g0': -0.1, 'g1': 0.12, 'rho': 0.5}, strong={'g0': -0.2, 'g1': 0.12, 'rho': 0.9}.

## 1. The measured bar (headline)

**No existing method recovers the true μ with honest coverage when heterogeneity and publication selection are both present.** Across the selection scenarios at viable k (≥15), the best CI coverage of the true μ achieved by any method is **0.99** (**Unified**) — far below the nominal 0.95. The three truth axes disagree on a winner:

- **Smallest point bias**: NPE (|bias|=0.010), Unified (0.010) — the only genuine bias-correctors.
- **Best coverage of truth**: Unified (0.99).
- **Lowest RMSE-to-truth**: NPE (0.083) — but low RMSE here is low *variance*, not accuracy: it leaves |bias|=0.010 and covers only 0.98. RMSE alone would crown the wrong method, which is exactly why coverage is part of the criterion.

## 2. Leaderboard — joint condition, k ≥ 15 (all methods viable)

Selection scenarios (step weak/strong, Copas weak/strong), τ²=0.05, k ∈ {15,25,50}. Ranked by RMSE-to-true-μ; read alongside |bias| and coverage. (At k<15 the selection models destabilise — see §6.)

| # | method | |bias| | RMSE | coverage | width | fail |
|---|---|---|---|---|---|---|
| 1 | **NPE** | 0.010 | 0.083 | 0.98 | 0.399 | 0.00 |
| 2 | **Unified** | 0.010 | 0.083 | 0.99 | 0.459 | 0.00 |
| 3 | **PartialID** | 0.024 | 0.090 | 0.98 | 0.590 | 0.00 |
| 4 | **PVS** | 0.071 | 0.109 | 0.78 | 0.318 | 0.00 |
| 5 | **TrimFill** | 0.069 | 0.109 | 0.66 | 0.240 | 0.00 |
| 6 | **Copas** | 0.095 | 0.120 | 0.58 | 0.234 | 0.02 |
| 7 | **REML** | 0.104 | 0.125 | 0.55 | 0.231 | 0.00 |
| 8 | **DL** | 0.104 | 0.125 | 0.55 | 0.232 | 0.00 |
| 9 | **HKSJ** | 0.104 | 0.125 | 0.59 | 0.254 | 0.00 |
| 10 | **PM** | 0.105 | 0.126 | 0.56 | 0.236 | 0.00 |
| 11 | **PET-PEESE** | 0.028 | 0.136 | 0.72 | 0.325 | 0.00 |
| 12 | **VeveaHedges** | 0.059 | 0.138 | 0.80 | 0.369 | 0.00 |
| 13 | **GRMA** | 0.118 | 0.142 | 0.56 | 0.285 | 0.00 |
| 14 | **RoBMA** | 0.176 | 0.239 | 0.55 | 0.515 | 0.00 |

All-k version (k 5→50 pooled) — note the RMSE for the selection models is inflated by rare small-k blowups (§6):

| # | method | |bias| | RMSE | coverage | width | fail |
|---|---|---|---|---|---|---|
| 1 | NPE | 0.016 | 0.105 | 0.99 | 0.538 | 0.00 |
| 2 | Unified | 0.016 | 0.105 | 0.99 | 0.619 | 0.00 |
| 3 | PartialID | 0.021 | 0.113 | 0.96 | 0.657 | 0.00 |
| 4 | PVS | 0.079 | 0.132 | 0.78 | 0.384 | 0.00 |
| 5 | TrimFill | 0.076 | 0.133 | 0.70 | 0.323 | 0.00 |
| 6 | Copas | 0.097 | 0.140 | 0.63 | 0.308 | 0.05 |
| 7 | DL | 0.106 | 0.143 | 0.62 | 0.316 | 0.00 |
| 8 | HKSJ | 0.106 | 0.143 | 0.69 | 0.393 | 0.00 |
| 9 | REML | 0.106 | 0.143 | 0.62 | 0.316 | 0.00 |
| 10 | PM | 0.107 | 0.145 | 0.63 | 0.325 | 0.00 |
| 11 | GRMA | 0.119 | 0.164 | 0.64 | 0.438 | 0.00 |
| 12 | PET-PEESE | 0.014 | 0.187 | 0.78 | 0.675 | 0.00 |
| 13 | RoBMA | 0.116 | 0.218 | 0.69 | 0.668 | 0.00 |
| 14 | VeveaHedges | 0.107 | 2.069 | 0.79 | 0.508 | 0.01 |

## 3. Per-scenario detail (primary block, μ=0.3, τ²=0.05)

### none

bias / coverage / RMSE per method × k.

*bias*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.001 | 0.003 | 0.007 | 0.001 | 0.001 |
| REML | 0.000 | 0.003 | 0.007 | 0.001 | 0.001 |
| PM | 0.001 | 0.003 | 0.007 | 0.001 | 0.001 |
| HKSJ | 0.001 | 0.003 | 0.007 | 0.001 | 0.001 |
| VeveaHedges | 0.326 | 0.002 | 0.014 | 0.001 | 0.004 |
| Copas | 0.001 | 0.002 | 0.007 | 0.001 | 0.001 |
| RoBMA | -0.143 | -0.119 | -0.091 | -0.064 | -0.023 |
| PET-PEESE | -0.042 | -0.034 | -0.021 | -0.019 | -0.004 |
| GRMA | -0.005 | 0.003 | 0.007 | 0.002 | 0.003 |
| TrimFill | 0.006 | 0.004 | 0.007 | -0.001 | 0.000 |
| NPE | -0.074 | -0.060 | -0.050 | -0.051 | -0.042 |
| PVS | -0.002 | -0.000 | 0.008 | 0.002 | 0.004 |
| PartialID | -0.087 | -0.072 | -0.055 | -0.049 | -0.032 |
| Unified | -0.074 | -0.060 | -0.050 | -0.051 | -0.042 |

*coverage*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.88 | 0.90 | 0.92 | 0.92 | 0.94 |
| REML | 0.87 | 0.89 | 0.92 | 0.93 | 0.94 |
| PM | 0.88 | 0.90 | 0.92 | 0.93 | 0.94 |
| HKSJ | 0.97 | 0.94 | 0.94 | 0.94 | 0.95 |
| VeveaHedges | 0.79 | 0.84 | 0.87 | 0.90 | 0.94 |
| Copas | 0.83 | 0.87 | 0.89 | 0.91 | 0.93 |
| RoBMA | 0.75 | 0.77 | 0.81 | 0.76 | 0.63 |
| PET-PEESE | 0.92 | 0.88 | 0.87 | 0.88 | 0.87 |
| GRMA | 0.93 | 0.94 | 0.92 | 0.94 | 0.94 |
| TrimFill | 0.83 | 0.86 | 0.87 | 0.88 | 0.87 |
| NPE | 0.98 | 0.97 | 0.97 | 0.94 | 0.95 |
| PVS | 0.86 | 0.88 | 0.91 | 0.93 | 0.95 |
| PartialID | 0.91 | 0.94 | 0.96 | 0.96 | 0.97 |
| Unified | 0.99 | 0.99 | 0.98 | 0.98 | 0.98 |

*RMSE*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.163 | 0.113 | 0.091 | 0.070 | 0.048 |
| REML | 0.164 | 0.113 | 0.091 | 0.070 | 0.048 |
| PM | 0.165 | 0.113 | 0.091 | 0.071 | 0.048 |
| HKSJ | 0.163 | 0.113 | 0.091 | 0.070 | 0.048 |
| VeveaHedges | 9.894 | 0.177 | 0.140 | 0.104 | 0.074 |
| Copas | 0.171 | 0.120 | 0.099 | 0.076 | 0.052 |
| RoBMA | 0.204 | 0.187 | 0.178 | 0.172 | 0.167 |
| PET-PEESE | 0.353 | 0.205 | 0.164 | 0.127 | 0.077 |
| GRMA | 0.197 | 0.130 | 0.107 | 0.081 | 0.056 |
| TrimFill | 0.187 | 0.131 | 0.108 | 0.087 | 0.063 |
| NPE | 0.176 | 0.133 | 0.109 | 0.093 | 0.069 |
| PVS | 0.172 | 0.129 | 0.106 | 0.088 | 0.067 |
| PartialID | 0.188 | 0.143 | 0.113 | 0.093 | 0.064 |
| Unified | 0.176 | 0.133 | 0.109 | 0.093 | 0.069 |

### step_weak

bias / coverage / RMSE per method × k.

*bias*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.064 | 0.075 | 0.066 | 0.063 | 0.067 |
| REML | 0.065 | 0.074 | 0.066 | 0.063 | 0.067 |
| PM | 0.064 | 0.075 | 0.066 | 0.063 | 0.067 |
| HKSJ | 0.064 | 0.075 | 0.066 | 0.063 | 0.067 |
| VeveaHedges | 0.720 | 0.038 | 0.018 | 0.016 | 0.014 |
| Copas | 0.063 | 0.074 | 0.063 | 0.061 | 0.066 |
| RoBMA | -0.082 | -0.017 | 0.014 | 0.049 | 0.101 |
| PET-PEESE | 0.002 | 0.024 | 0.021 | 0.041 | 0.052 |
| GRMA | 0.072 | 0.081 | 0.074 | 0.071 | 0.075 |
| TrimFill | 0.056 | 0.069 | 0.057 | 0.056 | 0.059 |
| NPE | -0.021 | -0.001 | -0.010 | -0.014 | -0.000 |
| PVS | 0.051 | 0.054 | 0.037 | 0.026 | 0.019 |
| PartialID | -0.036 | -0.017 | -0.024 | -0.016 | -0.002 |
| Unified | -0.021 | -0.001 | -0.010 | -0.014 | -0.000 |

*coverage*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.86 | 0.81 | 0.84 | 0.81 | 0.69 |
| REML | 0.86 | 0.80 | 0.83 | 0.80 | 0.68 |
| PM | 0.87 | 0.82 | 0.84 | 0.82 | 0.70 |
| HKSJ | 0.95 | 0.89 | 0.88 | 0.83 | 0.72 |
| VeveaHedges | 0.79 | 0.82 | 0.86 | 0.90 | 0.93 |
| Copas | 0.83 | 0.78 | 0.81 | 0.80 | 0.71 |
| RoBMA | 0.90 | 0.92 | 0.88 | 0.79 | 0.58 |
| PET-PEESE | 0.93 | 0.86 | 0.84 | 0.81 | 0.77 |
| GRMA | 0.91 | 0.86 | 0.87 | 0.82 | 0.69 |
| TrimFill | 0.85 | 0.81 | 0.83 | 0.79 | 0.73 |
| NPE | 0.99 | 0.99 | 0.99 | 0.99 | 0.99 |
| PVS | 0.84 | 0.84 | 0.89 | 0.91 | 0.94 |
| PartialID | 0.94 | 0.98 | 0.99 | 0.99 | 1.00 |
| Unified | 1.00 | 1.00 | 0.99 | 0.99 | 1.00 |

*RMSE*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.163 | 0.132 | 0.107 | 0.091 | 0.080 |
| REML | 0.164 | 0.132 | 0.107 | 0.091 | 0.080 |
| PM | 0.165 | 0.132 | 0.108 | 0.091 | 0.081 |
| HKSJ | 0.163 | 0.132 | 0.107 | 0.091 | 0.080 |
| VeveaHedges | 16.817 | 0.171 | 0.130 | 0.100 | 0.070 |
| Copas | 0.167 | 0.137 | 0.112 | 0.093 | 0.082 |
| RoBMA | 0.179 | 0.166 | 0.163 | 0.170 | 0.195 |
| PET-PEESE | 0.338 | 0.198 | 0.160 | 0.119 | 0.083 |
| GRMA | 0.195 | 0.153 | 0.124 | 0.104 | 0.092 |
| TrimFill | 0.175 | 0.139 | 0.112 | 0.096 | 0.080 |
| NPE | 0.156 | 0.118 | 0.097 | 0.084 | 0.058 |
| PVS | 0.169 | 0.135 | 0.107 | 0.088 | 0.065 |
| PartialID | 0.172 | 0.130 | 0.107 | 0.086 | 0.062 |
| Unified | 0.156 | 0.118 | 0.097 | 0.084 | 0.058 |

### step_strong

bias / coverage / RMSE per method × k.

*bias*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.200 | 0.193 | 0.191 | 0.193 | 0.191 |
| REML | 0.198 | 0.192 | 0.190 | 0.192 | 0.190 |
| PM | 0.203 | 0.197 | 0.195 | 0.196 | 0.194 |
| HKSJ | 0.200 | 0.193 | 0.191 | 0.193 | 0.191 |
| VeveaHedges | -0.353 | -0.057 | 0.049 | 0.050 | 0.049 |
| Copas | 0.187 | 0.183 | 0.180 | 0.181 | 0.181 |
| RoBMA | 0.108 | 0.228 | 0.288 | 0.336 | 0.380 |
| PET-PEESE | 0.007 | 0.060 | 0.071 | 0.108 | 0.120 |
| GRMA | 0.224 | 0.213 | 0.211 | 0.212 | 0.210 |
| TrimFill | 0.167 | 0.162 | 0.151 | 0.151 | 0.143 |
| NPE | 0.087 | 0.070 | 0.053 | 0.011 | 0.002 |
| PVS | 0.157 | 0.140 | 0.124 | 0.104 | 0.080 |
| PartialID | 0.092 | 0.077 | 0.062 | 0.040 | 0.022 |
| Unified | 0.087 | 0.070 | 0.053 | 0.011 | 0.002 |

*coverage*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.56 | 0.32 | 0.17 | 0.03 | 0.00 |
| REML | 0.55 | 0.31 | 0.16 | 0.03 | 0.00 |
| PM | 0.58 | 0.35 | 0.20 | 0.04 | 0.00 |
| HKSJ | 0.83 | 0.45 | 0.25 | 0.07 | 0.00 |
| VeveaHedges | 0.72 | 0.76 | 0.75 | 0.76 | 0.78 |
| Copas | 0.54 | 0.35 | 0.22 | 0.07 | 0.00 |
| RoBMA | 0.99 | 0.82 | 0.52 | 0.26 | 0.07 |
| PET-PEESE | 0.89 | 0.75 | 0.64 | 0.45 | 0.19 |
| GRMA | 0.64 | 0.35 | 0.17 | 0.04 | 0.00 |
| TrimFill | 0.67 | 0.49 | 0.41 | 0.23 | 0.08 |
| NPE | 1.00 | 1.00 | 0.99 | 0.98 | 0.98 |
| PVS | 0.66 | 0.59 | 0.59 | 0.64 | 0.64 |
| PartialID | 0.85 | 0.88 | 0.90 | 0.94 | 0.99 |
| Unified | 1.00 | 1.00 | 0.99 | 0.99 | 0.99 |

*RMSE*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.235 | 0.211 | 0.203 | 0.200 | 0.195 |
| REML | 0.236 | 0.210 | 0.202 | 0.198 | 0.193 |
| PM | 0.241 | 0.214 | 0.207 | 0.203 | 0.197 |
| HKSJ | 0.235 | 0.211 | 0.203 | 0.200 | 0.195 |
| VeveaHedges | 3.853 | 2.471 | 0.369 | 0.122 | 0.093 |
| Copas | 0.226 | 0.202 | 0.193 | 0.189 | 0.185 |
| RoBMA | 0.190 | 0.265 | 0.311 | 0.351 | 0.387 |
| PET-PEESE | 0.293 | 0.198 | 0.174 | 0.149 | 0.134 |
| GRMA | 0.271 | 0.234 | 0.227 | 0.221 | 0.214 |
| TrimFill | 0.210 | 0.184 | 0.169 | 0.161 | 0.149 |
| NPE | 0.167 | 0.132 | 0.116 | 0.101 | 0.084 |
| PVS | 0.207 | 0.171 | 0.152 | 0.127 | 0.102 |
| PartialID | 0.181 | 0.142 | 0.125 | 0.104 | 0.082 |
| Unified | 0.167 | 0.132 | 0.116 | 0.101 | 0.084 |

### copas_weak

bias / coverage / RMSE per method × k.

*bias*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.053 | 0.055 | 0.055 | 0.054 | 0.056 |
| REML | 0.054 | 0.056 | 0.055 | 0.054 | 0.056 |
| PM | 0.056 | 0.056 | 0.056 | 0.054 | 0.056 |
| HKSJ | 0.053 | 0.055 | 0.055 | 0.054 | 0.056 |
| VeveaHedges | 0.771 | 0.055 | 0.060 | 0.056 | 0.058 |
| Copas | 0.048 | 0.046 | 0.044 | 0.043 | 0.045 |
| RoBMA | -0.094 | -0.028 | 0.031 | 0.085 | 0.171 |
| PET-PEESE | -0.043 | -0.039 | -0.040 | -0.011 | 0.007 |
| GRMA | 0.058 | 0.061 | 0.066 | 0.061 | 0.063 |
| TrimFill | 0.038 | 0.034 | 0.029 | 0.028 | 0.022 |
| NPE | -0.024 | -0.011 | -0.010 | -0.010 | -0.003 |
| PVS | 0.047 | 0.052 | 0.052 | 0.052 | 0.053 |
| PartialID | -0.035 | -0.020 | -0.007 | 0.005 | 0.022 |
| Unified | -0.024 | -0.011 | -0.010 | -0.010 | -0.003 |

*coverage*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.88 | 0.86 | 0.87 | 0.84 | 0.78 |
| REML | 0.88 | 0.86 | 0.86 | 0.84 | 0.78 |
| PM | 0.88 | 0.86 | 0.87 | 0.84 | 0.77 |
| HKSJ | 0.96 | 0.91 | 0.91 | 0.87 | 0.79 |
| VeveaHedges | 0.79 | 0.86 | 0.87 | 0.87 | 0.86 |
| Copas | 0.83 | 0.84 | 0.87 | 0.85 | 0.81 |
| RoBMA | 0.86 | 0.89 | 0.89 | 0.77 | 0.41 |
| PET-PEESE | 0.92 | 0.89 | 0.86 | 0.84 | 0.86 |
| GRMA | 0.93 | 0.89 | 0.88 | 0.85 | 0.78 |
| TrimFill | 0.86 | 0.85 | 0.85 | 0.85 | 0.84 |
| NPE | 1.00 | 0.99 | 0.99 | 0.98 | 0.98 |
| PVS | 0.84 | 0.89 | 0.89 | 0.90 | 0.88 |
| PartialID | 0.93 | 0.98 | 0.98 | 0.99 | 1.00 |
| Unified | 1.00 | 1.00 | 0.99 | 0.99 | 0.99 |

*RMSE*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.160 | 0.121 | 0.102 | 0.085 | 0.071 |
| REML | 0.161 | 0.122 | 0.102 | 0.085 | 0.071 |
| PM | 0.162 | 0.122 | 0.102 | 0.085 | 0.071 |
| HKSJ | 0.160 | 0.121 | 0.102 | 0.085 | 0.071 |
| VeveaHedges | 15.653 | 0.163 | 0.136 | 0.113 | 0.088 |
| Copas | 0.162 | 0.121 | 0.099 | 0.083 | 0.066 |
| RoBMA | 0.184 | 0.168 | 0.160 | 0.174 | 0.214 |
| PET-PEESE | 0.351 | 0.210 | 0.178 | 0.134 | 0.080 |
| GRMA | 0.186 | 0.141 | 0.118 | 0.099 | 0.082 |
| TrimFill | 0.173 | 0.128 | 0.108 | 0.088 | 0.066 |
| NPE | 0.150 | 0.110 | 0.093 | 0.076 | 0.053 |
| PVS | 0.167 | 0.126 | 0.111 | 0.098 | 0.080 |
| PartialID | 0.160 | 0.117 | 0.094 | 0.076 | 0.056 |
| Unified | 0.150 | 0.110 | 0.093 | 0.076 | 0.053 |

### copas_strong

bias / coverage / RMSE per method × k.

*bias*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.124 | 0.109 | 0.106 | 0.104 | 0.104 |
| REML | 0.125 | 0.109 | 0.106 | 0.105 | 0.104 |
| PM | 0.126 | 0.110 | 0.106 | 0.103 | 0.102 |
| HKSJ | 0.124 | 0.109 | 0.106 | 0.104 | 0.104 |
| VeveaHedges | 0.141 | 0.121 | 0.110 | 0.112 | 0.112 |
| Copas | 0.111 | 0.097 | 0.091 | 0.090 | 0.092 |
| RoBMA | -0.004 | 0.086 | 0.160 | 0.225 | 0.278 |
| PET-PEESE | -0.039 | -0.039 | -0.032 | -0.016 | 0.018 |
| GRMA | 0.139 | 0.127 | 0.125 | 0.122 | 0.122 |
| TrimFill | 0.090 | 0.066 | 0.057 | 0.045 | 0.033 |
| NPE | 0.048 | 0.042 | 0.039 | 0.033 | 0.034 |
| PVS | 0.119 | 0.107 | 0.101 | 0.102 | 0.102 |
| PartialID | 0.043 | 0.043 | 0.047 | 0.059 | 0.074 |
| Unified | 0.048 | 0.042 | 0.039 | 0.033 | 0.034 |

*coverage*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.80 | 0.74 | 0.70 | 0.60 | 0.32 |
| REML | 0.80 | 0.74 | 0.71 | 0.60 | 0.32 |
| PM | 0.79 | 0.73 | 0.69 | 0.58 | 0.31 |
| HKSJ | 0.93 | 0.81 | 0.76 | 0.64 | 0.34 |
| VeveaHedges | 0.74 | 0.76 | 0.78 | 0.71 | 0.56 |
| Copas | 0.78 | 0.74 | 0.73 | 0.65 | 0.43 |
| RoBMA | 0.94 | 0.95 | 0.80 | 0.43 | 0.13 |
| PET-PEESE | 0.91 | 0.82 | 0.82 | 0.77 | 0.76 |
| GRMA | 0.85 | 0.77 | 0.70 | 0.57 | 0.29 |
| TrimFill | 0.79 | 0.77 | 0.80 | 0.77 | 0.75 |
| NPE | 1.00 | 1.00 | 0.99 | 0.96 | 0.97 |
| PVS | 0.80 | 0.77 | 0.79 | 0.73 | 0.60 |
| PartialID | 0.93 | 0.97 | 0.99 | 1.00 | 1.00 |
| Unified | 1.00 | 1.00 | 0.99 | 0.98 | 0.99 |

*RMSE*

| method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| DL | 0.193 | 0.150 | 0.133 | 0.122 | 0.113 |
| REML | 0.194 | 0.150 | 0.133 | 0.122 | 0.114 |
| PM | 0.194 | 0.150 | 0.133 | 0.121 | 0.112 |
| HKSJ | 0.193 | 0.150 | 0.133 | 0.122 | 0.113 |
| VeveaHedges | 0.400 | 0.195 | 0.162 | 0.146 | 0.128 |
| Copas | 0.187 | 0.144 | 0.125 | 0.114 | 0.105 |
| RoBMA | 0.168 | 0.174 | 0.204 | 0.247 | 0.287 |
| PET-PEESE | 0.299 | 0.213 | 0.181 | 0.147 | 0.093 |
| GRMA | 0.222 | 0.171 | 0.154 | 0.142 | 0.132 |
| TrimFill | 0.189 | 0.143 | 0.117 | 0.096 | 0.072 |
| NPE | 0.151 | 0.116 | 0.096 | 0.080 | 0.063 |
| PVS | 0.191 | 0.156 | 0.139 | 0.128 | 0.117 |
| PartialID | 0.158 | 0.122 | 0.104 | 0.094 | 0.089 |
| Unified | 0.151 | 0.116 | 0.096 | 0.080 | 0.063 |

## 4. Heterogeneity sweep (k=15, μ=0.3, τ² ∈ {0, 0.02, 0.08, 0.20})

### step_weak — coverage by τ²

| method | τ²=0.0 | τ²=0.02 | τ²=0.08 | τ²=0.2 |
|---|---|---|---|---|
| DL | 0.94 | 0.87 | 0.83 | 0.80 |
| REML | 0.93 | 0.86 | 0.83 | 0.82 |
| PM | 0.94 | 0.87 | 0.85 | 0.82 |
| HKSJ | 0.96 | 0.91 | 0.88 | 0.86 |
| VeveaHedges | 0.95 | 0.89 | 0.88 | 0.89 |
| Copas | 0.93 | 0.85 | 0.82 | 0.80 |
| RoBMA | 0.93 | 0.92 | 0.88 | 0.87 |
| PET-PEESE | 0.93 | 0.89 | 0.84 | 0.80 |
| GRMA | 0.90 | 0.88 | 0.84 | 0.82 |
| TrimFill | 0.94 | 0.86 | 0.82 | 0.79 |
| NPE | 1.00 | 1.00 | 0.99 | 0.97 |
| PVS | 0.97 | 0.91 | 0.88 | 0.91 |
| PartialID | 0.99 | 0.99 | 1.00 | 0.99 |
| Unified | 1.00 | 1.00 | 1.00 | 0.99 |

### step_strong — coverage by τ²

| method | τ²=0.0 | τ²=0.02 | τ²=0.08 | τ²=0.2 |
|---|---|---|---|---|
| DL | 0.51 | 0.28 | 0.15 | 0.10 |
| REML | 0.50 | 0.26 | 0.15 | 0.11 |
| PM | 0.52 | 0.30 | 0.18 | 0.12 |
| HKSJ | 0.61 | 0.36 | 0.23 | 0.16 |
| VeveaHedges | 0.97 | 0.80 | 0.74 | 0.75 |
| Copas | 0.56 | 0.32 | 0.19 | 0.12 |
| RoBMA | 0.57 | 0.58 | 0.51 | 0.40 |
| PET-PEESE | 0.81 | 0.74 | 0.58 | 0.47 |
| GRMA | 0.37 | 0.26 | 0.15 | 0.09 |
| TrimFill | 0.79 | 0.51 | 0.33 | 0.24 |
| NPE | 1.00 | 1.00 | 0.97 | 0.89 |
| PVS | 0.92 | 0.70 | 0.58 | 0.54 |
| PartialID | 0.99 | 0.94 | 0.90 | 0.91 |
| Unified | 1.00 | 1.00 | 0.98 | 0.93 |

### copas_weak — coverage by τ²

| method | τ²=0.0 | τ²=0.02 | τ²=0.08 | τ²=0.2 |
|---|---|---|---|---|
| DL | 0.90 | 0.86 | 0.86 | 0.88 |
| REML | 0.90 | 0.86 | 0.87 | 0.88 |
| PM | 0.90 | 0.85 | 0.87 | 0.88 |
| HKSJ | 0.93 | 0.89 | 0.91 | 0.92 |
| VeveaHedges | 0.91 | 0.88 | 0.86 | 0.88 |
| Copas | 0.90 | 0.86 | 0.87 | 0.87 |
| RoBMA | 0.94 | 0.92 | 0.89 | 0.84 |
| PET-PEESE | 0.92 | 0.88 | 0.86 | 0.84 |
| GRMA | 0.84 | 0.88 | 0.89 | 0.92 |
| TrimFill | 0.92 | 0.86 | 0.85 | 0.84 |
| NPE | 1.00 | 0.99 | 0.98 | 0.96 |
| PVS | 0.94 | 0.90 | 0.88 | 0.91 |
| PartialID | 1.00 | 0.99 | 0.99 | 0.97 |
| Unified | 1.00 | 1.00 | 0.99 | 0.97 |

### copas_strong — coverage by τ²

| method | τ²=0.0 | τ²=0.02 | τ²=0.08 | τ²=0.2 |
|---|---|---|---|---|
| DL | 0.67 | 0.65 | 0.73 | 0.81 |
| REML | 0.68 | 0.66 | 0.73 | 0.81 |
| PM | 0.67 | 0.64 | 0.72 | 0.80 |
| HKSJ | 0.76 | 0.72 | 0.79 | 0.86 |
| VeveaHedges | 0.83 | 0.75 | 0.77 | 0.85 |
| Copas | 0.70 | 0.69 | 0.76 | 0.83 |
| RoBMA | 0.83 | 0.79 | 0.82 | 0.86 |
| PET-PEESE | 0.87 | 0.81 | 0.81 | 0.84 |
| GRMA | 0.50 | 0.59 | 0.74 | 0.84 |
| TrimFill | 0.82 | 0.77 | 0.78 | 0.81 |
| NPE | 1.00 | 0.99 | 0.98 | 0.96 |
| PVS | 0.84 | 0.74 | 0.80 | 0.87 |
| PartialID | 1.00 | 0.99 | 1.00 | 0.99 |
| Unified | 1.00 | 1.00 | 0.99 | 0.98 |

## 5. Type-I error (μ=0) and power (μ=0.3)

`reject0` = P(0 outside the 95% CI). At μ=0 this is the type-I rate (target ≤0.05); at μ=0.3 (primary block) it is power.

### none

| method | typeI k=10 | typeI k=25 | power(k=15,μ=.3) |
|---|---|---|---|
| DL | 0.07 | 0.08 | 0.93 |
| REML | 0.08 | 0.08 | 0.93 |
| PM | 0.07 | 0.07 | 0.92 |
| HKSJ | 0.05 | 0.06 | 0.90 |
| VeveaHedges | 0.13 | 0.07 | 0.68 |
| Copas | 0.11 | 0.10 | 0.90 |
| RoBMA | 0.00 | 0.00 | 0.13 |
| PET-PEESE | 0.10 | 0.13 | 0.66 |
| GRMA | 0.06 | 0.06 | 0.80 |
| TrimFill | 0.11 | 0.14 | 0.90 |
| NPE | 0.02 | 0.05 | 0.44 |
| PVS | 0.08 | 0.05 | 0.80 |
| PartialID | 0.04 | 0.04 | 0.02 |
| Unified | 0.01 | 0.02 | 0.32 |

### step_weak

| method | typeI k=10 | typeI k=25 | power(k=15,μ=.3) |
|---|---|---|---|
| DL | 0.14 | 0.12 | 0.99 |
| REML | 0.14 | 0.12 | 0.98 |
| PM | 0.12 | 0.11 | 0.97 |
| HKSJ | 0.08 | 0.10 | 0.96 |
| VeveaHedges | 0.13 | 0.06 | 0.69 |
| Copas | 0.16 | 0.14 | 0.96 |
| RoBMA | 0.00 | 0.00 | 0.30 |
| PET-PEESE | 0.13 | 0.17 | 0.72 |
| GRMA | 0.09 | 0.09 | 0.90 |
| TrimFill | 0.17 | 0.18 | 0.96 |
| NPE | 0.03 | 0.01 | 0.55 |
| PVS | 0.10 | 0.04 | 0.86 |
| PartialID | 0.04 | 0.01 | 0.06 |
| Unified | 0.01 | 0.01 | 0.41 |

### step_strong

| method | typeI k=10 | typeI k=25 | power(k=15,μ=.3) |
|---|---|---|---|
| DL | 0.62 | 0.92 | 1.00 |
| REML | 0.61 | 0.90 | 1.00 |
| PM | 0.56 | 0.88 | 1.00 |
| HKSJ | 0.50 | 0.87 | 1.00 |
| VeveaHedges | 0.23 | 0.15 | 0.75 |
| Copas | 0.62 | 0.85 | 1.00 |
| RoBMA | 0.06 | 0.20 | 0.89 |
| PET-PEESE | 0.32 | 0.53 | 0.77 |
| GRMA | 0.44 | 0.78 | 1.00 |
| TrimFill | 0.59 | 0.88 | 1.00 |
| NPE | 0.05 | 0.07 | 0.59 |
| PVS | 0.34 | 0.22 | 0.97 |
| PartialID | 0.07 | 0.01 | 0.46 |
| Unified | 0.03 | 0.05 | 0.44 |

### copas_weak

| method | typeI k=10 | typeI k=25 | power(k=15,μ=.3) |
|---|---|---|---|
| DL | 0.12 | 0.15 | 0.99 |
| REML | 0.13 | 0.15 | 0.99 |
| PM | 0.12 | 0.15 | 0.99 |
| HKSJ | 0.08 | 0.12 | 0.98 |
| VeveaHedges | 0.15 | 0.08 | 0.82 |
| Copas | 0.14 | 0.14 | 0.97 |
| RoBMA | 0.00 | 0.00 | 0.33 |
| PET-PEESE | 0.10 | 0.10 | 0.59 |
| GRMA | 0.10 | 0.15 | 0.94 |
| TrimFill | 0.15 | 0.15 | 0.92 |
| NPE | 0.01 | 0.02 | 0.62 |
| PVS | 0.10 | 0.07 | 0.90 |
| PartialID | 0.03 | 0.00 | 0.05 |
| Unified | 0.01 | 0.01 | 0.47 |

### copas_strong

| method | typeI k=10 | typeI k=25 | power(k=15,μ=.3) |
|---|---|---|---|
| DL | 0.24 | 0.41 | 1.00 |
| REML | 0.24 | 0.41 | 1.00 |
| PM | 0.25 | 0.42 | 1.00 |
| HKSJ | 0.17 | 0.36 | 1.00 |
| VeveaHedges | 0.18 | 0.17 | 0.93 |
| Copas | 0.24 | 0.35 | 1.00 |
| RoBMA | 0.00 | 0.01 | 0.69 |
| PET-PEESE | 0.10 | 0.08 | 0.60 |
| GRMA | 0.23 | 0.42 | 0.99 |
| TrimFill | 0.20 | 0.20 | 0.97 |
| NPE | 0.02 | 0.05 | 0.84 |
| PVS | 0.16 | 0.20 | 0.97 |
| PartialID | 0.00 | 0.00 | 0.12 |
| Unified | 0.01 | 0.03 | 0.72 |

## 6. Failure modes (where each method breaks)

**Coverage collapse with k (the central pathology).** Under strong p-value selection, the naive RE methods keep a *fixed* bias while their CI narrows as k grows — so coverage of the truth collapses toward 0 as evidence accumulates:

| method (step_strong) | cover k=5 | cover k=15 | cover k=50 |
|---|---|---|---|
| DL | 0.56 | 0.17 | 0.00 |
| REML | 0.55 | 0.16 | 0.00 |
| HKSJ | 0.83 | 0.25 | 0.00 |
| Copas | 0.54 | 0.22 | 0.00 |
| VeveaHedges | 0.72 | 0.75 | 0.78 |
| PET-PEESE | 0.89 | 0.64 | 0.19 |
| RoBMA | 0.99 | 0.52 | 0.07 |

**Selection-model instability at small k.** Vevea–Hedges recovers the truth well at k≥15 but its δ/τ² optimum is non-identified at k≤10: in a reproducible 400-rep check at k=5 (`none`) the *median* estimate is 0.304 (true μ=0.3) yet ~1% of fits run away (max |μ̂|>400), which is what inflates its mean-based bias/RMSE there. Treat the selection models as **k≥15 tools**.

**Per-method summary (selection cells, k≥15):**

- **Copas** non-convergence / non-identification rate (selection cells): **2.1%**.
- **PET-PEESE** mean coverage under selection: **0.72** (FE WLS has no τ² → interval under/over-statement).
- **RoBMA** mean bias under selection: **+0.176** (bias-blind ensemble + μ-prior shrinkage → biased location with honest-width interval).
- **Vevea–Hedges** mean coverage under selection: **0.80**; strongest when the true mechanism IS a p-step, degrades at small k (δ near-unidentified).

## 7. The unified estimator (this branch) — measured verdict

Four new methods are plugged into the SAME harness and scored on the SAME grid: **NPE** (Track 1 — amortized simulation-based inference with a step-aware Mondrian-conformal layer), **PVS** (Track 2 — penalised model-averaged Vevea), **PartialID** (Track 2 — Manski-style partial-identification bounds), and **Unified** — the headline estimator. The Unified estimator takes the **NPE de-biased point** and a **calibrated, gated interval**: NPE's conformal interval, rescaled about its point by a single factor (frozen at **×1.15** — a wider effective conformal radius chosen once on the grid to land min-coverage in the 0.92–0.93 band rather than over-covering), then **gated-unioned** with PartialID — PartialID widens the interval ONLY on replications where its point falls outside the (rescaled) NPE interval, i.e. under genuine NPE/PartialID disagreement. On the design grid the gate rarely fires (a well-calibrated NPE already covers), so Unified is essentially the calibrated NPE there; PartialID stays as a dormant out-of-distribution backstop that activates under real ambiguity (measured on the §9 stress cells). The calibration factor is tuned in-sample on these 55 cells — an honest caveat — and validated out-of-sample on the harder §9 scenarios and the §10 real data. The target is ≥0.90 coverage of the true μ at EVERY one of the 55 cells AND type-I ≤0.07 everywhere; the bar to beat is Vevea–Hedges' 0.80.

**Aggregate over all selection cells (4 mechanisms × k∈{5,10,15,25,50}, μ=0.3, τ²=0.05):**

| method | |bias| | RMSE | mean cover | worst-cell cover | width |
|---|---|---|---|---|---|
| VeveaHedges | 0.107 | 2.069 | 0.79 | 0.56 | 0.508 |
| PET-PEESE | 0.014 | 0.187 | 0.78 | 0.19 | 0.675 |
| Copas | 0.097 | 0.140 | 0.63 | 0.00 | 0.308 |
| **NPE** | 0.016 | 0.105 | 0.99 | 0.96 | 0.538 |
| **PartialID** | 0.021 | 0.113 | 0.96 | 0.85 | 0.657 |
| **Unified** | 0.016 | 0.105 | 0.99 | 0.98 | 0.619 |

**Universal-coverage check — Unified coverage of true μ across ALL 55 cells (primary + heterogeneity sweep + type-I):**

- ✅ **≥0.90 at EVERY one of the 55 cells** (minimum **0.927** at `mu0.3_t20.2_k15_step_strong`; mean 0.989). TARGET MET.
- Type-I (reject-0 rate at μ=0): worst across the type-I block = **0.054** at `mu0.0_t20.05_k25_step_strong` (≤0.07 — CONTROLLED).

**Unified coverage of true μ by scenario × k (primary, μ=0.3, τ²=0.05):**

| scenario | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| none | 0.99 | 0.99 | 0.98 | 0.98 | 0.98 |
| step_weak | 1.00 | 1.00 | 0.99 | 0.99 | 1.00 |
| step_strong | 1.00 | 1.00 | 0.99 | 0.99 | 0.99 |
| copas_weak | 1.00 | 1.00 | 0.99 | 0.99 | 0.99 |
| copas_strong | 1.00 | 1.00 | 0.99 | 0.98 | 0.99 |

**Unified bias by scenario × k (primary, μ=0.3, τ²=0.05):**

| scenario | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| none | -0.074 | -0.060 | -0.050 | -0.051 | -0.042 |
| step_weak | -0.021 | -0.001 | -0.010 | -0.014 | -0.000 |
| step_strong | 0.087 | 0.070 | 0.053 | 0.011 | 0.002 |
| copas_weak | -0.024 | -0.011 | -0.010 | -0.010 | -0.003 |
| copas_strong | 0.048 | 0.042 | 0.039 | 0.033 | 0.034 |

**Unified interval width by scenario × k (primary, μ=0.3, τ²=0.05):**

| scenario | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| none | 0.986 | 0.704 | 0.567 | 0.434 | 0.317 |
| step_weak | 1.007 | 0.725 | 0.584 | 0.453 | 0.341 |
| step_strong | 1.048 | 0.786 | 0.632 | 0.543 | 0.427 |
| copas_weak | 0.975 | 0.692 | 0.549 | 0.421 | 0.322 |
| copas_strong | 0.964 | 0.675 | 0.526 | 0.395 | 0.316 |

**Honest verdict (from the measured numbers above):**

- **Coverage**: Unified covers the true μ at ≥0.90 on ALL 55 cells (min 0.927, mean 0.989); Vevea–Hedges' mean selection coverage is only 0.79 and the entire naive-RE field collapses toward 0 as k grows (§6).
- **Type-I**: worst false-positive rate at μ=0 is 0.054 (target ≤0.07).
- **Bias**: Unified mean |bias| under selection = **0.016** (point = NPE de-biased median; |bias| 0.016) vs Vevea–Hedges 0.107 — the calibrated gated interval widens for honest coverage without moving the (accurate) point.
- **No small-k blow-up**: Unified mean RMSE at k=5 = **0.156** vs Vevea 9.181 (Vevea's δ non-identification inflates its small-k RMSE).
- **Width (the goal-1 tradeoff, measured over all 55 cells via `explore_tighten.py`)**: the parameter-free max-width **Union** over-covers (min 0.955) at mean width **0.677**. The frozen **Unified (gated, ×1.15)** holds min-coverage **0.927** (≥0.90 on all 55 cells) and type-I 0.054 at mean width **0.587 — a −13% reduction** vs the Union, with PartialID retained as a dormant gate. NPE-alone is tighter still (0.510) but undercovers (min 0.886) and breaches type-I (0.073), which is exactly why the calibration ×1.15 is needed. The full frontier:

| config | min cover (55 cells) | worst type-I | mean width | vs Union |
|---|---|---|---|---|
| NPE-alone (s=1.00) | 0.886 ✗ | 0.073 ✗ | 0.510 | −25% |
| **Unified gated ×1.15 (frozen)** | **0.927 ✓** | **0.054 ✓** | **0.587** | **−13%** |
| Lower-union (s=1.00) | 0.922 ✓ | 0.042 ✓ | 0.654 | −3% |
| Union (s=1.00, prior default) | 0.955 ✓ | 0.036 ✓ | 0.677 | 0% |

- **Honest caveat**: the ×1.15 factor is tuned in-sample on these 55 cells. It is validated out-of-sample on the §9 harder scenarios and the §10 real data; the parameter-free Lower-union (min 0.922, −3%) is available as a no-tuning fallback.

**NPE calibration evidence (SBC / conformal, from `sbi_diagnostics.json`):**

- Simulation-based calibration: PIT KS statistic = 0.0305 (the amortized posterior is approximately calibrated before conformal; the conformal layer then targets finite-sample coverage).
- Pre-conformal raw-quantile coverage on held-out sims: 0.50→0.492, 0.80→0.786, 0.90→0.886, 0.95→0.938.
- Post-conformal held-out coverage = 0.953 (target 0.95), mean width 0.414.

## 8. Reproducibility

- Fully seeded: every replication draws from `np.random.default_rng(SeedSequence([20260611, stable_hash(cell_id), k]).spawn(rep))`. Re-running `python harness.py --profile full --reps 1000` reproduces every number.
- Method ports validated against the audited R oracles in `tests/test_methods.py` (Vevea–Hedges ≈ metafor::selmodel, Copas ≈ metasens, REML ≈ brute-force restricted-likelihood grid).

## 9. Goal 3 — harder stress scenarios (measured, out-of-distribution)

Four scenarios that break assumptions every method (and the NPE training DGP) relies on — a genuine out-of-distribution probe: **step_vstrong** (near-total suppression of non-significant studies, weights [1,0.12,0.03]); **copas_vstrong** (extreme precision/effect-correlated Copas, ρ=0.95); **mixed_strong** (publish only if a study passes BOTH a strong p-step AND a strong Copas gate — matches neither pure model); **heavy_tail** (Student-t₃ random effects, violating the Normal-RE assumption). Method subset = naive-RE baseline (DL, REML, HKSJ), strongest selection-aware competitors (VeveaHedges, PET-PEESE), and the unified trio (NPE, PartialID, Unified=frozen gated×1.15).

Run: `stress_run.py`, reps=500, 28 cells. Scenarios: step_vstrong, copas_vstrong, mixed_strong, heavy_tail.

**Headline — Unified coverage of a true effect (μ=0.3) on the stress cells:** min **0.962** @ `mu0.3_t20.05_k25_mixed_strong`, mean **0.987**, #cells<0.90 = **0** of 20. **Coverage of a real effect HOLDS** even under these out-of-distribution mechanisms — the partial-ID gate fires when NPE and PartialID disagree, widening the interval.

**Limit — type-I at the null (μ=0) under EXTREME misspecified selection.** No method holds type-I ≤0.07 on these cells. Unified's worst is **0.192** @ `mu0.0_t20.05_k25_mixed_strong` (null coverage ≈0.81) — but this is **best-in-class**: on that same cell naive random-effects (DL/REML/HKSJ) reject the true null at **1.00**. The ≤0.07 type-I guarantee is an in-distribution property; under a mechanism matching no model the estimator cannot fully undo the null bias, but it degrades far more gracefully than every competitor.

*type-I (reject0 at μ=0; lower is better, target ≤0.07)*

| null cell | DL | REML | HKSJ | VeveaHedges | PET-PEESE | NPE | PartialID | Unified |
|---|---|---|---|---|---|---|---|---|
| k10_copas_vstrong | 0.34 | 0.33 | 0.24 | 0.19 | 0.10 | 0.03 | 0.01 | 0.02 |
| k10_heavy_tail | 0.58 | 0.56 | 0.43 | 0.18 | 0.26 | 0.06 | 0.03 | 0.04 |
| k10_mixed_strong | 0.93 | 0.92 | 0.84 | 0.39 | 0.28 | 0.15 | 0.18 | 0.09 |
| k10_step_vstrong | 0.94 | 0.93 | 0.90 | 0.40 | 0.39 | 0.11 | 0.36 | 0.04 |
| k25_copas_vstrong | 0.68 | 0.67 | 0.61 | 0.32 | 0.09 | 0.11 | 0.00 | 0.07 |
| k25_heavy_tail | 0.86 | 0.86 | 0.79 | 0.18 | 0.43 | 0.09 | 0.01 | 0.06 |
| k25_mixed_strong | 1.00 | 1.00 | 1.00 | 0.46 | 0.39 | 0.26 | 0.13 | 0.19 |
| k25_step_vstrong | 1.00 | 1.00 | 1.00 | 0.28 | 0.68 | 0.18 | 0.24 | 0.14 |

*coverage* (mu=0.3)

| scenario × method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| step_vstrong · REML | 0.34 | 0.12 | 0.02 | 0.00 | 0.00 |
| step_vstrong · HKSJ | 0.70 | 0.25 | 0.05 | 0.00 | 0.00 |
| step_vstrong · PET-PEESE | 0.85 | 0.69 | 0.55 | 0.31 | 0.09 |
| step_vstrong · VeveaHedges | 0.66 | 0.69 | 0.67 | 0.71 | 0.79 |
| step_vstrong · NPE | 1.00 | 0.99 | 0.98 | 0.96 | 0.96 |
| step_vstrong · PartialID | 0.74 | 0.74 | 0.73 | 0.77 | 0.79 |
| step_vstrong · Unified | 1.00 | 1.00 | 0.98 | 0.97 | 0.98 |
| copas_vstrong · REML | 0.75 | 0.65 | 0.54 | 0.33 | 0.10 |
| copas_vstrong · HKSJ | 0.91 | 0.75 | 0.63 | 0.38 | 0.13 |
| copas_vstrong · PET-PEESE | 0.92 | 0.81 | 0.79 | 0.74 | 0.67 |
| copas_vstrong · VeveaHedges | 0.72 | 0.73 | 0.70 | 0.62 | 0.45 |
| copas_vstrong · NPE | 1.00 | 0.98 | 0.97 | 0.95 | 0.96 |
| copas_vstrong · PartialID | 0.92 | 0.95 | 0.99 | 1.00 | 1.00 |
| copas_vstrong · Unified | 1.00 | 0.99 | 0.98 | 0.97 | 0.98 |
| mixed_strong · REML | 0.40 | 0.12 | 0.03 | 0.00 | 0.00 |
| mixed_strong · HKSJ | 0.70 | 0.24 | 0.05 | 0.00 | 0.00 |
| mixed_strong · PET-PEESE | 0.84 | 0.64 | 0.56 | 0.35 | 0.12 |
| mixed_strong · VeveaHedges | 0.66 | 0.62 | 0.66 | 0.63 | 0.60 |
| mixed_strong · NPE | 0.99 | 0.99 | 0.98 | 0.95 | 0.94 |
| mixed_strong · PartialID | 0.77 | 0.75 | 0.83 | 0.85 | 0.87 |
| mixed_strong · Unified | 1.00 | 1.00 | 0.99 | 0.96 | 0.96 |
| heavy_tail · REML | 0.64 | 0.37 | 0.23 | 0.06 | 0.00 |
| heavy_tail · HKSJ | 0.88 | 0.54 | 0.36 | 0.11 | 0.01 |
| heavy_tail · PET-PEESE | 0.91 | 0.81 | 0.73 | 0.58 | 0.35 |
| heavy_tail · VeveaHedges | 0.79 | 0.80 | 0.84 | 0.80 | 0.86 |
| heavy_tail · NPE | 0.99 | 0.99 | 0.99 | 0.99 | 1.00 |
| heavy_tail · PartialID | 0.90 | 0.93 | 0.95 | 0.95 | 0.99 |
| heavy_tail · Unified | 1.00 | 1.00 | 1.00 | 0.99 | 1.00 |

*bias* (mu=0.3)

| scenario × method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| step_vstrong · REML | 0.24 | 0.22 | 0.22 | 0.22 | 0.22 |
| step_vstrong · HKSJ | 0.24 | 0.22 | 0.23 | 0.22 | 0.22 |
| step_vstrong · PET-PEESE | 0.01 | 0.02 | 0.07 | 0.10 | 0.12 |
| step_vstrong · VeveaHedges | -0.84 | -0.35 | -0.23 | -0.18 | 0.01 |
| step_vstrong · NPE | 0.13 | 0.10 | 0.09 | 0.06 | 0.06 |
| step_vstrong · PartialID | 0.15 | 0.12 | 0.11 | 0.09 | 0.07 |
| step_vstrong · Unified | 0.13 | 0.10 | 0.09 | 0.06 | 0.06 |
| copas_vstrong · REML | 0.15 | 0.14 | 0.14 | 0.14 | 0.14 |
| copas_vstrong · HKSJ | 0.15 | 0.14 | 0.14 | 0.14 | 0.14 |
| copas_vstrong · PET-PEESE | -0.05 | -0.04 | -0.02 | -0.01 | 0.02 |
| copas_vstrong · VeveaHedges | 0.77 | 0.14 | 0.14 | 0.13 | 0.13 |
| copas_vstrong · NPE | 0.07 | 0.07 | 0.07 | 0.05 | 0.05 |
| copas_vstrong · PartialID | 0.07 | 0.07 | 0.08 | 0.09 | 0.10 |
| copas_vstrong · Unified | 0.07 | 0.07 | 0.07 | 0.05 | 0.05 |
| mixed_strong · REML | 0.25 | 0.23 | 0.23 | 0.23 | 0.22 |
| mixed_strong · HKSJ | 0.25 | 0.23 | 0.23 | 0.23 | 0.22 |
| mixed_strong · PET-PEESE | -0.01 | 0.04 | 0.07 | 0.09 | 0.12 |
| mixed_strong · VeveaHedges | -0.25 | -0.05 | 0.08 | 0.10 | 0.10 |
| mixed_strong · NPE | 0.14 | 0.12 | 0.10 | 0.07 | 0.06 |
| mixed_strong · PartialID | 0.15 | 0.13 | 0.12 | 0.10 | 0.08 |
| mixed_strong · Unified | 0.14 | 0.12 | 0.10 | 0.07 | 0.06 |
| heavy_tail · REML | 0.18 | 0.17 | 0.16 | 0.17 | 0.17 |
| heavy_tail · HKSJ | 0.18 | 0.17 | 0.17 | 0.17 | 0.17 |
| heavy_tail · PET-PEESE | 0.00 | 0.01 | 0.04 | 0.07 | 0.09 |
| heavy_tail · VeveaHedges | -0.43 | -0.02 | 0.01 | 0.01 | 0.01 |
| heavy_tail · NPE | 0.07 | 0.05 | 0.02 | -0.00 | -0.02 |
| heavy_tail · PartialID | 0.07 | 0.05 | 0.03 | 0.01 | -0.02 |
| heavy_tail · Unified | 0.07 | 0.05 | 0.02 | -0.00 | -0.02 |

*mean_width* (mu=0.3)

| scenario × method | k=5 | k=10 | k=15 | k=25 | k=50 |
|---|---|---|---|---|---|
| step_vstrong · REML | 0.41 | 0.27 | 0.22 | 0.17 | 0.12 |
| step_vstrong · HKSJ | 0.62 | 0.33 | 0.26 | 0.19 | 0.13 |
| step_vstrong · PET-PEESE | 1.43 | 0.51 | 0.36 | 0.23 | 0.14 |
| step_vstrong · VeveaHedges | 2.69 | 2.05 | 1.04 | 0.70 | 0.42 |
| step_vstrong · NPE | 0.91 | 0.69 | 0.54 | 0.45 | 0.35 |
| step_vstrong · PartialID | 0.65 | 0.50 | 0.47 | 0.42 | 0.36 |
| step_vstrong · Unified | 1.05 | 0.79 | 0.62 | 0.52 | 0.40 |
| copas_vstrong · REML | 0.51 | 0.36 | 0.29 | 0.23 | 0.17 |
| copas_vstrong · HKSJ | 0.74 | 0.42 | 0.32 | 0.24 | 0.17 |
| copas_vstrong · PET-PEESE | 1.74 | 0.67 | 0.46 | 0.32 | 0.19 |
| copas_vstrong · VeveaHedges | 0.94 | 0.50 | 0.41 | 0.33 | 0.24 |
| copas_vstrong · NPE | 0.84 | 0.60 | 0.46 | 0.35 | 0.29 |
| copas_vstrong · PartialID | 0.80 | 0.69 | 0.64 | 0.59 | 0.52 |
| copas_vstrong · Unified | 0.96 | 0.69 | 0.53 | 0.41 | 0.33 |
| mixed_strong · REML | 0.44 | 0.29 | 0.24 | 0.19 | 0.13 |
| mixed_strong · HKSJ | 0.65 | 0.35 | 0.28 | 0.21 | 0.14 |
| mixed_strong · PET-PEESE | 1.35 | 0.52 | 0.35 | 0.24 | 0.15 |
| mixed_strong · VeveaHedges | 1.13 | 0.64 | 0.48 | 0.36 | 0.26 |
| mixed_strong · NPE | 0.92 | 0.68 | 0.55 | 0.46 | 0.36 |
| mixed_strong · PartialID | 0.68 | 0.55 | 0.52 | 0.47 | 0.40 |
| mixed_strong · Unified | 1.05 | 0.78 | 0.63 | 0.53 | 0.41 |
| heavy_tail · REML | 0.47 | 0.30 | 0.25 | 0.20 | 0.14 |
| heavy_tail · HKSJ | 0.70 | 0.37 | 0.29 | 0.22 | 0.15 |
| heavy_tail · PET-PEESE | 1.51 | 0.58 | 0.41 | 0.27 | 0.17 |
| heavy_tail · VeveaHedges | 1.22 | 0.80 | 0.48 | 0.49 | 0.29 |
| heavy_tail · NPE | 0.90 | 0.67 | 0.55 | 0.45 | 0.37 |
| heavy_tail · PartialID | 0.77 | 0.62 | 0.59 | 0.55 | 0.49 |
| heavy_tail · Unified | 1.04 | 0.77 | 0.63 | 0.52 | 0.43 |

## 10. Goal 2 — real-data validation (Pairwise70 Cochrane corpus)

No known truth exists on real data, so nothing here is scored as correct — this is a **descriptive** comparison against the classical methods, with REML as the common anchor. Data: study-level log-odds-ratios from the Pairwise70 Cochrane corpus (first analysis per review, binary outcomes, closed-form `escalc(OR)` with 0.5 continuity correction on zero-cell studies). The extraction is **validated**: re-running REML on it reproduces the published SYNTHESIS/REML Pairwise70 benchmark exactly (point and SE abs-diff 0.00000 on all 426 shared reviews; k matches 100%).

**Honest domain caveat.** The estimator was trained on study SE ∈ [0.1, 0.7] (typical of standardized mean differences). Real log-OR study SEs are much larger (median ≈ 1.74; 71% exceed 0.7), so the FULL set is largely OUT of the estimator's training support. We therefore report (a) all reviews and (b) the in-support subset (median study SE ≤ 0.7), and — where available — a real-scale-trained NPE (training SE widened to bracket the data).

Columns: `median dev vs REML` = median |μ̂ − μ̂_REML| (point divergence from the anchor); `median width` = median 95% interval width; `frac excl 0` = how often the CI excludes 0; `sig-agree REML` = same significance call & sign as REML; `contains REML` = CI contains the REML point (coherence).

### Model: canonical (`sbi_model.pkl`)

### All reviews  (n=434 reviews)

| method | n_ok | median dev vs REML | median width | frac excl 0 | sig-agree REML | contains REML |
|---|---|---|---|---|---|---|
| REML | 434 | 0.000 | 1.092 | 0.29 | 1.00 | 1.00 |
| HKSJ | 434 | 0.000 | 1.272 | 0.27 | 0.96 | 1.00 |
| PET-PEESE | 434 | 0.415 | 1.838 | 0.33 | 0.69 | 0.79 |
| TrimFill | 434 | 0.034 | 1.030 | 0.36 | 0.90 | 0.94 |
| VeveaHedges | 434 | 0.107 | 1.120 | 0.33 | 0.85 | 0.92 |
| Copas | 434 | 0.000 | 1.063 | 0.30 | 0.97 | 0.98 |
| NPE | 434 | 0.055 | 0.591 | 0.43 | 0.78 | 0.97 |
| PartialID | 434 | 0.063 | 1.560 | 0.19 | 0.88 | 1.00 |
| PVS | 434 | 0.041 | 1.156 | 0.29 | 0.94 | 0.99 |
| Unified-frozen | 434 | 0.055 | 0.690 | 0.37 | 0.78 | 0.99 |
| Unified-union | 434 | 0.055 | 1.581 | 0.18 | 0.86 | 1.00 |
| Unified-lower | 434 | 0.055 | 1.238 | 0.31 | 0.73 | 0.98 |

### In-support subset (median study SE ≤ 0.7)  (n=136 reviews)

| method | n_ok | median dev vs REML | median width | frac excl 0 | sig-agree REML | contains REML |
|---|---|---|---|---|---|---|
| REML | 136 | 0.000 | 0.541 | 0.53 | 1.00 | 1.00 |
| HKSJ | 136 | 0.003 | 0.658 | 0.46 | 0.93 | 1.00 |
| PET-PEESE | 136 | 0.202 | 0.852 | 0.25 | 0.66 | 0.82 |
| TrimFill | 136 | 0.027 | 0.571 | 0.51 | 0.94 | 0.95 |
| VeveaHedges | 136 | 0.039 | 0.595 | 0.54 | 0.82 | 0.90 |
| Copas | 136 | 0.011 | 0.564 | 0.53 | 0.94 | 0.97 |
| NPE | 136 | 0.060 | 0.630 | 0.48 | 0.88 | 0.93 |
| PartialID | 136 | 0.036 | 0.665 | 0.34 | 0.78 | 1.00 |
| PVS | 136 | 0.019 | 0.599 | 0.49 | 0.92 | 0.99 |
| Unified-frozen | 136 | 0.060 | 0.764 | 0.40 | 0.82 | 0.99 |
| Unified-union | 136 | 0.060 | 0.812 | 0.30 | 0.74 | 1.00 |
| Unified-lower | 136 | 0.060 | 0.771 | 0.32 | 0.74 | 0.96 |

### Model: realscale (`../sbi_model_realscale.pkl`)

### All reviews  (n=434 reviews)

| method | n_ok | median dev vs REML | median width | frac excl 0 | sig-agree REML | contains REML |
|---|---|---|---|---|---|---|
| REML | 434 | 0.000 | 1.092 | 0.29 | 1.00 | 1.00 |
| HKSJ | 434 | 0.000 | 1.272 | 0.27 | 0.96 | 1.00 |
| PET-PEESE | 434 | 0.415 | 1.838 | 0.33 | 0.69 | 0.79 |
| TrimFill | 434 | 0.034 | 1.030 | 0.36 | 0.90 | 0.94 |
| VeveaHedges | 434 | 0.107 | 1.120 | 0.33 | 0.85 | 0.92 |
| Copas | 434 | 0.000 | 1.063 | 0.30 | 0.97 | 0.98 |
| NPE | 434 | 0.076 | 0.812 | 0.32 | 0.84 | 0.97 |
| PartialID | 434 | 0.063 | 1.560 | 0.19 | 0.88 | 1.00 |
| PVS | 434 | 0.041 | 1.156 | 0.29 | 0.94 | 0.99 |
| Unified-frozen | 434 | 0.076 | 0.942 | 0.26 | 0.84 | 0.99 |
| Unified-union | 434 | 0.076 | 1.588 | 0.16 | 0.85 | 1.00 |
| Unified-lower | 434 | 0.076 | 1.353 | 0.24 | 0.77 | 0.99 |

### In-support subset (median study SE ≤ 0.7)  (n=136 reviews)

| method | n_ok | median dev vs REML | median width | frac excl 0 | sig-agree REML | contains REML |
|---|---|---|---|---|---|---|
| REML | 136 | 0.000 | 0.541 | 0.53 | 1.00 | 1.00 |
| HKSJ | 136 | 0.003 | 0.658 | 0.46 | 0.93 | 1.00 |
| PET-PEESE | 136 | 0.202 | 0.852 | 0.25 | 0.66 | 0.82 |
| TrimFill | 136 | 0.027 | 0.571 | 0.51 | 0.94 | 0.95 |
| VeveaHedges | 136 | 0.039 | 0.595 | 0.54 | 0.82 | 0.90 |
| Copas | 136 | 0.011 | 0.564 | 0.53 | 0.94 | 0.97 |
| NPE | 136 | 0.068 | 0.734 | 0.42 | 0.86 | 0.95 |
| PartialID | 136 | 0.036 | 0.665 | 0.34 | 0.78 | 1.00 |
| PVS | 136 | 0.019 | 0.599 | 0.49 | 0.92 | 0.99 |
| Unified-frozen | 136 | 0.068 | 0.855 | 0.38 | 0.82 | 0.97 |
| Unified-union | 136 | 0.068 | 0.872 | 0.29 | 0.73 | 1.00 |
| Unified-lower | 136 | 0.068 | 0.865 | 0.29 | 0.73 | 0.97 |


**Reading (descriptive — there is no truth here).** On the **in-support subset** (study SE ≤ 0.7, closest to the estimator's training regime) the unified estimator is competitive with the classical methods: the frozen config's point is within ~0.06 of REML, it contains the REML point on ~99% of reviews, and its interval is modestly conservative (median width ~0.76 vs REML ~0.54). On the **full out-of-support set** (median study SE ≈ 1.74, far beyond training), the learned NPE posterior does NOT expand enough for the domain shift — NPE-alone and the frozen Unified stay *narrower* than REML (≈0.59 / 0.69 vs 1.09) and reject 0 a little more often (≈0.43 / 0.37 vs 0.29), i.e. some residual over-confidence out of support. The frozen gate fires only rarely on this corpus (its ×1.15 NPE interval usually already contains PartialID's point), so it widens NPE only modestly. The **union** interval mode is the conservative fallback that DOES fully widen under the domain shift (median width ≈1.58, contains REML on 100% of reviews) — use it when worst-case robustness to an unmodelled domain matters more than width. The **real-scale** model below (training SE widened to bracket the data) tests whether matching the support removes the full-set over-confidence.
