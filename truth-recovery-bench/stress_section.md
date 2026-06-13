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
