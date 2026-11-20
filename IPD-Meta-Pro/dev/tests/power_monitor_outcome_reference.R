# Reference for dev/tests/power_monitor_outcome.test.cjs (Power Monitor reads the configured outcome type).
# Simulates three small IPD sets (time-to-event, binary, continuous; 4 studies each, seeded), and computes, in R,
# what the Power Monitor must show for each: per-study estimates on the scale runAnalysis uses (Cox log HR with
# Efron ties, log OR with 0.5 added only when a cell is zero, mean difference), the fixed-effect pool (estimate,
# SE), Cochran's Q-based I2, the DerSimonian-Laird tau2, and the page's power approximation evaluated with R's t
# distribution. Writes power_monitor_outcome_reference.json next to this file.
#   Rscript --no-environ dev/tests/power_monitor_outcome_reference.R   (metafor 5.2-1, survival, jsonlite)
suppressPackageStartupMessages({ library(metafor); library(survival); library(jsonlite) })
set.seed(20261112)
studies <- c("S1", "S2", "S3", "S4")
n <- c(40, 55, 36, 60)

surv <- do.call(rbind, lapply(seq_along(studies), function(i) {
  trt <- rep(c(1, 0), length.out = n[i])
  rate <- 0.05 * exp((log(0.7) + rnorm(1, 0, 0.6)) * trt)
  t <- rexp(n[i], rate); cens <- runif(n[i], 5, 30)
  data.frame(study_id = studies[i], treatment = trt, time_months = round(pmin(t, cens), 2), event = as.integer(t <= cens))
}))
bin <- do.call(rbind, lapply(seq_along(studies), function(i) {
  trt <- rep(c(1, 0), length.out = n[i])
  p <- plogis(-1 + (log(0.6) + rnorm(1, 0, 0.8)) * trt)
  data.frame(study_id = studies[i], treatment = trt, mace_event = rbinom(n[i], 1, p))
}))
cont <- do.call(rbind, lapply(seq_along(studies), function(i) {
  trt <- rep(c(1, 0), length.out = n[i])
  data.frame(study_id = studies[i], treatment = trt, hamd_change = round(-8 - 2.5 * trt + rnorm(1, 0, 1) + rnorm(n[i], 0, 6), 2))
}))

pool <- function(yi, vi) {
  fe <- rma(yi, vi, method = "FE"); dl <- rma(yi, vi, method = "DL")
  k <- length(yi); Q <- fe$QE; df <- k - 1
  I2 <- if (Q > 0) max(0, (Q - df) / Q * 100) else 0
  tau2 <- dl$tau2
  es <- abs(fe$beta[1]) / sqrt(fe$se^2 + tau2); crit <- qt(0.975, df); ncp <- es * sqrt(k)
  pw <- pt(crit - ncp, df, lower.tail = FALSE) + pt(-crit - ncp, df)
  list(k = k, yi = yi, vi = vi, estimate = fe$beta[1], se = fe$se, Q = Q, I2 = I2, tau2 = tau2,
       power = min(0.99, max(0.05, pw)))
}
cox <- t(sapply(studies, function(s) { f <- coxph(Surv(time_months, event) ~ treatment, data = surv[surv$study_id == s, ], ties = "efron"); c(coef(f), vcov(f)[1, 1]) }))
tab <- t(sapply(studies, function(s) { d <- bin[bin$study_id == s, ]; c(sum(d$mace_event[d$treatment == 1]), sum(d$treatment == 1), sum(d$mace_event[d$treatment == 0]), sum(d$treatment == 0)) }))
or <- escalc("OR", ai = tab[, 1], n1i = tab[, 2], ci = tab[, 3], n2i = tab[, 4])
md <- t(sapply(studies, function(s) { d <- cont[cont$study_id == s, ]; a <- d$hamd_change[d$treatment == 1]; b <- d$hamd_change[d$treatment == 0]; c(mean(a) - mean(b), var(a) / length(a) + var(b) / length(b)) }))
out <- list(
  versions = list(R = R.version.string, metafor = as.character(packageVersion("metafor")), survival = as.character(packageVersion("survival"))),
  survival = list(rows = surv, ref = pool(unname(cox[, 1]), unname(cox[, 2]))),
  binary = list(rows = bin, ref = pool(as.numeric(or$yi), as.numeric(or$vi))),
  continuous = list(rows = cont, ref = pool(unname(md[, 1]), unname(md[, 2]))))
args <- commandArgs(trailingOnly = FALSE); me <- sub("^--file=", "", args[grep("^--file=", args)])
writeLines(toJSON(out, digits = NA, auto_unbox = TRUE, dataframe = "rows"), file.path(dirname(me), "power_monitor_outcome_reference.json"))
cat("survival FE", out$survival$ref$estimate, "binary FE", out$binary$ref$estimate, "continuous FE", out$continuous$ref$estimate, "\n")
