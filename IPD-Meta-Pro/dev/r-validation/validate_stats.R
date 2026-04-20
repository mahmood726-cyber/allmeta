#!/usr/bin/env Rscript
# Statistical Validation Script for IPD Meta-Analysis Pro
# Compares JavaScript implementation against R's metafor package

library(metafor)
library(jsonlite)

# Helper function for separator line
sep_line <- function(char = "-", n = 60) paste(rep(char, n), collapse = "")

cat("=============================================================\n")
cat("STATISTICAL VALIDATION: IPD Meta-Analysis Pro vs R metafor\n")
cat("=============================================================\n\n")

# Test data from BCG vaccine trial meta-analysis (standard test case)
# This is the classic dataset used in Borenstein et al. and metafor tutorials
dat <- escalc(measure="RR", ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg)

cat("Test Dataset: BCG Vaccine Trials (13 studies)\n")
cat("Effect measure: Log Risk Ratio\n\n")

# =========================================================================
# TEST 1: DerSimonian-Laird Random Effects
# =========================================================================
cat("TEST 1: DerSimonian-Laird Random-Effects Model\n")
cat(sep_line(), "\n")

res_dl <- rma(yi, vi, data=dat, method="DL")

cat(sprintf("  Pooled effect (log RR): %.6f\n", coef(res_dl)))
cat(sprintf("  Standard error:         %.6f\n", res_dl$se))
cat(sprintf("  95%% CI:                 [%.6f, %.6f]\n", res_dl$ci.lb, res_dl$ci.ub))
cat(sprintf("  tau^2 (between-study):  %.6f\n", res_dl$tau2))
cat(sprintf("  tau:                    %.6f\n", sqrt(res_dl$tau2)))
cat(sprintf("  I^2:                    %.2f%%\n", res_dl$I2))
cat(sprintf("  H^2:                    %.4f\n", res_dl$H2))
cat(sprintf("  Q statistic:            %.4f\n", res_dl$QE))
cat(sprintf("  Q p-value:              %.6f\n", res_dl$QEp))
cat(sprintf("  z-value:                %.4f\n", res_dl$zval))
cat(sprintf("  p-value:                %.6f\n", res_dl$pval))
cat("\n")

# =========================================================================
# TEST 2: REML Random Effects
# =========================================================================
cat("TEST 2: REML Random-Effects Model\n")
cat(sep_line(), "\n")

res_reml <- rma(yi, vi, data=dat, method="REML")

cat(sprintf("  Pooled effect (log RR): %.6f\n", coef(res_reml)))
cat(sprintf("  Standard error:         %.6f\n", res_reml$se))
cat(sprintf("  95%% CI:                 [%.6f, %.6f]\n", res_reml$ci.lb, res_reml$ci.ub))
cat(sprintf("  tau^2 (REML):           %.6f\n", res_reml$tau2))
cat(sprintf("  I^2:                    %.2f%%\n", res_reml$I2))
cat("\n")

# =========================================================================
# TEST 3: HKSJ Adjustment
# =========================================================================
cat("TEST 3: Hartung-Knapp-Sidik-Jonkman Adjustment\n")
cat(sep_line(), "\n")

res_hksj <- rma(yi, vi, data=dat, method="DL", test="knha")

cat(sprintf("  Pooled effect:          %.6f\n", coef(res_hksj)))
cat(sprintf("  SE (adjusted):          %.6f\n", res_hksj$se))
cat(sprintf("  95%% CI (t-dist):        [%.6f, %.6f]\n", res_hksj$ci.lb, res_hksj$ci.ub))
cat(sprintf("  t-value:                %.4f\n", res_hksj$zval))
cat(sprintf("  p-value (t-test):       %.6f\n", res_hksj$pval))
cat(sprintf("  df:                     %d\n", res_hksj$dfs))
cat("\n")

# =========================================================================
# TEST 4: Prediction Interval
# =========================================================================
cat("TEST 4: Prediction Interval (Riley et al. 2011)\n")
cat(sep_line(), "\n")

pi_res <- predict(res_dl, level=0.95)
cat(sprintf("  Prediction interval:    [%.6f, %.6f]\n", pi_res$pi.lb, pi_res$pi.ub))
cat(sprintf("  (df = k-2 = %d)\n", res_dl$k - 2))
cat("\n")

# =========================================================================
# TEST 5: I^2 Confidence Interval (via Q-profile method)
# =========================================================================
cat("TEST 5: I^2 Confidence Interval\n")
cat(sep_line(), "\n")

I2_ci <- confint(res_dl)
cat(sprintf("  I^2:                    %.2f%%\n", res_dl$I2))
cat(sprintf("  95%% CI for I^2:         [%.2f%%, %.2f%%]\n", I2_ci$random["I^2(%)", "ci.lb"], I2_ci$random["I^2(%)", "ci.ub"]))
cat(sprintf("  tau^2 CI:               [%.6f, %.6f]\n", I2_ci$random["tau^2", "ci.lb"], I2_ci$random["tau^2", "ci.ub"]))
cat("\n")

# =========================================================================
# TEST 6: Publication Bias - Egger's Test
# =========================================================================
cat("TEST 6: Egger's Regression Test for Funnel Plot Asymmetry\n")
cat(sep_line(), "\n")

egger <- regtest(res_dl, model="lm")
cat(sprintf("  Intercept:              %.6f\n", egger$fit$beta[1]))
cat(sprintf("  SE (intercept):         %.6f\n", egger$fit$se[1]))
cat(sprintf("  z-value:                %.4f\n", egger$zval))
cat(sprintf("  p-value:                %.6f\n", egger$pval))
cat("\n")

# =========================================================================
# TEST 7: Fixed Effect Model
# =========================================================================
cat("TEST 7: Fixed-Effect Model (Inverse Variance)\n")
cat(sep_line(), "\n")

res_fe <- rma(yi, vi, data=dat, method="FE")

cat(sprintf("  Pooled effect:          %.6f\n", coef(res_fe)))
cat(sprintf("  Standard error:         %.6f\n", res_fe$se))
cat(sprintf("  95%% CI:                 [%.6f, %.6f]\n", res_fe$ci.lb, res_fe$ci.ub))
cat(sprintf("  z-value:                %.4f\n", res_fe$zval))
cat(sprintf("  p-value:                %.6f\n", res_fe$pval))
cat("\n")

# =========================================================================
# TEST 8: Leave-One-Out Analysis
# =========================================================================
cat("TEST 8: Leave-One-Out Sensitivity Analysis\n")
cat(sep_line(), "\n")

loo <- leave1out(res_dl)
cat("  Study omitted -> Pooled effect [95% CI]\n")
for (i in 1:5) {  # First 5 studies
  cat(sprintf("  %2d: %.4f [%.4f, %.4f]  I2=%.1f%%\n",
              i, loo$estimate[i], loo$ci.lb[i], loo$ci.ub[i], loo$I2[i]))
}
cat("  ...\n\n")

# =========================================================================
# TEST 9: Paule-Mandel Estimator
# =========================================================================
cat("TEST 9: Paule-Mandel Heterogeneity Estimator\n")
cat(sep_line(), "\n")

res_pm <- rma(yi, vi, data=dat, method="PM")

cat(sprintf("  tau^2 (PM):             %.6f\n", res_pm$tau2))
cat(sprintf("  Pooled effect:          %.6f\n", coef(res_pm)))
cat(sprintf("  95%% CI:                 [%.6f, %.6f]\n", res_pm$ci.lb, res_pm$ci.ub))
cat("\n")

# =========================================================================
# TEST 10: Sidik-Jonkman Estimator
# =========================================================================
cat("TEST 10: Sidik-Jonkman Heterogeneity Estimator\n")
cat(sep_line(), "\n")

res_sj <- rma(yi, vi, data=dat, method="SJ")

cat(sprintf("  tau^2 (SJ):             %.6f\n", res_sj$tau2))
cat(sprintf("  Pooled effect:          %.6f\n", coef(res_sj)))
cat(sprintf("  95%% CI:                 [%.6f, %.6f]\n", res_sj$ci.lb, res_sj$ci.ub))
cat("\n")

# =========================================================================
# SUMMARY
# =========================================================================
cat("=============================================================\n")
cat("REFERENCE VALUES FOR IPD-META-PRO VALIDATION\n")
cat("=============================================================\n")
cat("\nThese values should match the JavaScript implementation:\n\n")

cat("Key statistics to verify:\n")
cat(sprintf("  1. DL pooled log(RR):  %.6f\n", coef(res_dl)))
cat(sprintf("  2. DL tau^2:           %.6f\n", res_dl$tau2))
cat(sprintf("  3. DL I^2:             %.2f%%\n", res_dl$I2))
cat(sprintf("  4. REML tau^2:         %.6f\n", res_reml$tau2))
cat(sprintf("  5. HKSJ SE:            %.6f\n", res_hksj$se))
cat(sprintf("  6. HKSJ p-value:       %.6f\n", res_hksj$pval))
cat(sprintf("  7. Egger p-value:      %.6f\n", egger$pval))
cat("\n")

# Output as JSON for easy comparison
cat("\nJSON output for automated comparison:\n")
results <- list(
  dl = list(
    pooled = as.numeric(coef(res_dl)),
    se = res_dl$se,
    tau2 = res_dl$tau2,
    I2 = res_dl$I2,
    Q = res_dl$QE,
    pQ = res_dl$QEp,
    pval = res_dl$pval
  ),
  reml = list(
    pooled = as.numeric(coef(res_reml)),
    tau2 = res_reml$tau2
  ),
  hksj = list(
    se = res_hksj$se,
    pval = res_hksj$pval
  ),
  pi = list(
    lower = pi_res$pi.lb,
    upper = pi_res$pi.ub
  ),
  egger = list(
    pval = egger$pval
  )
)

cat(jsonlite::toJSON(results, pretty=TRUE, auto_unbox=TRUE))
cat("\n")
