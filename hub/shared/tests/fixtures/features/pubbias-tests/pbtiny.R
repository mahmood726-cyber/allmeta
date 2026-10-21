# pb-tiny reference (lane fc, item 5): metafor regtest(lm)/ranktest/trimfill(REML, L0).
# Usage: Rscript pbtiny.R out.json
suppressPackageStartupMessages({library(metafor); library(jsonlite)})
cat(R.version.string, '\n'); cat('libPaths:', .libPaths(), '\n')
cat('metafor', as.character(packageVersion('metafor')), '\n')
args <- commandArgs(TRUE)
yi <- c(0.55, 0.48, 0.70, 0.60, 0.30, 0.75, 0.52, 0.65, 0.45, 0.58)
sei <- c(0.08, 0.10, 0.15, 0.09, 0.07, 0.20, 0.08, 0.12, 0.17, 0.10)
vi <- sei^2
eg <- regtest(yi, vi, model = 'lm', predictor = 'sei')
rk <- ranktest(yi, vi)
tf <- trimfill(rma(yi, vi, method = 'REML', control = list(threshold = 1e-12, tol = 1e-12, maxiter = 1000)), estimator = 'L0')
res <- list(R = R.version.string, metafor = as.character(packageVersion('metafor')),
  egger_z = unname(eg$zval), egger_p = unname(eg$pval),
  begg_tau = unname(rk$tau), begg_p = unname(rk$pval), begg_exact = isTRUE(rk$exact),
  tf_k0 = unname(tf$k0), tf_est = unname(coef(tf)[1]), tf_se = unname(tf$se), tf_side = tf$side)
writeLines(toJSON(res, auto_unbox = TRUE, digits = NA), args[1])
print(res)
