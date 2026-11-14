# Reference values for tests/test_prediction_interval.py: the 95% prediction interval for the dose 1 vs 0 relative
# risk in a new study, for the page's dose-response GLS model y ~ N(X b, V + tau2 I) with tau2 fixed at the page's value
# (DL or REML). Convention adopted for this repo (Cochrane Handbook v6.5; metafor predict() for a test = "knha" fit):
#   PI = exp( c'b -/+ qt(0.975, k - 1) * sqrt( c' Var(b) c + tau2 ) ),  k = number of studies; undefined for k < 2.
# b and Var(b) are refitted here by metafor rma.mv(y, V, mods, random = ~ 1 | obs, sigma2 = tau2, test = "z") from the
# page's own blocks; the contrast is c = (0, 1, 1) (quadratic) or (0, 1) (linear).
#
# Regenerate from dosehtml/tests (R 4.6.0, metafor >= 5.0):
#   node pi_harness.cjs > pi_in.json
#   Rscript --no-environ pi_reference.R pi_in.json pi_r460.json
suppressMessages({library(jsonlite); library(metafor)})
a <- commandArgs(trailingOnly = TRUE)
d <- fromJSON(a[1], simplifyVector = FALSE)
bd <- function(blocks) { n <- sum(sapply(blocks, function(b) b$n)); M <- matrix(0, n, n); o <- 0
  for (b in blocks) { k <- b$n; M[o + 1:k, o + 1:k] <- matrix(unlist(b$V), k, k, byrow = TRUE); o <- o + k }; M }
out <- list(cases = list())
for (key in names(d$cases)) {
  cs <- d$cases[[key]]; bl <- d[[cs$dataset]]$blocks
  dose <- unlist(lapply(bl, function(b) unlist(b$dose))); y <- unlist(lapply(bl, function(b) unlist(b$y)))
  V <- bd(bl); obs <- seq_along(y)
  mods <- if (cs$model == "quadratic") ~ dose + I(dose^2) else ~ dose
  cc <- if (cs$model == "quadratic") c(0, 1, 1) else c(0, 1)
  f <- rma.mv(y, V, mods = mods, random = ~ 1 | obs, sigma2 = cs$tau2, test = "z")
  est <- sum(cc * coef(f)); se <- sqrt(drop(t(cc) %*% vcov(f) %*% cc))
  k <- length(unique(sapply(bl, function(b) b$id)))
  crit <- qt(0.975, k - 1)
  out$cases[[key]] <- list(k = k, df = k - 1, crit = crit, logRR = est, se = se,
    pi_lower = exp(est - crit * sqrt(se^2 + cs$tau2)), pi_upper = exp(est + crit * sqrt(se^2 + cs$tau2)),
    pi_lower_km2 = exp(est - qt(0.975, max(k - 2, 1)) * sqrt(se^2 + cs$tau2)),
    pi_upper_km2 = exp(est + qt(0.975, max(k - 2, 1)) * sqrt(se^2 + cs$tau2)),
    # updateInterpretationLegacy reports the PI of the linear coefficient alone (b1, SE(b1)), not the dose 1 vs 0 contrast
    pi_lower_b1 = exp(coef(f)[[2]] - crit * sqrt(f$se[2]^2 + cs$tau2)), pi_upper_b1 = exp(coef(f)[[2]] + crit * sqrt(f$se[2]^2 + cs$tau2)))
}
out$helper <- list(k2 = list(crit = qt(0.975, 1), lower = 0.1 - qt(0.975, 1) * sqrt(0.2^2 + 0.05),
  upper = 0.1 + qt(0.975, 1) * sqrt(0.2^2 + 0.05)), k5tau0 = list(crit = qt(0.975, 4), lower = 0.1 - qt(0.975, 4) * 0.2))
out$R <- R.version.string; out$metafor <- as.character(packageVersion("metafor"))
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = FALSE), a[2])
