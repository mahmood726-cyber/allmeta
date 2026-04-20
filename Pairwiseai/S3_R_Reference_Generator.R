################################################################################
# TruthCert-PairwisePro R Reference Values Generator
# Supplement S3 for Research Synthesis Methods Paper
#
# This script generates authoritative reference values from R metafor package
# for validating TruthCert-PairwisePro's statistical calculations
################################################################################

# Required packages
library(metafor)
library(meta)
library(metadat)

# Output file
output_file <- "C:/Truthcert1/S3_R_Reference_Values_Paper.txt"
sink(output_file)

cat(paste(rep("=", 70), collapse=""), "\n")
cat("TruthCert-PairwisePro R Reference Values\n")
cat("For Research Synthesis Methods Paper Supplement\n")
cat(paste(rep("=", 70), collapse=""), "\n\n")
cat("Generated:", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n")
cat("R Version:", R.version.string, "\n")
cat("metafor Version:", as.character(packageVersion("metafor")), "\n")
cat("meta Version:", as.character(packageVersion("meta")), "\n\n")

################################################################################
# SECTION 1: BCG VACCINE DATASET (k=13)
# Classic benchmark dataset from Colditz et al. (1994)
################################################################################

cat(paste(rep("-", 70), collapse=""), "\n")
cat("SECTION 1: BCG VACCINE DATASET (k=13)\n")
cat("Reference: Colditz et al. (1994) JAMA\n")
cat(paste(rep("-", 70), collapse=""), "\n\n")

# Load BCG data
data(dat.bcg)
bcg <- dat.bcg

# Calculate effect sizes (log odds ratio)
bcg_es <- escalc(measure = "OR",
                 ai = tpos, bi = tneg,
                 ci = cpos, di = cneg,
                 data = bcg)

cat("1.1 Effect Size Calculations (Log Odds Ratio)\n")
cat("Study\tyi (log OR)\tvi (variance)\tSE\n")
for (i in 1:nrow(bcg_es)) {
  cat(sprintf("%d\t%.6f\t%.6f\t%.6f\n",
              i, bcg_es$yi[i], bcg_es$vi[i], sqrt(bcg_es$vi[i])))
}
cat("\n")

# 1.2 Random Effects Models with Different tau² Estimators
cat("1.2 Random Effects Models - All tau² Estimators\n\n")

estimators <- c("DL", "REML", "ML", "PM", "HS", "SJ", "HE", "EB", "GENQ")
tau2_results <- data.frame(
  Estimator = character(),
  tau2 = numeric(),
  I2 = numeric(),
  pooled_est = numeric(),
  pooled_se = numeric(),
  stringsAsFactors = FALSE
)

for (est in estimators) {
  tryCatch({
    model <- rma(yi, vi, data = bcg_es, method = est)
    tau2_results <- rbind(tau2_results, data.frame(
      Estimator = est,
      tau2 = model$tau2,
      I2 = model$I2,
      pooled_est = as.numeric(model$beta),
      pooled_se = model$se
    ))
  }, error = function(e) {
    cat(sprintf("Note: %s estimator error: %s\n", est, e$message))
  })
}

cat("Estimator\ttau²\t\tI²\t\tPooled Est\tSE\n")
for (i in 1:nrow(tau2_results)) {
  cat(sprintf("%s\t\t%.6f\t%.4f%%\t%.6f\t%.6f\n",
              tau2_results$Estimator[i],
              tau2_results$tau2[i],
              tau2_results$I2[i],
              tau2_results$pooled_est[i],
              tau2_results$pooled_se[i]))
}
cat("\n")

# Primary model (REML) for detailed output
model_reml <- rma(yi, vi, data = bcg_es, method = "REML")

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

# On OR scale
cat("1.4 Odds Ratio Scale\n")
cat(sprintf("  OR: %.6f\n", exp(as.numeric(model_reml$beta))))
cat(sprintf("  OR 95%% CI: [%.6f, %.6f]\n", exp(model_reml$ci.lb), exp(model_reml$ci.ub)))
cat("\n")

# 1.5 HKSJ Adjustment
model_hksj <- rma(yi, vi, data = bcg_es, method = "REML", test = "knha")
cat("1.5 HKSJ-Adjusted Confidence Interval\n")
cat(sprintf("  HKSJ CI: [%.6f, %.6f]\n", model_hksj$ci.lb, model_hksj$ci.ub))
cat(sprintf("  HKSJ t-value: %.6f\n", model_hksj$zval))
cat(sprintf("  HKSJ df: %d\n", model_hksj$dfs))
cat(sprintf("  HKSJ p-value: %.6f\n", model_hksj$pval))
cat(sprintf("  OR HKSJ CI: [%.6f, %.6f]\n", exp(model_hksj$ci.lb), exp(model_hksj$ci.ub)))
cat("\n")

# 1.6 Prediction Interval
pi <- predict(model_reml)
cat("1.6 Prediction Interval\n")
cat(sprintf("  PI: [%.6f, %.6f]\n", pi$pi.lb, pi$pi.ub))
cat(sprintf("  OR PI: [%.6f, %.6f]\n", exp(pi$pi.lb), exp(pi$pi.ub)))
cat("\n")

# 1.7 tau² Confidence Interval (Q-Profile)
tau2_ci <- confint(model_reml)
cat("1.7 tau² Confidence Interval (Q-Profile Method)\n")
cat(sprintf("  tau² CI: [%.6f, %.6f]\n", tau2_ci$random[1,2], tau2_ci$random[1,3]))
cat("\n")

################################################################################
# SECTION 2: PUBLICATION BIAS TESTS
################################################################################

cat(paste(rep("-", 70), collapse=""), "\n")
cat("SECTION 2: PUBLICATION BIAS TESTS (BCG Dataset)\n")
cat(paste(rep("-", 70), collapse=""), "\n\n")

# Egger's test
egger <- regtest(model_reml, model = "lm")
cat("2.1 Egger's Regression Test\n")
cat(sprintf("  Intercept: %.6f\n", egger$est))
cat(sprintf("  SE: %.6f\n", egger$se))
cat(sprintf("  z-value: %.6f\n", egger$zval))
cat(sprintf("  p-value: %.6f\n", egger$pval))
cat("\n")

# Begg's test
begg <- ranktest(model_reml)
cat("2.2 Begg's Rank Correlation Test\n")
cat(sprintf("  Kendall's tau: %.6f\n", begg$tau))
cat(sprintf("  p-value: %.6f\n", begg$pval))
cat("\n")

# Trim-and-fill
tf <- trimfill(model_reml)
cat("2.3 Trim-and-Fill Analysis\n")
cat(sprintf("  Imputed studies (k0): %d\n", tf$k0))
cat(sprintf("  Adjusted estimate: %.6f\n", as.numeric(tf$beta)))
cat(sprintf("  Adjusted SE: %.6f\n", tf$se))
cat(sprintf("  Adjusted OR: %.6f\n", exp(as.numeric(tf$beta))))
cat("\n")

# Fail-safe N (Rosenthal)
fsn <- fsn(yi, vi, data = bcg_es, type = "Rosenthal")
cat("2.4 Fail-Safe N (Rosenthal)\n")
cat(sprintf("  Fail-safe N: %d\n", fsn$fsnum))
cat(sprintf("  p-value: %.6f\n", fsn$pval))
cat("\n")

################################################################################
# SECTION 3: SENSITIVITY ANALYSIS
################################################################################

cat(paste(rep("-", 70), collapse=""), "\n")
cat("SECTION 3: SENSITIVITY ANALYSIS (BCG Dataset)\n")
cat(paste(rep("-", 70), collapse=""), "\n\n")

# Leave-one-out
loo_results <- leave1out(model_reml)
cat("3.1 Leave-One-Out Analysis\n")
cat("Study\tEstimate\tSE\t\ttau²\t\tI²\n")
for (i in 1:length(loo_results$estimate)) {
  cat(sprintf("%d\t%.6f\t%.6f\t%.6f\t%.4f%%\n",
              i, loo_results$estimate[i], loo_results$se[i],
              loo_results$tau2[i], loo_results$I2[i]))
}
cat("\n")

# Influence diagnostics
inf <- influence(model_reml)
cat("3.2 Influence Diagnostics\n")
cat("Study\trstudent\tdfbetas\t\tcook.d\t\that\n")
for (i in 1:nrow(bcg_es)) {
  cat(sprintf("%d\t%.6f\t%.6f\t%.6f\t%.6f\n",
              i, inf$inf$rstudent[i], inf$inf$dfbetas[i],
              inf$inf$cook.d[i], inf$inf$hat[i]))
}
cat("\n")

################################################################################
# SECTION 4: META-REGRESSION
################################################################################

cat(paste(rep("-", 70), collapse=""), "\n")
cat("SECTION 4: META-REGRESSION (BCG Dataset - Latitude)\n")
cat(paste(rep("-", 70), collapse=""), "\n\n")

# Add latitude as moderator
bcg_es$ablat <- bcg$ablat

model_reg <- rma(yi, vi, mods = ~ ablat, data = bcg_es, method = "REML")
cat("4.1 Meta-Regression: Effect of Latitude\n")
cat(sprintf("  Intercept: %.6f (SE: %.6f, p=%.6f)\n",
            model_reg$beta[1], model_reg$se[1], model_reg$pval[1]))
cat(sprintf("  Latitude slope: %.6f (SE: %.6f, p=%.6f)\n",
            model_reg$beta[2], model_reg$se[2], model_reg$pval[2]))
cat(sprintf("  R²: %.4f%%\n", model_reg$R2))
cat(sprintf("  QM: %.6f (p=%.6f)\n", model_reg$QM, model_reg$QMp))
cat(sprintf("  Residual tau²: %.6f\n", model_reg$tau2))
cat("\n")

################################################################################
# SECTION 5: EFFECT SIZE CALCULATIONS - OTHER TYPES
################################################################################

cat(paste(rep("-", 70), collapse=""), "\n")
cat("SECTION 5: OTHER EFFECT SIZE CALCULATIONS\n")
cat(paste(rep("-", 70), collapse=""), "\n\n")

# 5.1 Risk Ratio
cat("5.1 Risk Ratio (BCG Dataset)\n")
bcg_rr <- escalc(measure = "RR",
                 ai = tpos, bi = tneg,
                 ci = cpos, di = cneg,
                 data = bcg)
model_rr <- rma(yi, vi, data = bcg_rr, method = "REML")
cat(sprintf("  Pooled log(RR): %.6f\n", as.numeric(model_rr$beta)))
cat(sprintf("  Pooled RR: %.6f\n", exp(as.numeric(model_rr$beta))))
cat(sprintf("  95%% CI: [%.6f, %.6f]\n", exp(model_rr$ci.lb), exp(model_rr$ci.ub)))
cat("\n")

# 5.2 Risk Difference
cat("5.2 Risk Difference (BCG Dataset)\n")
bcg_rd <- escalc(measure = "RD",
                 ai = tpos, bi = tneg,
                 ci = cpos, di = cneg,
                 data = bcg)
model_rd <- rma(yi, vi, data = bcg_rd, method = "REML")
cat(sprintf("  Pooled RD: %.6f\n", as.numeric(model_rd$beta)))
cat(sprintf("  95%% CI: [%.6f, %.6f]\n", model_rd$ci.lb, model_rd$ci.ub))
cat("\n")

# 5.3 SMD (Hedges' g) - using example data
cat("5.3 Standardized Mean Difference (Hedges' g)\n")
# Example: two-group continuous data
n1 <- 50; m1 <- 25.5; sd1 <- 8.2
n2 <- 48; m2 <- 30.2; sd2 <- 7.8
smd <- escalc(measure = "SMD", n1i = n1, n2i = n2,
              m1i = m1, m2i = m2, sd1i = sd1, sd2i = sd2)
cat(sprintf("  Hedges' g: %.6f\n", smd$yi))
cat(sprintf("  Variance: %.6f\n", smd$vi))
cat(sprintf("  SE: %.6f\n", sqrt(smd$vi)))
cat("\n")

# 5.4 Correlation (Fisher's z)
cat("5.4 Correlation Coefficients (Fisher's z transformation)\n")
cors <- data.frame(
  r = c(0.35, 0.42, 0.28, 0.51, 0.39),
  n = c(85, 120, 95, 75, 110)
)
cor_es <- escalc(measure = "ZCOR", ri = cors$r, ni = cors$n)
cat("Study\tr\tFisher z\tVariance\n")
for (i in 1:nrow(cor_es)) {
  cat(sprintf("%d\t%.2f\t%.6f\t%.6f\n", i, cors$r[i], cor_es$yi[i], cor_es$vi[i]))
}
model_cor <- rma(yi, vi, data = cor_es, method = "REML")
pooled_r <- (exp(2*model_cor$beta) - 1) / (exp(2*model_cor$beta) + 1)
cat(sprintf("\n  Pooled Fisher z: %.6f\n", as.numeric(model_cor$beta)))
cat(sprintf("  Pooled r (back-transformed): %.6f\n", pooled_r))
cat("\n")

# 5.5 Proportion (Freeman-Tukey)
cat("5.5 Proportions (Freeman-Tukey Double Arcsine)\n")
props <- data.frame(
  events = c(15, 18, 10, 20, 12),
  n = c(100, 120, 95, 130, 85)
)
prop_es <- escalc(measure = "PFT", xi = props$events, ni = props$n)
cat("Study\tProportion\tFT\t\tVariance\n")
for (i in 1:nrow(prop_es)) {
  cat(sprintf("%d\t%.4f\t\t%.6f\t%.6f\n",
              i, props$events[i]/props$n[i], prop_es$yi[i], prop_es$vi[i]))
}
cat("\n")

################################################################################
# SECTION 6: THREE-LEVEL MODEL (if applicable)
################################################################################

cat(paste(rep("-", 70), collapse=""), "\n")
cat("SECTION 6: THREE-LEVEL MODEL VALIDATION\n")
cat(paste(rep("-", 70), collapse=""), "\n\n")

# Create example with multiple effects per study
set.seed(12345)
three_level_data <- data.frame(
  study = rep(1:5, each = 3),
  effect = 1:15,
  yi = c(-0.5, -0.6, -0.4,   # Study 1
         -0.3, -0.2, -0.4,   # Study 2
         -0.7, -0.8, -0.6,   # Study 3
         -0.4, -0.5, -0.3,   # Study 4
         -0.6, -0.5, -0.7),  # Study 5
  vi = rep(0.05, 15)
)

cat("6.1 Example Data (5 studies, 3 effects each)\n")
cat("Study\tEffect\tyi\t\tvi\n")
for (i in 1:nrow(three_level_data)) {
  cat(sprintf("%d\t%d\t%.6f\t%.6f\n",
              three_level_data$study[i],
              three_level_data$effect[i],
              three_level_data$yi[i],
              three_level_data$vi[i]))
}
cat("\n")

# Three-level model
model_3level <- rma.mv(yi, vi,
                       random = ~ 1 | study/effect,
                       data = three_level_data)

cat("6.2 Three-Level Model Results\n")
cat(sprintf("  Pooled estimate: %.6f\n", as.numeric(model_3level$beta)))
cat(sprintf("  SE: %.6f\n", model_3level$se))
cat(sprintf("  95%% CI: [%.6f, %.6f]\n", model_3level$ci.lb, model_3level$ci.ub))
cat(sprintf("  sigma²_between (Level 3): %.6f\n", model_3level$sigma2[1]))
cat(sprintf("  sigma²_within (Level 2): %.6f\n", model_3level$sigma2[2]))
total_var <- model_3level$sigma2[1] + model_3level$sigma2[2]
icc <- model_3level$sigma2[1] / total_var
cat(sprintf("  Total heterogeneity: %.6f\n", total_var))
cat(sprintf("  ICC: %.6f\n", icc))
cat("\n")

################################################################################
# SECTION 7: GOSH ANALYSIS
################################################################################

cat(paste(rep("-", 70), collapse=""), "\n")
cat("SECTION 7: GOSH ANALYSIS (BCG Dataset)\n")
cat(paste(rep("-", 70), collapse=""), "\n\n")

# Run GOSH with sampling (full 2^13-1 = 8191 combinations)
set.seed(42)
gosh_res <- gosh(model_reml, subsets = 1000, progbar = FALSE)

cat("7.1 GOSH Analysis Summary (1000 random subsets)\n")
cat(sprintf("  Number of subsets: %d\n", nrow(gosh_res$res)))
cat(sprintf("  Mean estimate: %.6f\n", mean(gosh_res$res$estimate)))
cat(sprintf("  SD estimate: %.6f\n", sd(gosh_res$res$estimate)))
cat(sprintf("  Min estimate: %.6f\n", min(gosh_res$res$estimate)))
cat(sprintf("  Max estimate: %.6f\n", max(gosh_res$res$estimate)))
cat(sprintf("  Mean I²: %.4f%%\n", mean(gosh_res$res$I2)))
cat(sprintf("  Mean tau²: %.6f\n", mean(gosh_res$res$tau2)))
cat("\n")

################################################################################
# SECTION 8: ROBUST VARIANCE ESTIMATION
################################################################################

cat(paste(rep("-", 70), collapse=""), "\n")
cat("SECTION 8: ROBUST VARIANCE ESTIMATION\n")
cat(paste(rep("-", 70), collapse=""), "\n\n")

# Using clubSandwich for RVE
library(clubSandwich)

# RVE on three-level data
rve_vcov <- vcovCR(model_3level, type = "CR2")
rve_test <- coef_test(model_3level, vcov = rve_vcov)

cat("8.1 RVE Results (CR2 Small-Sample Correction)\n")
cat(sprintf("  Estimate: %.6f\n", as.numeric(model_3level$beta)))
cat(sprintf("  RVE SE: %.6f\n", rve_test$SE))
cat(sprintf("  RVE df (Satterthwaite): %.2f\n", rve_test$df))
cat(sprintf("  t-value: %.6f\n", rve_test$tstat))
cat(sprintf("  p-value: %.6f\n", rve_test$p_Satt))
cat("\n")

################################################################################
# SUMMARY REFERENCE TABLE
################################################################################

cat(paste(rep("=", 70), collapse=""), "\n")
cat("SUMMARY REFERENCE TABLE FOR VALIDATION\n")
cat(paste(rep("=", 70), collapse=""), "\n\n")

cat("BCG Dataset (k=13) REML Results:\n")
cat(sprintf("  log(OR) = %.6f (SE = %.6f)\n", as.numeric(model_reml$beta), model_reml$se))
cat(sprintf("  OR = %.6f [%.6f, %.6f]\n",
            exp(as.numeric(model_reml$beta)), exp(model_reml$ci.lb), exp(model_reml$ci.ub)))
cat(sprintf("  tau² = %.6f\n", model_reml$tau2))
cat(sprintf("  I² = %.2f%%\n", model_reml$I2))
cat(sprintf("  Q = %.4f (df=%d, p=%.6f)\n", model_reml$QE, model_reml$k-1, model_reml$QEp))
cat("\n")

cat("HKSJ Adjustment:\n")
cat(sprintf("  log(OR) HKSJ CI = [%.6f, %.6f]\n", model_hksj$ci.lb, model_hksj$ci.ub))
cat(sprintf("  OR HKSJ CI = [%.6f, %.6f]\n", exp(model_hksj$ci.lb), exp(model_hksj$ci.ub)))
cat("\n")

cat("Prediction Interval:\n")
cat(sprintf("  log(OR) PI = [%.6f, %.6f]\n", pi$pi.lb, pi$pi.ub))
cat(sprintf("  OR PI = [%.6f, %.6f]\n", exp(pi$pi.lb), exp(pi$pi.ub)))
cat("\n")

cat("tau² Estimators (BCG Dataset):\n")
for (i in 1:nrow(tau2_results)) {
  cat(sprintf("  %s: tau² = %.6f\n", tau2_results$Estimator[i], tau2_results$tau2[i]))
}
cat("\n")

cat("Publication Bias:\n")
cat(sprintf("  Egger p-value = %.6f\n", egger$pval))
cat(sprintf("  Begg p-value = %.6f\n", begg$pval))
cat(sprintf("  Trim-fill k0 = %d\n", tf$k0))
cat("\n")

cat(paste(rep("=", 70), collapse=""), "\n")
cat("END OF R REFERENCE VALUES\n")
cat(paste(rep("=", 70), collapse=""), "\n")

sink()
cat("\nReference values saved to:", output_file, "\n")
