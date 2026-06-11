# Truth-Recovery Yardstick — Measured Leaderboard

> Generated from `full` run · base_seed=`20260611` · 1000 replications/cell · 55 cells · 8242.2s · GRMA bootstrap B=199.

**What this is.** A known-truth simulation that injects BOTH heterogeneity (true τ²) AND a parameterised publication-selection mechanism, then scores every pooling/bias method in the portfolio on recovery of the TRUE μ. This replaces the inventory's *reasoned* ranking (sec 7b) with a *measured* one. No new method is claimed superior here — this establishes the bar one must beat.

## Data-generating process

- Studies drawn from θᵢ ~ N(μ, τ²), yᵢ ~ N(θᵢ, vᵢ); SEs log-uniform on [0.1, 0.7]. The observed meta-analysis is the set of *published* studies (oversampled to the target k), so k is the published count and the true μ is the unconditional mean a method must recover.
- **Step (Vevea–Hedges) selection**: one-sided p cutpoints [0.025, 0.05], publication weights weak=[1.0, 0.75, 0.55], strong=[1.0, 0.35, 0.1].
- **Copas latent selection**: z = γ₀ + γ₁/SE + d, publish if z>0, corr(d, study noise)=ρ. weak={'g0': -0.1, 'g1': 0.12, 'rho': 0.5}, strong={'g0': -0.2, 'g1': 0.12, 'rho': 0.9}.

## 1. The measured bar (headline)

**No existing method recovers the true μ with honest coverage when heterogeneity and publication selection are both present.** Across the selection scenarios at viable k (≥15), the best CI coverage of the true μ achieved by any method is **0.80** (**VeveaHedges**) — far below the nominal 0.95. The three truth axes disagree on a winner:

- **Smallest point bias**: PET-PEESE (|bias|=0.028), VeveaHedges (0.059) — the only genuine bias-correctors.
- **Best coverage of truth**: VeveaHedges (0.80).
- **Lowest RMSE-to-truth**: TrimFill (0.109) — but low RMSE here is low *variance*, not accuracy: it leaves |bias|=0.069 and covers only 0.66. RMSE alone would crown the wrong method, which is exactly why coverage is part of the criterion.

## 2. Leaderboard — joint condition, k ≥ 15 (all methods viable)

Selection scenarios (step weak/strong, Copas weak/strong), τ²=0.05, k ∈ {15,25,50}. Ranked by RMSE-to-true-μ; read alongside |bias| and coverage. (At k<15 the selection models destabilise — see §6.)

| # | method | |bias| | RMSE | coverage | width | fail |
|---|---|---|---|---|---|---|
| 1 | **TrimFill** | 0.069 | 0.109 | 0.66 | 0.240 | 0.00 |
| 2 | **Copas** | 0.095 | 0.120 | 0.58 | 0.234 | 0.02 |
| 3 | **REML** | 0.104 | 0.125 | 0.55 | 0.231 | 0.00 |
| 4 | **DL** | 0.104 | 0.125 | 0.55 | 0.232 | 0.00 |
| 5 | **HKSJ** | 0.104 | 0.125 | 0.59 | 0.254 | 0.00 |
| 6 | **PM** | 0.105 | 0.126 | 0.56 | 0.236 | 0.00 |
| 7 | **PET-PEESE** | 0.028 | 0.136 | 0.72 | 0.325 | 0.00 |
| 8 | **VeveaHedges** | 0.059 | 0.138 | 0.80 | 0.369 | 0.00 |
| 9 | **GRMA** | 0.118 | 0.142 | 0.56 | 0.285 | 0.00 |
| 10 | **RoBMA** | 0.176 | 0.239 | 0.55 | 0.515 | 0.00 |

All-k version (k 5→50 pooled) — note the RMSE for the selection models is inflated by rare small-k blowups (§6):

| # | method | |bias| | RMSE | coverage | width | fail |
|---|---|---|---|---|---|---|
| 1 | TrimFill | 0.076 | 0.133 | 0.70 | 0.323 | 0.00 |
| 2 | Copas | 0.097 | 0.140 | 0.63 | 0.308 | 0.05 |
| 3 | DL | 0.106 | 0.143 | 0.62 | 0.316 | 0.00 |
| 4 | HKSJ | 0.106 | 0.143 | 0.69 | 0.393 | 0.00 |
| 5 | REML | 0.106 | 0.143 | 0.62 | 0.316 | 0.00 |
| 6 | PM | 0.107 | 0.145 | 0.63 | 0.325 | 0.00 |
| 7 | GRMA | 0.119 | 0.164 | 0.64 | 0.438 | 0.00 |
| 8 | PET-PEESE | 0.014 | 0.187 | 0.78 | 0.675 | 0.00 |
| 9 | RoBMA | 0.116 | 0.218 | 0.69 | 0.668 | 0.00 |
| 10 | VeveaHedges | 0.107 | 2.069 | 0.79 | 0.508 | 0.01 |

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

## 7. Reproducibility

- Fully seeded: every replication draws from `np.random.default_rng(SeedSequence([20260611, stable_hash(cell_id), k]).spawn(rep))`. Re-running `python harness.py --profile full --reps 1000` reproduces every number.
- Method ports validated against the audited R oracles in `tests/test_methods.py` (Vevea–Hedges ≈ metafor::selmodel, Copas ≈ metasens, REML ≈ brute-force restricted-likelihood grid).
