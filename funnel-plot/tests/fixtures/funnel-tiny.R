suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
d <- read.csv(commandArgs(trailingOnly = TRUE)[1])
r <- rma.uni(yi = d$yi, sei = d$sei, method = "REML")
e <- regtest(r, ret.fit = TRUE)
cat(toJSON(list(
  egger_zval = e$zval, egger_pval = e$pval,
  egger_slope = e$est, egger_slope_se = e$fit$se[1],
  pool_b = r$b[1,1], pool_se = r$se, k = r$k
), auto_unbox = TRUE, digits = 12))
