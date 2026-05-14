suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
d <- read.csv(commandArgs(trailingOnly = TRUE)[1])
# Cycle 7.11: JS engine uses Paule-Mandel for tau^2 + HKSJ variance correction.
# To preserve real engine R-parity at tol=1e-6, this script matches:
#   method='PM' for tau^2 estimation
#   test='knha' to invoke the Knapp-Hartung-Sidik-Jonkman adjustment (HKSJ)
r <- rma.uni(yi = d$yi, vi = d$vi, mods = ~ d$year, method = "PM", test = "knha")
cat(toJSON(list(
  intercept = r$b[1,1], intercept_se = r$se[1], intercept_pval = r$pval[1],
  intercept_ci_lb = r$ci.lb[1], intercept_ci_ub = r$ci.ub[1],
  slope = r$b[2,1], slope_se = r$se[2], slope_pval = r$pval[2],
  slope_ci_lb = r$ci.lb[2], slope_ci_ub = r$ci.ub[2],
  tau2 = r$tau2,
  R2 = r$R2, QM = r$QM, QMp = r$QMp, k = r$k
), auto_unbox = TRUE, digits = 12))
