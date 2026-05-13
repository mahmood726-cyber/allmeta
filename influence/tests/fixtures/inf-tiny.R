suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
d <- read.csv(commandArgs(trailingOnly = TRUE)[1])
r <- rma.uni(yi = d$yi, vi = d$vi, method = "REML")
loo <- leave1out(r)
# Output: overall pooled REML result + leave1out row 1 (Alpha dropped)
cat(toJSON(list(
  b      = r$b[1,1],
  se     = r$se,
  ci.lb  = r$ci.lb,
  ci.ub  = r$ci.ub,
  tau2   = r$tau2,
  I2     = r$I2,
  Q      = r$QE,
  QEp    = r$QEp,
  k      = r$k,
  loo1_estimate = loo$estimate[1],
  loo1_se       = loo$se[1],
  loo1_ci.lb    = loo$ci.lb[1],
  loo1_ci.ub    = loo$ci.ub[1],
  loo1_tau2     = loo$tau2[1],
  loo1_Q        = loo$Q[1],
  loo1_I2       = loo$I2[1]
), auto_unbox = TRUE, digits = 12))
