# Fresh R references for P11-R2; emits JSON to stdout and writes no output files.
# Base models are fitted with REML. Tiny-unit calls use the base REML tau2
# converted to those units, isolating metafor's I2/H2 from optimizer scaling.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
options(warn = 1)

capture <- function(fit) {
  list(k = fit$k, mu = as.numeric(coef(fit)), seMu = fit$se,
       tau2 = fit$tau2, Q = fit$QE, df = fit$k - 1,
       I2 = fit$I2, H2 = fit$H2)
}
fit_case <- function(y, se, excluded) {
  fit <- function(indices) rma.uni(yi = y[indices], vi = se[indices]^2,
    method = 'REML', test = 'z', control = list(threshold = 1e-12, maxiter = 10000))
  all <- seq_along(y)
  full <- fit(all)
  deleted <- lapply(all, function(i) fit(all[-i]))
  kept <- fit(all[!all %in% excluded])
  scale <- 1e-80
  tiny <- function(indices, base) {
    tryCatch(capture(rma.uni(yi = y[indices] * scale, vi = (se[indices] * scale)^2,
      tau2 = base$tau2 * scale^2, method = 'REML', test = 'z')),
      error = function(e) list(error = conditionMessage(e)))
  }
  list(yi = y, se = se, excluded_zero_based = excluded - 1,
       full = capture(full), deleted = lapply(deleted, capture), kept = capture(kept),
       tiny = list(scale = scale, full = tiny(all, full),
         deleted = lapply(all, function(i) tiny(all[-i], deleted[[i]])),
         kept = tiny(all[!all %in% excluded], kept)))
}
out <- list(
  provenance = list(script = 'p11-r2-reference.R', R = R.version.string,
    metafor = as.character(packageVersion('metafor')),
    jsonlite = as.character(packageVersion('jsonlite')),
    tiny_policy = 'rma.uni with tau2 fixed to the independently fitted base REML tau2 times scale^2'),
  cases = list(
    equal = fit_case(c(-1, 0, 1), rep(0.1, 3), 1),
    unequal = fit_case(c(0.2, -0.1, 0.15, 0.05, 0.8), sqrt(c(0.04, 0.03, 0.025, 0.02, 0.018)), c(1, 3))))
cat('P11_R2_REFERENCE_JSON\n')
# Keep the complete reference (including versions) within the runner's output tail.
cat(toJSON(out, auto_unbox = TRUE, digits = NA, pretty = FALSE), '\n')
cat('END_P11_R2_REFERENCE_JSON\n')
