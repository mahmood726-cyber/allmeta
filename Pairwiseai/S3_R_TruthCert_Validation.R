################################################################################
# TruthCert-PairwisePro R Validation Script
# Generates reference values using EXACT datasets from TruthCert-PairwisePro
#
# For Research Synthesis Methods Paper Supplement S3
################################################################################

library(metafor)
library(meta)

output_file <- "C:/Truthcert1/S3_TruthCert_R_Reference.txt"
sink(output_file)

cat(paste(rep("=", 70), collapse=""), "\n")
cat("TruthCert-PairwisePro R Reference Values\n")
cat("Using EXACT datasets from TruthCert-PairwisePro\n")
cat(paste(rep("=", 70), collapse=""), "\n\n")
cat("Generated:", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n")
cat("R Version:", R.version.string, "\n")
cat("metafor Version:", as.character(packageVersion("metafor")), "\n\n")

################################################################################
# DATASET 1: SGLT2_ACM (5 trials - All-Cause Mortality)
# This is the primary validation dataset used in TruthCert-PairwisePro
################################################################################

cat(paste(rep("-", 70), collapse=""), "\n")
cat("DATASET 1: SGLT2i - All-Cause Mortality (k=5)\n")
cat("Source: Pooled SGLT2 trials\n")
cat(paste(rep("-", 70), collapse=""), "\n\n")

# Exact data from TruthCert-PairwisePro
sglt2_acm <- data.frame(
  study = c("DAPA-HF 2019", "EMPEROR-Reduced 2020", "DELIVER 2022",
            "EMPEROR-Preserved 2021", "SOLOIST-WHF 2021"),
  events_t = c(276, 249, 497, 422, 51),
  n_t = c(2373, 1863, 3131, 2997, 608),
  events_c = c(329, 266, 526, 463, 58),
  n_c = c(2371, 1867, 3132, 2991, 614)
)

# Calculate effect sizes (log OR)
sglt2_es <- escalc(measure = "OR",
                   ai = sglt2_acm$events_t, bi = sglt2_acm$n_t - sglt2_acm$events_t,
                   ci = sglt2_acm$events_c, di = sglt2_acm$n_c - sglt2_acm$events_c)

cat("1.1 Effect Sizes (Log Odds Ratio)\n")
cat("Study\t\t\t\tyi (log OR)\tvi (variance)\tSE\n")
for (i in 1:nrow(sglt2_es)) {
  cat(sprintf("%s\t%.6f\t%.6f\t%.6f\n",
              sglt2_acm$study[i], sglt2_es$yi[i], sglt2_es$vi[i], sqrt(sglt2_es$vi[i])))
}
cat("\n")

# Random effects models with all tau² estimators
cat("1.2 Random Effects Models - All tau² Estimators\n\n")

estimators <- c("DL", "REML", "ML", "PM", "HS", "SJ", "HE", "EB")
cat("Estimator\ttau²\t\tI²\t\tPooled Est\tSE\n")

for (est in estimators) {
  tryCatch({
    model <- rma(yi, vi, data = sglt2_es, method = est)
    cat(sprintf("%s\t\t%.6f\t%.4f%%\t%.6f\t%.6f\n",
                est, model$tau2, model$I2,
                as.numeric(model$beta), model$se))
  }, error = function(e) {
    cat(sprintf("%s\t\tERROR: %s\n", est, substr(e$message, 1, 30)))
  })
}
cat("\n")

# Primary REML model
model_reml <- rma(yi, vi, data = sglt2_es, method = "REML")

cat("1.3 REML Model (Primary Reference)\n")
cat(sprintf("  Pooled log(OR): %.6f\n", as.numeric(model_reml$beta)))
cat(sprintf("  SE: %.6f\n", model_reml$se))
cat(sprintf("  95%% CI: [%.6f, %.6f]\n", model_reml$ci.lb, model_reml$ci.ub))
cat(sprintf("  z-value: %.6f\n", model_reml$zval))
cat(sprintf("  p-value: %.6f\n", model_reml$pval))
cat(sprintf("  tau²: %.6f\n", model_reml$tau2))
cat(sprintf("  tau: %.6f\n", sqrt(model_reml$tau2)))
cat(sprintf("  I²: %.4f%%\n", model_reml$I2))
cat(sprintf("  H²: %.4f\n", model_reml$H2))
cat(sprintf("  Q: %.6f\n", model_reml$QE))
cat(sprintf("  Q df: %d\n", model_reml$k - 1))
cat(sprintf("  Q p-value: %.6f\n", model_reml$QEp))
cat("\n")

cat("1.4 Odds Ratio Scale\n")
cat(sprintf("  OR: %.6f\n", exp(as.numeric(model_reml$beta))))
cat(sprintf("  OR 95%% CI: [%.6f, %.6f]\n", exp(model_reml$ci.lb), exp(model_reml$ci.ub)))
cat("\n")

# HKSJ
model_hksj <- rma(yi, vi, data = sglt2_es, method = "REML", test = "knha")
cat("1.5 HKSJ-Adjusted Confidence Interval\n")
cat(sprintf("  HKSJ CI: [%.6f, %.6f]\n", model_hksj$ci.lb, model_hksj$ci.ub))
cat(sprintf("  OR HKSJ CI: [%.6f, %.6f]\n", exp(model_hksj$ci.lb), exp(model_hksj$ci.ub)))
cat(sprintf("  HKSJ t-value: %.6f\n", model_hksj$zval))
cat(sprintf("  HKSJ df: %d\n", model_hksj$dfs))
cat(sprintf("  HKSJ p-value: %.6f\n", model_hksj$pval))
cat("\n")

# Prediction interval
pi <- predict(model_reml)
cat("1.6 Prediction Interval\n")
cat(sprintf("  PI: [%.6f, %.6f]\n", pi$pi.lb, pi$pi.ub))
cat(sprintf("  OR PI: [%.6f, %.6f]\n", exp(pi$pi.lb), exp(pi$pi.ub)))
cat("\n")

# Publication bias
egger <- regtest(model_reml, model = "lm")
cat("1.7 Publication Bias - Egger's Test\n")
cat(sprintf("  Intercept: %.6f\n", egger$est))
cat(sprintf("  z-value: %.6f\n", egger$zval))
cat(sprintf("  p-value: %.6f\n", egger$pval))
cat("\n")

begg <- ranktest(model_reml)
cat("1.8 Publication Bias - Begg's Test\n")
cat(sprintf("  Kendall's tau: %.6f\n", begg$tau))
cat(sprintf("  p-value: %.6f\n", begg$pval))
cat("\n")

tf <- trimfill(model_reml)
cat("1.9 Trim-and-Fill\n")
cat(sprintf("  Imputed studies (k0): %d\n", tf$k0))
cat(sprintf("  Adjusted estimate: %.6f\n", as.numeric(tf$beta)))
cat(sprintf("  Adjusted OR: %.6f\n", exp(as.numeric(tf$beta))))
cat("\n")

# Leave-one-out
loo_results <- leave1out(model_reml)
cat("1.10 Leave-One-Out Analysis\n")
cat("Study\t\t\t\tEstimate\tSE\t\ttau²\n")
for (i in 1:length(loo_results$estimate)) {
  cat(sprintf("%s\t%.6f\t%.6f\t%.6f\n",
              sglt2_acm$study[i], loo_results$estimate[i],
              loo_results$se[i], loo_results$tau2[i]))
}
cat("\n")

################################################################################
# DATASET 2: BCG VACCINE (6 studies - TruthCert-PairwisePro subset)
################################################################################

cat(paste(rep("-", 70), collapse=""), "\n")
cat("DATASET 2: BCG Vaccine for TB Prevention (k=6)\n")
cat("Source: Colditz et al. (1994), JAMA - TruthCert subset\n")
cat(paste(rep("-", 70), collapse=""), "\n\n")

# Exact data from TruthCert-PairwisePro BCG dataset
bcg <- data.frame(
  study = c("Aronson 1948", "Ferguson 1949", "Rosenthal 1960",
            "Hart 1977", "Frimodt-Moller 1973", "Comstock 1974"),
  events_t = c(4, 6, 3, 62, 33, 180),
  n_t = c(123, 306, 231, 13598, 5069, 16913),
  events_c = c(11, 29, 11, 248, 47, 372),
  n_c = c(139, 303, 220, 12867, 5808, 17854)
)

bcg_es <- escalc(measure = "OR",
                 ai = bcg$events_t, bi = bcg$n_t - bcg$events_t,
                 ci = bcg$events_c, di = bcg$n_c - bcg$events_c)

cat("2.1 Effect Sizes (Log Odds Ratio)\n")
cat("Study\t\t\tyi (log OR)\tvi (variance)\n")
for (i in 1:nrow(bcg_es)) {
  cat(sprintf("%s\t%.6f\t%.6f\n",
              bcg$study[i], bcg_es$yi[i], bcg_es$vi[i]))
}
cat("\n")

model_bcg <- rma(yi, vi, data = bcg_es, method = "REML")
cat("2.2 REML Results\n")
cat(sprintf("  Pooled log(OR): %.6f\n", as.numeric(model_bcg$beta)))
cat(sprintf("  SE: %.6f\n", model_bcg$se))
cat(sprintf("  OR: %.6f [%.6f, %.6f]\n",
            exp(as.numeric(model_bcg$beta)), exp(model_bcg$ci.lb), exp(model_bcg$ci.ub)))
cat(sprintf("  tau²: %.6f\n", model_bcg$tau2))
cat(sprintf("  I²: %.4f%%\n", model_bcg$I2))
cat(sprintf("  Q: %.6f (df=%d, p=%.6f)\n", model_bcg$QE, model_bcg$k-1, model_bcg$QEp))
cat("\n")

# All tau² estimators for BCG
cat("2.3 All tau² Estimators (BCG)\n")
for (est in estimators) {
  tryCatch({
    m <- rma(yi, vi, data = bcg_es, method = est)
    cat(sprintf("  %s: tau² = %.6f, pooled = %.6f\n", est, m$tau2, as.numeric(m$beta)))
  }, error = function(e) {})
}
cat("\n")

################################################################################
# DATASET 3: CONTINUOUS DATA (Blood Pressure)
################################################################################

cat(paste(rep("-", 70), collapse=""), "\n")
cat("DATASET 3: Blood Pressure Reduction (Continuous, k=5)\n")
cat(paste(rep("-", 70), collapse=""), "\n\n")

bp_data <- data.frame(
  study = c("Trial A 2018", "Trial B 2019", "Trial C 2020", "Trial D 2021", "Trial E 2022"),
  mean_t = c(-12.5, -10.8, -14.2, -11.3, -9.5),
  sd_t = c(8.2, 9.1, 7.5, 8.8, 10.2),
  n_t = c(150, 200, 180, 120, 95),
  mean_c = c(-4.2, -3.5, -5.1, -4.8, -2.8),
  sd_c = c(7.8, 8.5, 8.0, 7.2, 9.8),
  n_c = c(148, 205, 175, 118, 100)
)

# Mean difference
bp_md <- escalc(measure = "MD",
                m1i = bp_data$mean_t, sd1i = bp_data$sd_t, n1i = bp_data$n_t,
                m2i = bp_data$mean_c, sd2i = bp_data$sd_c, n2i = bp_data$n_c)

cat("3.1 Mean Difference\n")
cat("Study\t\tMD\t\tVariance\n")
for (i in 1:nrow(bp_md)) {
  cat(sprintf("%s\t%.6f\t%.6f\n", bp_data$study[i], bp_md$yi[i], bp_md$vi[i]))
}
cat("\n")

model_md <- rma(yi, vi, data = bp_md, method = "REML")
cat("3.2 Pooled MD (REML)\n")
cat(sprintf("  Pooled MD: %.6f (SE: %.6f)\n", as.numeric(model_md$beta), model_md$se))
cat(sprintf("  95%% CI: [%.6f, %.6f]\n", model_md$ci.lb, model_md$ci.ub))
cat(sprintf("  tau²: %.6f\n", model_md$tau2))
cat(sprintf("  I²: %.4f%%\n", model_md$I2))
cat("\n")

# SMD (Hedges' g)
bp_smd <- escalc(measure = "SMD",
                 m1i = bp_data$mean_t, sd1i = bp_data$sd_t, n1i = bp_data$n_t,
                 m2i = bp_data$mean_c, sd2i = bp_data$sd_c, n2i = bp_data$n_c)

cat("3.3 Standardized Mean Difference (Hedges' g)\n")
cat("Study\t\tg\t\tVariance\n")
for (i in 1:nrow(bp_smd)) {
  cat(sprintf("%s\t%.6f\t%.6f\n", bp_data$study[i], bp_smd$yi[i], bp_smd$vi[i]))
}
cat("\n")

model_smd <- rma(yi, vi, data = bp_smd, method = "REML")
cat("3.4 Pooled SMD (REML)\n")
cat(sprintf("  Pooled g: %.6f (SE: %.6f)\n", as.numeric(model_smd$beta), model_smd$se))
cat(sprintf("  95%% CI: [%.6f, %.6f]\n", model_smd$ci.lb, model_smd$ci.ub))
cat(sprintf("  tau²: %.6f\n", model_smd$tau2))
cat(sprintf("  I²: %.4f%%\n", model_smd$I2))
cat("\n")

################################################################################
# SUMMARY TABLE FOR VALIDATION
################################################################################

cat(paste(rep("=", 70), collapse=""), "\n")
cat("SUMMARY: KEY REFERENCE VALUES FOR JavaScript VALIDATION\n")
cat(paste(rep("=", 70), collapse=""), "\n\n")

cat("SGLT2_ACM Dataset (k=5, REML):\n")
cat(sprintf("  yi[1] = %.6f, vi[1] = %.6f\n", sglt2_es$yi[1], sglt2_es$vi[1]))
cat(sprintf("  yi[2] = %.6f, vi[2] = %.6f\n", sglt2_es$yi[2], sglt2_es$vi[2]))
cat(sprintf("  yi[3] = %.6f, vi[3] = %.6f\n", sglt2_es$yi[3], sglt2_es$vi[3]))
cat(sprintf("  yi[4] = %.6f, vi[4] = %.6f\n", sglt2_es$yi[4], sglt2_es$vi[4]))
cat(sprintf("  yi[5] = %.6f, vi[5] = %.6f\n", sglt2_es$yi[5], sglt2_es$vi[5]))
cat(sprintf("  Pooled log(OR) = %.6f\n", as.numeric(model_reml$beta)))
cat(sprintf("  SE = %.6f\n", model_reml$se))
cat(sprintf("  OR = %.6f\n", exp(as.numeric(model_reml$beta))))
cat(sprintf("  tau² = %.6f\n", model_reml$tau2))
cat(sprintf("  I² = %.4f%%\n", model_reml$I2))
cat(sprintf("  Q = %.6f\n", model_reml$QE))
cat(sprintf("  HKSJ CI = [%.6f, %.6f]\n", model_hksj$ci.lb, model_hksj$ci.ub))
cat(sprintf("  PI = [%.6f, %.6f]\n", pi$pi.lb, pi$pi.ub))
cat("\n")

cat("tau² Estimator Values (SGLT2_ACM):\n")
for (est in estimators) {
  tryCatch({
    m <- rma(yi, vi, data = sglt2_es, method = est)
    cat(sprintf("  %s = %.6f\n", est, m$tau2))
  }, error = function(e) {})
}
cat("\n")

cat("BCG Dataset (k=6, REML):\n")
cat(sprintf("  Pooled log(OR) = %.6f\n", as.numeric(model_bcg$beta)))
cat(sprintf("  OR = %.6f\n", exp(as.numeric(model_bcg$beta))))
cat(sprintf("  tau² = %.6f\n", model_bcg$tau2))
cat(sprintf("  I² = %.4f%%\n", model_bcg$I2))
cat("\n")

cat("BP_REDUCTION Dataset (k=5, MD):\n")
cat(sprintf("  Pooled MD = %.6f\n", as.numeric(model_md$beta)))
cat(sprintf("  tau² = %.6f\n", model_md$tau2))
cat(sprintf("  I² = %.4f%%\n", model_md$I2))
cat("\n")

cat("BP_REDUCTION Dataset (k=5, SMD/Hedges' g):\n")
cat(sprintf("  Pooled g = %.6f\n", as.numeric(model_smd$beta)))
cat(sprintf("  tau² = %.6f\n", model_smd$tau2))
cat(sprintf("  I² = %.4f%%\n", model_smd$I2))
cat("\n")

cat(paste(rep("=", 70), collapse=""), "\n")
cat("END OF R REFERENCE VALUES\n")
cat(paste(rep("=", 70), collapse=""), "\n")

sink()
cat("\nReference values saved to:", output_file, "\n")
