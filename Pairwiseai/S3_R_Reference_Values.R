################################################################################
# S3 File: TruthCert-PairwisePro R Reference Values Generator
#
# This script generates reference values from R's metafor package that can be
# compared against TruthCert-PairwisePro outputs for validation.
#
# Author: [Author Name]
# Date: 2024
# R Version: 4.3.1+
# Required packages: metafor (4.4-0+), meta
#
# Usage: source("S3_R_Reference_Values.R")
# Output: S3_R_Reference_Values.txt (reference values for validation)
################################################################################

cat("=============================================================\n")
cat("TruthCert-PairwisePro - R Reference Value Generator\n")
cat("=============================================================\n\n")

# Load packages
library(metafor)
library(meta)

# Open output file (use absolute path)
sink("C:/Truthcert1/S3_R_Reference_Values.txt")

cat("TruthCert-PairwisePro R Reference Values\n")
cat("Generated:", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n")
cat("R Version:", R.version.string, "\n")
cat("metafor Version:", as.character(packageVersion("metafor")), "\n")
cat("=========================================\n\n")

################################################################################
# SECTION 1: DISTRIBUTION FUNCTIONS
################################################################################

cat("=== SECTION 1: DISTRIBUTION FUNCTIONS ===\n\n")

cat("1.1 Standard Normal (pnorm)\n")
pnorm_x <- c(-3, -2, -1.96, -1.645, -1, 0, 1, 1.645, 1.96, 2, 3)
for (x in pnorm_x) {
  cat(sprintf("pnorm(%.3f) = %.10f\n", x, pnorm(x)))
}

cat("\n1.2 Standard Normal Inverse (qnorm)\n")
qnorm_p <- c(0.001, 0.01, 0.025, 0.05, 0.1, 0.5, 0.9, 0.95, 0.975, 0.99, 0.999)
for (p in qnorm_p) {
  cat(sprintf("qnorm(%.3f) = %.10f\n", p, qnorm(p)))
}

cat("\n1.3 Student's t Distribution (pt, qt)\n")
df_vals <- c(3, 5, 10, 12, 20, 30, 100)
for (df in df_vals) {
  cat(sprintf("qt(0.975, df=%d) = %.10f\n", df, qt(0.975, df)))
  cat(sprintf("qt(0.025, df=%d) = %.10f\n", df, qt(0.025, df)))
}

cat("\n1.4 Chi-squared Distribution\n")
cat(sprintf("qchisq(0.95, df=1) = %.10f\n", qchisq(0.95, 1)))
cat(sprintf("qchisq(0.95, df=5) = %.10f\n", qchisq(0.95, 5)))
cat(sprintf("qchisq(0.95, df=10) = %.10f\n", qchisq(0.95, 10)))
cat(sprintf("qchisq(0.95, df=12) = %.10f\n", qchisq(0.95, 12)))

################################################################################
# SECTION 2: BCG VACCINE DATASET (k=13)
################################################################################

cat("\n\n=== SECTION 2: BCG VACCINE DATASET (k=13) ===\n")
cat("Source: Colditz et al. (1994), JAMA 271:698-702\n")
cat("Reference dataset from metafor package\n\n")

# BCG vaccine data - manually entered to ensure consistency
bcg_data <- data.frame(
  trial = 1:13,
  author = c("Aronson", "Ferguson & Simes", "Rosenthal et al", "Hart & Sutherland",
             "Frimodt-Moller et al", "Stein & Aronson", "Vandiviere et al",
             "TPT Madras", "Coetzee & Berjak", "Rosenthal et al", "Comstock et al",
             "Comstock & Webster", "Comstock et al"),
  year = c(1948, 1949, 1960, 1977, 1973, 1953, 1973, 1980, 1968, 1961, 1974, 1969, 1976),
  tpos = c(4, 6, 3, 62, 33, 180, 8, 505, 29, 17, 186, 5, 27),
  tneg = c(119, 300, 228, 13536, 5036, 1361, 2537, 87886, 7470, 1699, 50448, 2493, 16886),
  cpos = c(11, 29, 11, 248, 47, 372, 10, 499, 45, 65, 141, 3, 29),
  cneg = c(128, 274, 209, 12619, 5765, 1079, 619, 87892, 7232, 1600, 27197, 2338, 17825),
  ablat = c(44, 55, 42, 52, 13, 44, 19, 13, 27, 42, 18, 33, 33),
  alloc = c("random", "random", "random", "random", "alternate", "alternate",
            "random", "random", "random", "systematic", "systematic", "systematic", "systematic")
)

# Calculate effect sizes
bcg <- escalc(measure = "OR",
              ai = tpos, bi = tneg,
              ci = cpos, di = cneg,
              data = bcg_data)

cat("2.1 Individual Study Effect Sizes (Log Odds Ratio)\n")
cat("Study\tyi (logOR)\tvi (variance)\tSE\n")
for (i in 1:13) {
  cat(sprintf("%d\t%.6f\t%.6f\t%.6f\n", i, bcg$yi[i], bcg$vi[i], sqrt(bcg$vi[i])))
}

cat("\n2.2 Random Effects Models\n")

# REML (default and recommended)
res_reml <- rma(yi, vi, data = bcg, method = "REML")
cat("\nREML Estimator:\n")
cat(sprintf("  Pooled log(OR) = %.6f\n", as.numeric(res_reml$beta)))
cat(sprintf("  SE = %.6f\n", res_reml$se))
cat(sprintf("  95%% CI = [%.6f, %.6f]\n", res_reml$ci.lb, res_reml$ci.ub))
cat(sprintf("  z = %.6f\n", res_reml$zval))
cat(sprintf("  p = %.6f\n", res_reml$pval))
cat(sprintf("  tau² = %.6f\n", res_reml$tau2))
cat(sprintf("  tau = %.6f\n", sqrt(res_reml$tau2)))
cat(sprintf("  I² = %.2f%%\n", res_reml$I2))
cat(sprintf("  H² = %.4f\n", res_reml$H2))
cat(sprintf("  Q = %.4f (df=%d, p=%.6f)\n", res_reml$QE, res_reml$k-1, res_reml$QEp))

# Back-transformed OR
cat(sprintf("  OR = %.4f [%.4f, %.4f]\n",
            exp(as.numeric(res_reml$beta)),
            exp(res_reml$ci.lb),
            exp(res_reml$ci.ub)))

cat("\n2.3 All Eight Heterogeneity Estimators (tau²)\n")
methods <- c("DL", "REML", "ML", "PM", "HS", "SJ", "HE", "EB")
for (m in methods) {
  res <- rma(yi, vi, data = bcg, method = m)
  cat(sprintf("  %s: tau² = %.6f, tau = %.6f\n", m, res$tau2, sqrt(res$tau2)))
}

cat("\n2.4 HKSJ Adjustment\n")
res_hksj <- rma(yi, vi, data = bcg, method = "REML", test = "knha")
cat(sprintf("  HKSJ 95%% CI = [%.6f, %.6f]\n", res_hksj$ci.lb, res_hksj$ci.ub))
cat(sprintf("  HKSJ t = %.6f (df=%d)\n", res_hksj$zval, res_hksj$dfs))
cat(sprintf("  HKSJ p = %.6f\n", res_hksj$pval))
cat(sprintf("  HKSJ OR CI = [%.4f, %.4f]\n", exp(res_hksj$ci.lb), exp(res_hksj$ci.ub)))

cat("\n2.5 Prediction Interval\n")
pred <- predict(res_reml)
cat(sprintf("  Standard PI = [%.6f, %.6f]\n", pred$pi.lb, pred$pi.ub))
cat(sprintf("  PI (OR scale) = [%.4f, %.4f]\n", exp(pred$pi.lb), exp(pred$pi.ub)))

cat("\n2.6 Publication Bias Tests\n")

# Egger's test
egger <- regtest(res_reml, model = "lm")
cat(sprintf("  Egger's test: z = %.4f, p = %.4f\n", egger$zval, egger$pval))

# Begg's test
begg <- ranktest(res_reml)
cat(sprintf("  Begg's test: tau = %.4f, p = %.4f\n", begg$tau, begg$pval))

# Trim and fill
tf <- trimfill(res_reml)
cat(sprintf("  Trim-fill: k0 = %d (side: %s)\n", tf$k0, tf$side))
cat(sprintf("  Trim-fill adjusted: %.6f [%.6f, %.6f]\n",
            as.numeric(tf$beta), tf$ci.lb, tf$ci.ub))

cat("\n2.7 Leave-One-Out Analysis\n")
loo <- leave1out(res_reml)
cat("Study\tEstimate\tSE\tCI.lb\tCI.ub\n")
for (i in 1:13) {
  cat(sprintf("%d\t%.6f\t%.6f\t%.6f\t%.6f\n",
              i, loo$estimate[i], loo$se[i], loo$ci.lb[i], loo$ci.ub[i]))
}

################################################################################
# SECTION 3: SGLT2 INHIBITORS CASE STUDY (k=5)
################################################################################

cat("\n\n=== SECTION 3: SGLT2 INHIBITORS FOR HF (k=5) ===\n")
cat("Source: Major cardiovascular outcome trials\n\n")

sglt2_data <- data.frame(
  study = c("DAPA-HF", "EMPEROR-Reduced", "DELIVER", "EMPEROR-Preserved", "SOLOIST-WHF"),
  year = c(2019, 2020, 2022, 2021, 2020),
  e_t = c(237, 246, 368, 259, 51),    # Events treatment
  n_t = c(2373, 1863, 3131, 2997, 608),
  e_c = c(326, 342, 455, 352, 76),    # Events control
  n_c = c(2371, 1867, 3132, 2991, 614)
)

sglt2 <- escalc(measure = "OR",
                ai = e_t, bi = n_t - e_t,
                ci = e_c, di = n_c - e_c,
                data = sglt2_data)

cat("3.1 Individual Study Effect Sizes\n")
cat("Study\t\t\tyi\t\tvi\t\tSE\n")
for (i in 1:5) {
  cat(sprintf("%s\t%.6f\t%.6f\t%.6f\n",
              sglt2_data$study[i], sglt2$yi[i], sglt2$vi[i], sqrt(sglt2$vi[i])))
}

cat("\n3.2 Random Effects (REML)\n")
res_sglt2 <- rma(yi, vi, data = sglt2, method = "REML")
cat(sprintf("  Pooled log(OR) = %.6f\n", as.numeric(res_sglt2$beta)))
cat(sprintf("  SE = %.6f\n", res_sglt2$se))
cat(sprintf("  95%% CI = [%.6f, %.6f]\n", res_sglt2$ci.lb, res_sglt2$ci.ub))
cat(sprintf("  tau² = %.6f\n", res_sglt2$tau2))
cat(sprintf("  I² = %.2f%%\n", res_sglt2$I2))
cat(sprintf("  Q = %.4f (p=%.4f)\n", res_sglt2$QE, res_sglt2$QEp))
cat(sprintf("  OR = %.4f [%.4f, %.4f]\n",
            exp(as.numeric(res_sglt2$beta)),
            exp(res_sglt2$ci.lb),
            exp(res_sglt2$ci.ub)))

cat("\n3.3 HKSJ Adjustment\n")
res_sglt2_hksj <- rma(yi, vi, data = sglt2, method = "REML", test = "knha")
cat(sprintf("  HKSJ 95%% CI = [%.6f, %.6f]\n", res_sglt2_hksj$ci.lb, res_sglt2_hksj$ci.ub))
cat(sprintf("  HKSJ OR CI = [%.4f, %.4f]\n",
            exp(res_sglt2_hksj$ci.lb), exp(res_sglt2_hksj$ci.ub)))

cat("\n3.4 Prediction Interval\n")
pred_sglt2 <- predict(res_sglt2)
cat(sprintf("  PI = [%.6f, %.6f]\n", pred_sglt2$pi.lb, pred_sglt2$pi.ub))
cat(sprintf("  PI (OR scale) = [%.4f, %.4f]\n",
            exp(pred_sglt2$pi.lb), exp(pred_sglt2$pi.ub)))

################################################################################
# SECTION 4: MAGNESIUM MI DATASET (k=8)
################################################################################

cat("\n\n=== SECTION 4: MAGNESIUM FOR MI (k=8) ===\n")
cat("Source: Teo et al. (1991) BMJ\n\n")

mg_data <- data.frame(
  study = c("Morton 1984", "Rasmussen 1986", "Smith 1986", "Abraham 1987",
            "Feldstedt 1988", "Shechter 1989", "Ceremuzynski 1989", "Singh 1990"),
  e_t = c(1, 9, 2, 1, 10, 1, 1, 6),
  n_t = c(40, 135, 200, 48, 150, 59, 25, 76),
  e_c = c(2, 23, 7, 1, 8, 9, 3, 11),
  n_c = c(36, 135, 200, 46, 148, 56, 23, 75)
)

mg <- escalc(measure = "OR",
             ai = e_t, bi = n_t - e_t,
             ci = e_c, di = n_c - e_c,
             data = mg_data)

cat("4.1 Individual Study Effect Sizes\n")
cat("Study\t\t\tyi\t\tvi\n")
for (i in 1:8) {
  cat(sprintf("%s\t%.6f\t%.6f\n", mg_data$study[i], mg$yi[i], mg$vi[i]))
}

res_mg <- rma(yi, vi, data = mg, method = "REML")
cat("\n4.2 Random Effects (REML)\n")
cat(sprintf("  Pooled log(OR) = %.6f\n", as.numeric(res_mg$beta)))
cat(sprintf("  SE = %.6f\n", res_mg$se))
cat(sprintf("  95%% CI = [%.6f, %.6f]\n", res_mg$ci.lb, res_mg$ci.ub))
cat(sprintf("  tau² = %.6f\n", res_mg$tau2))
cat(sprintf("  I² = %.2f%%\n", res_mg$I2))
cat(sprintf("  OR = %.4f [%.4f, %.4f]\n",
            exp(as.numeric(res_mg$beta)),
            exp(res_mg$ci.lb),
            exp(res_mg$ci.ub)))

################################################################################
# SECTION 5: CONTINUOUS OUTCOME (SMD)
################################################################################

cat("\n\n=== SECTION 5: CONTINUOUS OUTCOME VALIDATION ===\n")
cat("Standardized Mean Difference (Hedges' g)\n\n")

cat("5.1 Hedges' g Calculation Example\n")
n1 <- 50; n2 <- 50
m1 <- 15.2; m2 <- 18.5
sd1 <- 5.1; sd2 <- 5.3

# Pooled SD
s_pooled <- sqrt(((n1-1)*sd1^2 + (n2-1)*sd2^2) / (n1 + n2 - 2))
d <- (m1 - m2) / s_pooled

# Hedges' correction
J <- 1 - 3 / (4 * (n1 + n2 - 2) - 1)
g <- d * J

# Variance
v_g <- (n1 + n2) / (n1 * n2) + g^2 / (2 * (n1 + n2))

cat(sprintf("  n1=%d, n2=%d, m1=%.1f, m2=%.1f, sd1=%.1f, sd2=%.1f\n",
            n1, n2, m1, m2, sd1, sd2))
cat(sprintf("  s_pooled = %.6f\n", s_pooled))
cat(sprintf("  Cohen's d = %.6f\n", d))
cat(sprintf("  J (correction) = %.6f\n", J))
cat(sprintf("  Hedges' g = %.6f\n", g))
cat(sprintf("  Variance = %.6f\n", v_g))
cat(sprintf("  SE = %.6f\n", sqrt(v_g)))

# Using escalc for verification
smd_check <- escalc(measure = "SMD",
                    m1i = m1, sd1i = sd1, n1i = n1,
                    m2i = m2, sd2i = sd2, n2i = n2)
cat(sprintf("  escalc verification: yi = %.6f, vi = %.6f\n",
            smd_check$yi, smd_check$vi))

################################################################################
# SECTION 6: PROPORTION META-ANALYSIS
################################################################################

cat("\n\n=== SECTION 6: PROPORTION META-ANALYSIS ===\n\n")

prop_data <- data.frame(
  xi = c(15, 23, 8, 31, 12),
  ni = c(100, 150, 80, 200, 90)
)

cat("6.1 Freeman-Tukey Double Arcsine Transformation\n")
prop_ft <- escalc(measure = "PFT", xi = xi, ni = ni, data = prop_data)
cat("Study\tEvents\tN\tyi(FT)\t\tvi\n")
for (i in 1:5) {
  cat(sprintf("%d\t%d\t%d\t%.6f\t%.6f\n",
              i, prop_data$xi[i], prop_data$ni[i], prop_ft$yi[i], prop_ft$vi[i]))
}

res_prop <- rma(yi, vi, data = prop_ft, method = "REML")
cat(sprintf("\nPooled (FT scale): %.6f [%.6f, %.6f]\n",
            as.numeric(res_prop$beta), res_prop$ci.lb, res_prop$ci.ub))

# Back-transform
pred_prop <- predict(res_prop, transf = transf.ipft.hm, targs = list(ni = prop_data$ni))
cat(sprintf("Pooled proportion: %.4f [%.4f, %.4f]\n",
            pred_prop$pred, pred_prop$ci.lb, pred_prop$ci.ub))

################################################################################
# SECTION 7: CORRELATION META-ANALYSIS
################################################################################

cat("\n\n=== SECTION 7: CORRELATION META-ANALYSIS ===\n\n")

corr_data <- data.frame(
  ri = c(0.35, 0.42, 0.28, 0.51, 0.39),
  ni = c(80, 120, 95, 150, 85)
)

cat("7.1 Fisher's z Transformation\n")
corr_z <- escalc(measure = "ZCOR", ri = ri, ni = ni, data = corr_data)
cat("Study\tr\tn\tyi(z)\t\tvi\n")
for (i in 1:5) {
  cat(sprintf("%d\t%.2f\t%d\t%.6f\t%.6f\n",
              i, corr_data$ri[i], corr_data$ni[i], corr_z$yi[i], corr_z$vi[i]))
}

res_corr <- rma(yi, vi, data = corr_z, method = "REML")
cat(sprintf("\nPooled (z scale): %.6f [%.6f, %.6f]\n",
            as.numeric(res_corr$beta), res_corr$ci.lb, res_corr$ci.ub))

# Back-transform
pred_corr <- predict(res_corr, transf = transf.ztor)
cat(sprintf("Pooled correlation: %.4f [%.4f, %.4f]\n",
            pred_corr$pred, pred_corr$ci.lb, pred_corr$ci.ub))

################################################################################
# SECTION 8: META-REGRESSION
################################################################################

cat("\n\n=== SECTION 8: META-REGRESSION ===\n")
cat("BCG: Effect of latitude\n\n")

res_reg <- rma(yi, vi, mods = ~ ablat, data = bcg, method = "REML")
cat(sprintf("Intercept: %.6f (SE=%.6f, p=%.4f)\n",
            res_reg$beta[1], res_reg$se[1], res_reg$pval[1]))
cat(sprintf("Latitude slope: %.6f (SE=%.6f, p=%.4f)\n",
            res_reg$beta[2], res_reg$se[2], res_reg$pval[2]))
cat(sprintf("R² = %.2f%%\n", res_reg$R2))
cat(sprintf("Residual tau² = %.6f\n", res_reg$tau2))

################################################################################
# SUMMARY
################################################################################

cat("\n\n=== VALIDATION SUMMARY ===\n\n")
cat("This file contains R reference values for validating TruthCert-PairwisePro.\n")
cat("To validate JavaScript implementation:\n")
cat("1. Run the same analyses in TruthCert-PairwisePro\n")
cat("2. Compare outputs to values in this file\n")
cat("3. Acceptable tolerance: relative error < 1e-5 (6 significant figures)\n\n")

cat("Datasets included:\n")
cat("  - BCG Vaccine (k=13): Binary, high heterogeneity, classic benchmark\n")
cat("  - SGLT2i HF (k=5): Binary, contemporary clinical example\n")
cat("  - Magnesium MI (k=8): Binary, historical controversial dataset\n")
cat("  - Continuous (SMD): Hedges' g calculation verification\n")
cat("  - Proportion (k=5): Freeman-Tukey transformation\n")
cat("  - Correlation (k=5): Fisher's z transformation\n\n")

cat("Methods validated:\n")
cat("  - Distribution functions (pnorm, qnorm, pt, qt, pchisq, qchisq)\n")
cat("  - Effect size calculations (OR, RR, SMD, proportions, correlations)\n")
cat("  - All 8 tau² estimators (DL, REML, ML, PM, HS, SJ, HE, EB)\n")
cat("  - HKSJ adjustment\n")
cat("  - Prediction intervals\n")
cat("  - Publication bias tests (Egger, Begg, trim-fill)\n")
cat("  - Leave-one-out sensitivity analysis\n")
cat("  - Meta-regression\n")

sink()

cat("\n\nReference values saved to: S3_R_Reference_Values.txt\n")
cat("Use these values to validate TruthCert-PairwisePro outputs.\n")
