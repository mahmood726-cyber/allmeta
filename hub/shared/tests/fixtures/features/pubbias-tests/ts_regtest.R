# Thompson-Sharp reference values for pubbias-tests (lane fc, item 4).
# Usage: Rscript ts_regtest.R corpus.json out.json
# For each archive configuration it records:
#   rma_reml : metafor::regtest(yi, vi, model="rma", predictor="sei") (rma default method REML, test="z")
#   rma_ee   : same with method="EE" (no tau^2)
#   lm       : metafor::regtest(yi, vi, model="lm", predictor="sei") (multiplicative dispersion, t_{k-2})
#   lm_int   : the INTERCEPT row of that weighted lm (what pubbias-tests' thompsonSharp() tests) + sigma^2
suppressPackageStartupMessages({library(metafor); library(jsonlite)})
cat(R.version.string, '\n'); cat('libPaths:', .libPaths(), '\n')
cat('metafor', as.character(packageVersion('metafor')), ' jsonlite', as.character(packageVersion('jsonlite')), '\n')
args <- commandArgs(TRUE)
corpus <- fromJSON(args[1], simplifyVector = FALSE)
safe <- function(expr) tryCatch(expr, error = function(e) list(error = conditionMessage(e)))
out <- lapply(corpus, function(cf) {
  yi <- as.numeric(unlist(cf$yi)); vi <- as.numeric(unlist(cf$vi)); sei <- sqrt(vi)
  r <- list(id = cf$id, k = length(yi))
  r$rma_reml <- safe({
    z <- regtest(yi, vi, model = 'rma', predictor = 'sei', ret.fit = TRUE,
                 control = list(threshold = 1e-12, tol = 1e-12, maxiter = 1000))
    list(zval = unname(z$zval), pval = unname(z$pval), tau2 = z$fit$tau2,
         b_int = unname(coef(z$fit)[1]), b_sei = unname(coef(z$fit)[2]))
  })
  r$rma_ee <- safe({
    z <- regtest(yi, vi, model = 'rma', predictor = 'sei', method = 'EE')
    list(zval = unname(z$zval), pval = unname(z$pval))
  })
  r$lm <- safe({
    z <- regtest(yi, vi, model = 'lm', predictor = 'sei', ret.fit = TRUE)
    s <- summary(z$fit)
    list(zval = unname(z$zval), pval = unname(z$pval), dfs = unname(z$dfs),
         int_t = unname(s$coefficients[1, 3]), int_p = unname(s$coefficients[1, 4]),
         int_b = unname(s$coefficients[1, 1]), int_se = unname(s$coefficients[1, 2]),
         sigma2 = s$sigma^2)
  })
  r
})
writeLines(toJSON(list(R = R.version.string, metafor = as.character(packageVersion('metafor')),
                       results = out), auto_unbox = TRUE, digits = NA, null = 'null'), args[2])
cat(length(out), 'configurations written\n')
