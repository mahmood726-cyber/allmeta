suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
d <- read.csv(commandArgs(trailingOnly = TRUE)[1])
# Match the page's PM fit, max(1, RSS/df) KH floor, and exported solver control.
# The original PM/knha reference is retained separately in mr-tiny-knha.R.
r <- rma.uni(yi = d$yi, vi = d$vi, mods = ~ d$year, method = "PM", test = "adhoc",
             control = list(tol = 1e-12))
cat(toJSON(list(
  intercept = r$b[1,1], intercept_se = r$se[1], intercept_pval = r$pval[1],
  intercept_ci_lb = r$ci.lb[1], intercept_ci_ub = r$ci.ub[1],
  slope = r$b[2,1], slope_se = r$se[2], slope_pval = r$pval[2],
  slope_ci_lb = r$ci.lb[2], slope_ci_ub = r$ci.ub[2],
  tau2 = r$tau2,
  R2 = r$R2, QM = r$QM, QMp = r$QMp, k = r$k
), auto_unbox = TRUE, digits = 12))
