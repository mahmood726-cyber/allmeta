suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
d <- read.csv(commandArgs(trailingOnly = TRUE)[1])
r <- rma.uni(yi = d$yi, vi = d$vi, method = "REML")
cat(toJSON(list(
  b = r$b[1,1], se = r$se, ci.lb = r$ci.lb, ci.ub = r$ci.ub,
  tau2 = r$tau2, I2 = r$I2, Q = r$QE, QEp = r$QEp, k = r$k
), auto_unbox = TRUE, digits = 12))
