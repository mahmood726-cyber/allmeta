# RVE meta-regression

Cluster-robust SEs for dependent effects.

Part of the [allmeta](https://github.com/mahmood726-cyber/allmeta) collection.

Live: https://mahmood726-cyber.github.io/allmeta/rve-meta/

<!-- ALM-AUTO-README-BEGIN (regenerate with scripts/gen_app_readmes.py) -->

## When to use

- **Category:** Pairwise MA
- **Data shape:** one row per effect size: `cluster, yi, vi`, then numeric predictors (comma-, semicolon- or tab-separated; optional header row; an `se` column is squared to give `vi`). Several rows may share a cluster.
- **Purpose:** Meta-regression with cluster-robust (CR2) standard errors and Satterthwaite degrees of freedom for dependent effects (robumeta CORR model).

## Method papers

- Hedges LV, Tipton E, Johnson MC. Robust variance estimation in meta-regression with dependent effect size estimates. Res Synth Methods. 2010;1(1):39-65. doi:10.1002/jrsm.5
- Tipton E. Small sample adjustments for robust variance estimation with meta-regression. Psychol Methods. 2015;20(3):375-393. doi:10.1037/met0000011

## Outputs

- Coefficient table (estimate, CR2 SE, t, Satterthwaite df, 95% CI, p), k, m, τ², ρ and the condition number κ₂(XᵀWX), with a warning and a one-click "centre predictors" refit when κ > 9.0×10⁶.
- ρ sensitivity: one click refits at ρ = 0, 0.2, …, 1 (robumeta's `sensitivity()` grid) and adds df, confidence intervals and p-values, flagging coefficients whose sign or 5% significance changes; downloadable as CSV.
- Exports: Markdown report (methods, results, warnings, input data), coefficient CSV, input-data CSV, JSON (inputs, coefficients, full fit), and an **R script** that refits the model with `robumeta::robu()` and `clubSandwich::coef_test()` and prints `sessionInfo()`.

## Reproducibility

- JSON exports include the allmeta version and build SHA from `shared/build-info.js`.
- To check a result in R, use the **R script (.R)** export and run it with robumeta and clubSandwich installed.

<!-- ALM-AUTO-README-END -->
