# Reference values for tests/test_hksj.py: Knapp-Hartung inference for the page's dose-response GLS model
# y ~ N(X b, V + tau2 I) (one random effect per observation, V block-diagonal), with tau2 fixed at the page's value.
# The documented R choice the page follows: metafor rma.mv(..., random = ~ 1 | obs, sigma2 = tau2, test = "adhoc")
#   s2 = r' (V + tau2 I)^-1 r / (n - p)   (r: residuals at the fitted tau2; n observations, p coefficients)
#   SE_HK = SE * sqrt(max(1, s2)),  df = n - p (metafor's ddf = k - p for rma.mv, k = number of estimates),
#   critical value qt(0.975, n - p).   ("adhoc" = Knapp & Hartung 2003 with the max(1, s2) floor; "knha" omits it.)
# The contrast is dose 1 vs dose 0: c = (0, 1, 1) for the quadratic model, (0, 1) for the linear model.
# Also: qt(0.975, df) and qnorm values for the page's quantile functions.
#
# Regenerate from dosehtml/tests (R 4.6.0, metafor >= 5.2):
#   node hksj_harness.cjs > hk_in.json
#   Rscript --no-environ hksj_reference.R hk_in.json hksj_r460.json
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
  fz <- rma.mv(y, V, mods = mods, random = ~ 1 | obs, sigma2 = cs$tau2, test = "z")
  fa <- suppressWarnings(rma.mv(y, V, mods = mods, random = ~ 1 | obs, sigma2 = cs$tau2, test = "adhoc"))
  fk <- suppressWarnings(rma.mv(y, V, mods = mods, random = ~ 1 | obs, sigma2 = cs$tau2, test = "knha"))
  ddf <- fa$ddf[1]
  out$cases[[key]] <- list(beta = as.numeric(coef(fa)), se_wald = as.numeric(fz$se), se_hk = as.numeric(fa$se),
    se_knha = as.numeric(fk$se), ddf = ddf, s2 = (as.numeric(fk$se[1]) / as.numeric(fz$se[1]))^2,
    contrast_se_wald = sqrt(drop(t(cc) %*% vcov(fz) %*% cc)), contrast_se_hk = sqrt(drop(t(cc) %*% vcov(fa) %*% cc)),
    crit_hk = qt(0.975, ddf), crit_wald = qnorm(0.975))
}
dfs <- c(1, 2, 3, 4, 10, 11, 39, 40, 76, 77, 100, 101, 1000)
out$quantiles <- c(setNames(as.list(qt(0.975, dfs)), paste0("t", dfs)),
  list(z975 = qnorm(0.975), z995 = qnorm(0.995), z90 = qnorm(0.90), z01 = qnorm(0.01)))
out$R <- R.version.string; out$metafor <- as.character(packageVersion("metafor"))
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = FALSE), a[2])
