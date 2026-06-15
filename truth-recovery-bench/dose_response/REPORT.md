# Dose-Response Truth-Recovery — measured report

> Seeded (20260615), reps/cell = 1000, 19 cells, 554s. Every number is produced by `harness_dose.py`; nothing is hand-entered. True slope β=0.30 (log-RR per unit dose) in the slope block; curve test doses [1.0, 3.0, 5.0].

Aggregate dose-response data: per study, non-reference log-RRs vs a shared reference, with the Greenland-Longnecker within-study covariance (off-diagonal 1/a₀). Stage 1 = per-study GLS slope; Stage 2 = pool.

## 1. Slope coverage as heterogeneity rises (the dose-response-pro bug)

**NaiveFE** = fixed-effect inverse-variance pool, τ² ignored — the incumbent failure in its starkest form (coverage collapses to ~0.07 once the slope is heterogeneous). **DL** = DerSimonian-Laird RE + z interval (recovers most of it, but under-covers at small k — the τ²/qnorm deficiency). **REML+HK** = REML τ² + Knapp-Hartung t interval (the honest lever, the dose-response analogue of the HKSJ fix). **OneStage** = one-stage random-slope mixed model (REML).

| k | τ² true | τ̂² DL | τ̂² REML | NaiveFE | DL | REML+HK | OneStage |
|---|---|---|---|---|---|---|---|
| 6 | 0.0 | 0.000 | 0.000 | 0.953 | 0.961 | **0.992** | 0.992 |
| 6 | 0.05 | 0.052 | 0.052 | 0.191 | 0.891 | **0.956** | 0.961 |
| 6 | 0.15 | 0.154 | 0.155 | 0.124 | 0.906 | **0.959** | 0.962 |
| 6 | 0.3 | 0.298 | 0.298 | 0.076 | 0.885 | **0.944** | 0.953 |
| 10 | 0.0 | 0.000 | 0.000 | 0.957 | 0.970 | **0.990** | 0.990 |
| 10 | 0.05 | 0.052 | 0.051 | 0.177 | 0.918 | **0.955** | 0.959 |
| 10 | 0.15 | 0.148 | 0.150 | 0.103 | 0.913 | **0.957** | 0.960 |
| 10 | 0.3 | 0.297 | 0.297 | 0.074 | 0.912 | **0.953** | 0.955 |
| 20 | 0.0 | 0.000 | 0.000 | 0.954 | 0.965 | **0.979** | 0.977 |
| 20 | 0.05 | 0.049 | 0.049 | 0.206 | 0.921 | **0.942** | 0.946 |
| 20 | 0.15 | 0.152 | 0.150 | 0.108 | 0.941 | **0.955** | 0.957 |
| 20 | 0.3 | 0.304 | 0.304 | 0.081 | 0.931 | **0.952** | 0.955 |

Interval widths (the honest cost of coverage):

| k | τ² true | width FE | width DL | width REML+HK | width OneStage |
|---|---|---|---|---|---|
| 6 | 0.0 | 0.053 | 0.059 | 0.079 | 0.081 |
| 6 | 0.05 | 0.053 | 0.351 | 0.465 | 0.487 |
| 6 | 0.15 | 0.052 | 0.595 | 0.788 | 0.833 |
| 6 | 0.3 | 0.052 | 0.827 | 1.095 | 1.148 |
| 10 | 0.0 | 0.040 | 0.044 | 0.052 | 0.052 |
| 10 | 0.05 | 0.040 | 0.276 | 0.320 | 0.331 |
| 10 | 0.15 | 0.040 | 0.464 | 0.541 | 0.562 |
| 10 | 0.3 | 0.040 | 0.653 | 0.758 | 0.788 |
| 20 | 0.0 | 0.028 | 0.030 | 0.033 | 0.033 |
| 20 | 0.05 | 0.028 | 0.194 | 0.207 | 0.213 |
| 20 | 0.15 | 0.028 | 0.338 | 0.360 | 0.370 |
| 20 | 0.3 | 0.028 | 0.477 | 0.511 | 0.525 |

## 2. Nonlinearity — linear-fit bias vs quadratic recovery

Truth is quadratic g(d)=βd+γd². A LINEAR pooled fit is misspecified: its curve interval at the test doses under-covers and the slope is biased. The **QuadFit** (a 2-term multivariate random-effects pool of the [β₁,β₂] coefficients) recovers the curve. Curve coverage is averaged over the test doses.

| k | γ (curvature) | LinearFit curve cov | **QuadFit curve cov** | REML+HK slope bias |
|---|---|---|---|---|
| 10 | -0.06 | 0.719 | **0.953** | -0.250 |
| 20 | -0.06 | 0.543 | **0.949** | -0.256 |
| 10 | -0.03 | 0.892 | **0.948** | -0.124 |
| 20 | -0.03 | 0.793 | **0.949** | -0.126 |

## 3. Publication / small-study selection

No method here corrects publication bias; selection on the study slope biases the pooled slope and collapses coverage for every method — the honest boundary of the model.

| scenario | sel.frac | NaiveFE | DL | REML+HK | REML+HK slope bias |
|---|---|---|---|---|---|
| copas_strong | 0.86 | 0.117 | 0.806 | 0.862 | 0.072 |
| none | 1.00 | 0.127 | 0.924 | 0.955 | -0.001 |
| step_strong | 0.80 | 0.090 | 0.663 | 0.756 | 0.108 |

## 4. Honest negatives & boundaries

- **Fixed-effect slope pooling is catastrophic, not merely imperfect.** Once the dose-response slope varies across studies, the FE interval (τ² ignored) covers the true slope only ~7–17% of the time — the dose-response-pro collapse, reproduced. It is calibrated ONLY at exactly τ²=0.
- **DL is a real improvement but still under-covers at small k.** The DerSimonian-Laird point τ² is roughly unbiased here, yet the z (qnorm) interval is too narrow with few studies; REML τ² + the Knapp-Hartung t interval (with the HKSJ variance floor) is what restores nominal coverage.
- **REML+HK is mildly conservative at τ²=0** (over-covers slightly) — the honest price of guaranteed coverage under unknown heterogeneity, consistent with the pairwise HKSJ and the NMA/DTA Hartung-Knapp levers.
- **A linear model is the wrong estimand for a nonlinear curve.** Under a quadratic truth the pooled linear slope is biased and its curve interval under-covers at the test doses; only the flexible (quadratic multivariate) fit recovers the curve — and it needs studies with ≥2 distinct non-reference doses to identify the second coefficient.
- **Publication / small-study selection is uncorrected.** Selection on the study slope biases the pool and collapses coverage for every method; a selection model is needed to fix it (out of scope here, flagged like the pairwise / NMA / DTA benches).
- **The Greenland-Longnecker within-study covariance is taken as known.** It is built from the reported reference/dose counts (the standard two-stage input); error in those counts (or non-reported correlations) is not propagated — the usual aggregate-data dose-response assumption.
