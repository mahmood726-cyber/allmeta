#!/usr/bin/env Rscript
# ============================================================================
# COMPREHENSIVE BENCHMARK: IPD Meta-Analysis Pro vs R metafor
# ============================================================================
# Tests statistical accuracy across multiple datasets and methods
# Reference implementation: metafor 4.8-0 (Viechtbauer, 2010)

library(metafor)
library(jsonlite)

cat("\n")
cat("╔════════════════════════════════════════════════════════════════════════╗\n")
cat("║     STATISTICAL BENCHMARK: IPD Meta-Analysis Pro vs R metafor         ║\n")
cat("║                    Reference: metafor 4.8-0                            ║\n")
cat("╚════════════════════════════════════════════════════════════════════════╝\n\n")

# ============================================================================
# DATASET 1: BCG Vaccine Trials (Classic meta-analysis dataset)
# ============================================================================
cat("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
cat("DATASET 1: BCG Vaccine Trials (13 studies, Log Risk Ratio)\n")
cat("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")

dat_bcg <- escalc(measure="RR", ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg)

# Run all methods
fe_bcg <- rma(yi, vi, data=dat_bcg, method="FE")
dl_bcg <- rma(yi, vi, data=dat_bcg, method="DL")
reml_bcg <- rma(yi, vi, data=dat_bcg, method="REML")
pm_bcg <- rma(yi, vi, data=dat_bcg, method="PM")
sj_bcg <- rma(yi, vi, data=dat_bcg, method="SJ")
hksj_bcg <- rma(yi, vi, data=dat_bcg, method="DL", test="knha")

# Prediction interval
pi_bcg <- predict(dl_bcg)

# Egger's test
egger_bcg <- regtest(dl_bcg, model="lm")

cat("Method                  | Pooled    | SE        | tau²      | I²      | p-value\n")
cat("------------------------|-----------|-----------|-----------|---------|----------\n")
cat(sprintf("Fixed Effect            | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n",
    coef(fe_bcg), fe_bcg$se, 0, 0, fe_bcg$pval))
cat(sprintf("DerSimonian-Laird       | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n",
    coef(dl_bcg), dl_bcg$se, dl_bcg$tau2, dl_bcg$I2, dl_bcg$pval))
cat(sprintf("REML                    | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n",
    coef(reml_bcg), reml_bcg$se, reml_bcg$tau2, reml_bcg$I2, reml_bcg$pval))
cat(sprintf("Paule-Mandel            | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n",
    coef(pm_bcg), pm_bcg$se, pm_bcg$tau2, pm_bcg$I2, pm_bcg$pval))
cat(sprintf("Sidik-Jonkman           | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n",
    coef(sj_bcg), sj_bcg$se, sj_bcg$tau2, sj_bcg$I2, sj_bcg$pval))
cat(sprintf("DL + HKSJ               | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n",
    coef(hksj_bcg), hksj_bcg$se, hksj_bcg$tau2, hksj_bcg$I2, hksj_bcg$pval))

cat("\nAdditional Statistics:\n")
cat(sprintf("  Q statistic:          %.4f (df=%d, p=%.2e)\n", dl_bcg$QE, dl_bcg$k-1, dl_bcg$QEp))
cat(sprintf("  H² statistic:         %.4f\n", dl_bcg$H2))
cat(sprintf("  Prediction interval:  [%.4f, %.4f]\n", pi_bcg$pi.lb, pi_bcg$pi.ub))
cat(sprintf("  Egger's test p-value: %.4f\n", egger_bcg$pval))

# ============================================================================
# DATASET 2: Aspirin for MI Prevention (Smaller dataset)
# ============================================================================
cat("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
cat("DATASET 2: Aspirin for MI Prevention (6 studies, Odds Ratio)\n")
cat("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")

# Hart et al. aspirin data
dat_hart <- escalc(measure="OR", ai=x1i, n1i=n1i, ci=x2i, n2i=n2i, data=dat.hart1999)

dl_hart <- rma(yi, vi, data=dat_hart, method="DL")
reml_hart <- rma(yi, vi, data=dat_hart, method="REML")
hksj_hart <- rma(yi, vi, data=dat_hart, method="DL", test="knha")

cat("Method                  | Pooled    | SE        | tau²      | I²      | p-value\n")
cat("------------------------|-----------|-----------|-----------|---------|----------\n")
cat(sprintf("DerSimonian-Laird       | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n",
    coef(dl_hart), dl_hart$se, dl_hart$tau2, dl_hart$I2, dl_hart$pval))
cat(sprintf("REML                    | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n",
    coef(reml_hart), reml_hart$se, reml_hart$tau2, reml_hart$I2, reml_hart$pval))
cat(sprintf("DL + HKSJ               | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n",
    coef(hksj_hart), hksj_hart$se, hksj_hart$tau2, hksj_hart$I2, hksj_hart$pval))

# ============================================================================
# DATASET 3: Standardized Mean Difference (Continuous outcomes)
# ============================================================================
cat("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
cat("DATASET 3: Cognitive Behavioral Therapy (SMD, Continuous)\n")
cat("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")

# Normand 1999 - length of hospital stay
dat_norm <- escalc(measure="SMD", m1i=m1i, sd1i=sd1i, n1i=n1i,
                   m2i=m2i, sd2i=sd2i, n2i=n2i, data=dat.normand1999)

dl_norm <- rma(yi, vi, data=dat_norm, method="DL")
reml_norm <- rma(yi, vi, data=dat_norm, method="REML")

cat("Method                  | Pooled    | SE        | tau²      | I²      | p-value\n")
cat("------------------------|-----------|-----------|-----------|---------|----------\n")
cat(sprintf("DerSimonian-Laird       | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n",
    coef(dl_norm), dl_norm$se, dl_norm$tau2, dl_norm$I2, dl_norm$pval))
cat(sprintf("REML                    | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n",
    coef(reml_norm), reml_norm$se, reml_norm$tau2, reml_norm$I2, reml_norm$pval))

# ============================================================================
# DATASET 4: Low Heterogeneity Case
# ============================================================================
cat("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
cat("DATASET 4: Magnesium for MI (Low heterogeneity test)\n")
cat("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")

# Construct magnesium dataset with lower heterogeneity
dat_mg <- dat.yusuf1985

# Calculate log odds ratios
dat_mg$yi <- with(dat_mg, log((ai+0.5)*(di+0.5)/((bi+0.5)*(ci+0.5))))
dat_mg$vi <- with(dat_mg, 1/(ai+0.5) + 1/(bi+0.5) + 1/(ci+0.5) + 1/(di+0.5))

dl_mg <- rma(yi, vi, data=dat_mg, method="DL")

cat("Method                  | Pooled    | SE        | tau²      | I²      | p-value\n")
cat("------------------------|-----------|-----------|-----------|---------|----------\n")
cat(sprintf("DerSimonian-Laird       | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n",
    coef(dl_mg), dl_mg$se, dl_mg$tau2, dl_mg$I2, dl_mg$pval))

# ============================================================================
# NUMERICAL PRECISION TESTS
# ============================================================================
cat("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
cat("NUMERICAL PRECISION TESTS\n")
cat("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")

# Test normal distribution functions
cat("Normal Distribution Functions:\n")
cat(sprintf("  Φ(0)     = %.10f (expected: 0.5)\n", pnorm(0)))
cat(sprintf("  Φ(1.96)  = %.10f (expected: 0.9750021)\n", pnorm(1.96)))
cat(sprintf("  Φ(-1.96) = %.10f (expected: 0.0249979)\n", pnorm(-1.96)))
cat(sprintf("  Φ⁻¹(0.975) = %.10f (expected: 1.959964)\n", qnorm(0.975)))
cat(sprintf("  Φ⁻¹(0.025) = %.10f (expected: -1.959964)\n", qnorm(0.025)))

cat("\nChi-Square Distribution:\n")
cat(sprintf("  χ²(10, df=5) CDF = %.10f\n", pchisq(10, 5)))
cat(sprintf("  χ²⁻¹(0.95, df=12) = %.10f\n", qchisq(0.95, 12)))

cat("\nt-Distribution:\n")
cat(sprintf("  t(2.179, df=12) CDF = %.10f\n", pt(2.179, 12)))
cat(sprintf("  t⁻¹(0.975, df=12) = %.10f\n", qt(0.975, 12)))

# ============================================================================
# EDGE CASES
# ============================================================================
cat("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
cat("EDGE CASES\n")
cat("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")

# Very small tau² (near zero heterogeneity)
set.seed(42)
effects_homog <- rep(0.5, 10) + rnorm(10, 0, 0.01)
variances_homog <- rep(0.04, 10)
res_homog <- rma(effects_homog, variances_homog, method="DL")
cat(sprintf("Near-zero heterogeneity: tau² = %.8f, I² = %.4f%%\n",
    res_homog$tau2, res_homog$I2))

# Very large heterogeneity
effects_hetero <- c(-1, -0.5, 0, 0.5, 1, 1.5)
variances_hetero <- rep(0.04, 6)
res_hetero <- rma(effects_hetero, variances_hetero, method="DL")
cat(sprintf("High heterogeneity: tau² = %.6f, I² = %.2f%%\n",
    res_hetero$tau2, res_hetero$I2))

# Small number of studies (k=3)
effects_small <- c(0.3, 0.5, 0.7)
variances_small <- c(0.05, 0.04, 0.06)
res_small <- rma(effects_small, variances_small, method="DL")
cat(sprintf("Small k (3 studies): pooled = %.6f, tau² = %.6f\n",
    coef(res_small), res_small$tau2))

# ============================================================================
# COMPARISON WITH OTHER SOFTWARE (Published values)
# ============================================================================
cat("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
cat("CROSS-SOFTWARE COMPARISON (Published Reference Values)\n")
cat("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")

cat("BCG Vaccine Data - DerSimonian-Laird Method:\n")
cat("┌─────────────────┬────────────┬────────────┬────────────┐\n")
cat("│ Software        │ Pooled RR  │ 95% CI     │ I²         │\n")
cat("├─────────────────┼────────────┼────────────┼────────────┤\n")
cat(sprintf("│ R metafor       │ %10.4f │ %.2f-%.2f │ %6.2f%%    │\n",
    exp(coef(dl_bcg)), exp(dl_bcg$ci.lb), exp(dl_bcg$ci.ub), dl_bcg$I2))
cat("│ Stata metan     │     0.4895 │ 0.34-0.70  │  92.12%    │\n")
cat("│ RevMan 5        │     0.49   │ 0.34-0.70  │  92%       │\n")
cat("│ Comprehensive   │     0.49   │ 0.35-0.70  │  92.1%     │\n")
cat("│ Meta-Analysis   │            │            │            │\n")
cat("└─────────────────┴────────────┴────────────┴────────────┘\n")

cat("\nNote: Small differences due to rounding and continuity corrections\n")

# ============================================================================
# JSON OUTPUT FOR AUTOMATED TESTING
# ============================================================================
cat("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
cat("JSON REFERENCE VALUES FOR AUTOMATED TESTING\n")
cat("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")

benchmark_data <- list(
  bcg = list(
    k = dl_bcg$k,
    fe = list(pooled = as.numeric(coef(fe_bcg)), se = fe_bcg$se, pval = fe_bcg$pval),
    dl = list(
      pooled = as.numeric(coef(dl_bcg)),
      se = dl_bcg$se,
      tau2 = dl_bcg$tau2,
      I2 = dl_bcg$I2,
      Q = dl_bcg$QE,
      pval = dl_bcg$pval
    ),
    reml = list(pooled = as.numeric(coef(reml_bcg)), tau2 = reml_bcg$tau2),
    pm = list(pooled = as.numeric(coef(pm_bcg)), tau2 = pm_bcg$tau2),
    sj = list(pooled = as.numeric(coef(sj_bcg)), tau2 = sj_bcg$tau2),
    hksj = list(se = hksj_bcg$se, pval = hksj_bcg$pval),
    pi = list(lower = pi_bcg$pi.lb, upper = pi_bcg$pi.ub),
    egger_pval = egger_bcg$pval
  ),
  precision = list(
    norm_cdf_0 = pnorm(0),
    norm_cdf_196 = pnorm(1.96),
    norm_quantile_975 = qnorm(0.975),
    t_quantile_975_12 = qt(0.975, 12),
    chisq_quantile_95_12 = qchisq(0.95, 12)
  )
)

cat(toJSON(benchmark_data, pretty = TRUE, auto_unbox = TRUE))

cat("\n\n")
cat("╔════════════════════════════════════════════════════════════════════════╗\n")
cat("║                         BENCHMARK COMPLETE                             ║\n")
cat("╚════════════════════════════════════════════════════════════════════════╝\n")
