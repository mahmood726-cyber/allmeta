#!/usr/bin/env Rscript
library(metafor)
library(jsonlite)

cat("\n========================================================================\n")
cat("     STATISTICAL BENCHMARK: IPD Meta-Analysis Pro vs R metafor\n")
cat("========================================================================\n\n")

# DATASET 1: BCG Vaccine Trials
cat("DATASET 1: BCG Vaccine Trials (13 studies, Log Risk Ratio)\n")
cat("------------------------------------------------------------------------\n\n")

dat_bcg <- escalc(measure="RR", ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg)

fe_bcg <- rma(yi, vi, data=dat_bcg, method="FE")
dl_bcg <- rma(yi, vi, data=dat_bcg, method="DL")
reml_bcg <- rma(yi, vi, data=dat_bcg, method="REML")
pm_bcg <- rma(yi, vi, data=dat_bcg, method="PM")
sj_bcg <- rma(yi, vi, data=dat_bcg, method="SJ")
hksj_bcg <- rma(yi, vi, data=dat_bcg, method="DL", test="knha")
pi_bcg <- predict(dl_bcg)
egger_bcg <- regtest(dl_bcg, model="lm")

cat("Method                  | Pooled    | SE        | tau2      | I2      | p-value\n")
cat("------------------------|-----------|-----------|-----------|---------|----------\n")
cat(sprintf("Fixed Effect            | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n", coef(fe_bcg), fe_bcg$se, 0, 0, fe_bcg$pval))
cat(sprintf("DerSimonian-Laird       | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n", coef(dl_bcg), dl_bcg$se, dl_bcg$tau2, dl_bcg$I2, dl_bcg$pval))
cat(sprintf("REML                    | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n", coef(reml_bcg), reml_bcg$se, reml_bcg$tau2, reml_bcg$I2, reml_bcg$pval))
cat(sprintf("Paule-Mandel            | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n", coef(pm_bcg), pm_bcg$se, pm_bcg$tau2, pm_bcg$I2, pm_bcg$pval))
cat(sprintf("Sidik-Jonkman           | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n", coef(sj_bcg), sj_bcg$se, sj_bcg$tau2, sj_bcg$I2, sj_bcg$pval))
cat(sprintf("DL + HKSJ               | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n", coef(hksj_bcg), hksj_bcg$se, hksj_bcg$tau2, hksj_bcg$I2, hksj_bcg$pval))

cat("\nAdditional Statistics:\n")
cat(sprintf("  Q statistic:          %.4f (df=%d, p=%.2e)\n", dl_bcg$QE, dl_bcg$k-1, dl_bcg$QEp))
cat(sprintf("  H2 statistic:         %.4f\n", dl_bcg$H2))
cat(sprintf("  Prediction interval:  [%.4f, %.4f]\n", pi_bcg$pi.lb, pi_bcg$pi.ub))
cat(sprintf("  Egger test p-value:   %.4f\n", egger_bcg$pval))

# DATASET 2: Hart 1999
cat("\n------------------------------------------------------------------------\n")
cat("DATASET 2: Aspirin for Stroke Prevention (Hart 1999)\n")
cat("------------------------------------------------------------------------\n\n")

dat_hart <- escalc(measure="OR", ai=x1i, n1i=n1i, ci=x2i, n2i=n2i, data=dat.hart1999)
dl_hart <- rma(yi, vi, data=dat_hart, method="DL")
reml_hart <- rma(yi, vi, data=dat_hart, method="REML")

cat("Method                  | Pooled    | SE        | tau2      | I2      | p-value\n")
cat("------------------------|-----------|-----------|-----------|---------|----------\n")
cat(sprintf("DerSimonian-Laird       | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n", coef(dl_hart), dl_hart$se, dl_hart$tau2, dl_hart$I2, dl_hart$pval))
cat(sprintf("REML                    | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n", coef(reml_hart), reml_hart$se, reml_hart$tau2, reml_hart$I2, reml_hart$pval))

# DATASET 3: Normand 1999 SMD
cat("\n------------------------------------------------------------------------\n")
cat("DATASET 3: Hospital Length of Stay (Normand 1999, SMD)\n")
cat("------------------------------------------------------------------------\n\n")

dat_norm <- escalc(measure="SMD", m1i=m1i, sd1i=sd1i, n1i=n1i, m2i=m2i, sd2i=sd2i, n2i=n2i, data=dat.normand1999)
dl_norm <- rma(yi, vi, data=dat_norm, method="DL")
reml_norm <- rma(yi, vi, data=dat_norm, method="REML")

cat("Method                  | Pooled    | SE        | tau2      | I2      | p-value\n")
cat("------------------------|-----------|-----------|-----------|---------|----------\n")
cat(sprintf("DerSimonian-Laird       | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n", coef(dl_norm), dl_norm$se, dl_norm$tau2, dl_norm$I2, dl_norm$pval))
cat(sprintf("REML                    | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n", coef(reml_norm), reml_norm$se, reml_norm$tau2, reml_norm$I2, reml_norm$pval))

# DATASET 4: Yusuf 1985
cat("\n------------------------------------------------------------------------\n")
cat("DATASET 4: Antiplatelet Trials (Yusuf 1985)\n")
cat("------------------------------------------------------------------------\n\n")

dat_yusuf <- escalc(measure="OR", ai=ai, n1i=n1i, ci=ci, n2i=n2i, data=dat.yusuf1985)
dl_yusuf <- rma(yi, vi, data=dat_yusuf, method="DL")

cat("Method                  | Pooled    | SE        | tau2      | I2      | p-value\n")
cat("------------------------|-----------|-----------|-----------|---------|----------\n")
cat(sprintf("DerSimonian-Laird       | %9.6f | %9.6f | %9.6f | %6.2f%% | %.6f\n", coef(dl_yusuf), dl_yusuf$se, dl_yusuf$tau2, dl_yusuf$I2, dl_yusuf$pval))

# NUMERICAL PRECISION
cat("\n------------------------------------------------------------------------\n")
cat("NUMERICAL PRECISION TESTS\n")
cat("------------------------------------------------------------------------\n\n")

cat("Normal Distribution:\n")
cat(sprintf("  pnorm(0)     = %.10f (expected: 0.5)\n", pnorm(0)))
cat(sprintf("  pnorm(1.96)  = %.10f (expected: 0.9750021)\n", pnorm(1.96)))
cat(sprintf("  qnorm(0.975) = %.10f (expected: 1.959964)\n", qnorm(0.975)))

cat("\nChi-Square Distribution:\n")
cat(sprintf("  pchisq(10, df=5) = %.10f\n", pchisq(10, 5)))
cat(sprintf("  qchisq(0.95, df=12) = %.10f\n", qchisq(0.95, 12)))

cat("\nt-Distribution:\n")
cat(sprintf("  pt(2.179, df=12) = %.10f\n", pt(2.179, 12)))
cat(sprintf("  qt(0.975, df=12) = %.10f\n", qt(0.975, 12)))

# EDGE CASES
cat("\n------------------------------------------------------------------------\n")
cat("EDGE CASES\n")
cat("------------------------------------------------------------------------\n\n")

set.seed(42)
effects_homog <- rep(0.5, 10) + rnorm(10, 0, 0.01)
variances_homog <- rep(0.04, 10)
res_homog <- rma(effects_homog, variances_homog, method="DL")
cat(sprintf("Near-zero heterogeneity: tau2 = %.8f, I2 = %.4f%%\n", res_homog$tau2, res_homog$I2))

effects_hetero <- c(-1, -0.5, 0, 0.5, 1, 1.5)
variances_hetero <- rep(0.04, 6)
res_hetero <- rma(effects_hetero, variances_hetero, method="DL")
cat(sprintf("High heterogeneity:      tau2 = %.6f, I2 = %.2f%%\n", res_hetero$tau2, res_hetero$I2))

effects_small <- c(0.3, 0.5, 0.7)
variances_small <- c(0.05, 0.04, 0.06)
res_small <- rma(effects_small, variances_small, method="DL")
cat(sprintf("Small k (3 studies):     pooled = %.6f, tau2 = %.6f\n", coef(res_small), res_small$tau2))

# CROSS-SOFTWARE COMPARISON
cat("\n------------------------------------------------------------------------\n")
cat("CROSS-SOFTWARE COMPARISON (BCG Data, DL Method)\n")
cat("------------------------------------------------------------------------\n\n")

cat("+------------------+------------+---------------+------------+\n")
cat("| Software         | Pooled RR  | 95% CI        | I2         |\n")
cat("+------------------+------------+---------------+------------+\n")
cat(sprintf("| R metafor 4.8    | %10.4f | %.2f - %.2f  | %6.2f%%    |\n", exp(coef(dl_bcg)), exp(dl_bcg$ci.lb), exp(dl_bcg$ci.ub), dl_bcg$I2))
cat("| Stata metan      |     0.4895 | 0.34 - 0.70   |  92.12%    |\n")
cat("| RevMan 5         |     0.49   | 0.34 - 0.70   |  92%       |\n")
cat("| CMA v3           |     0.49   | 0.35 - 0.70   |  92.1%     |\n")
cat("+------------------+------------+---------------+------------+\n")

cat("\n========================================================================\n")
cat("                         BENCHMARK COMPLETE\n")
cat("========================================================================\n")
