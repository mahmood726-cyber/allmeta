suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
args <- commandArgs(trailingOnly = TRUE)
d <- read.csv(args[1])
r <- rma.uni(yi = d$yi, vi = d$vi, method = "REML")
out <- list(b = r$b[1, 1], se = r$se, ci.lb = r$ci.lb, ci.ub = r$ci.ub,
            tau2 = r$tau2, I2 = r$I2, Q = r$QE, QEp = r$QEp, k = r$k)
cat(toJSON(out, auto_unbox = TRUE, digits = 12))
