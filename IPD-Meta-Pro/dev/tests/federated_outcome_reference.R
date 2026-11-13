# Reference for dev/tests/federated_outcome.test.cjs (Federated Analysis analyses the configured outcome type).
# Reuses the three seeded IPD sets of power_monitor_outcome_reference.json (time-to-event, binary, continuous; 4
# studies each) and computes, in R, what More > Federated Analysis must show for each: per-site estimates on the scale
# runAnalysis pools (Cox log HR with Efron ties, log OR with 0.5 added only when a cell is zero, mean difference),
# the fixed-effect pool and the DerSimonian-Laird random-effects pool (estimate, SE, z-based 95% CI, two-sided p),
# Cochran's Q and the DL tau2. Writes federated_outcome_reference.json next to this file.
#   Rscript --no-environ dev/tests/federated_outcome_reference.R   (metafor, survival, jsonlite)
suppressPackageStartupMessages({ library(metafor); library(survival); library(jsonlite) })
args <- commandArgs(trailingOnly = FALSE); me <- sub("^--file=", "", args[grep("^--file=", args)])
src <- fromJSON(file.path(dirname(me), "power_monitor_outcome_reference.json"))
studies <- c("S1", "S2", "S3", "S4")

pool <- function(yi, vi) {
  fe <- rma(yi, vi, method = "FE"); dl <- rma(yi, vi, method = "DL")
  list(k = length(yi), yi = yi, sei = sqrt(vi),
       fe = list(estimate = fe$beta[1], se = fe$se, ci_lb = fe$ci.lb, ci_ub = fe$ci.ub, pval = fe$pval),
       re = list(estimate = dl$beta[1], se = dl$se, ci_lb = dl$ci.lb, ci_ub = dl$ci.ub, pval = dl$pval),
       Q = fe$QE, tau2 = dl$tau2)
}
surv <- src$survival$rows; bin <- src$binary$rows; cont <- src$continuous$rows
cox <- t(sapply(studies, function(s) { f <- coxph(Surv(time_months, event) ~ treatment, data = surv[surv$study_id == s, ], ties = "efron"); c(coef(f), vcov(f)[1, 1]) }))
tab <- t(sapply(studies, function(s) { d <- bin[bin$study_id == s, ]; c(sum(d$mace_event[d$treatment == 1]), sum(d$treatment == 1), sum(d$mace_event[d$treatment == 0]), sum(d$treatment == 0)) }))
or <- escalc("OR", ai = tab[, 1], n1i = tab[, 2], ci = tab[, 3], n2i = tab[, 4])
md <- t(sapply(studies, function(s) { d <- cont[cont$study_id == s, ]; a <- d$hamd_change[d$treatment == 1]; b <- d$hamd_change[d$treatment == 0]; c(mean(a) - mean(b), var(a) / length(a) + var(b) / length(b)) }))
# what the page showed before the fix: difference of arm means of the mapped column (event indicator / 0-1 outcome)
armdiff <- function(d, y) t(sapply(studies, function(s) { x <- d[d$study_id == s, ]; a <- x[[y]][x$treatment == 1]; b <- x[[y]][x$treatment == 0]; c(mean(a) - mean(b), var(a) / length(a) + var(b) / length(b)) }))
ad_s <- armdiff(surv, "event"); ad_b <- armdiff(bin, "mace_event")
out <- list(
  versions = list(R = R.version.string, metafor = as.character(packageVersion("metafor")), survival = as.character(packageVersion("survival"))),
  survival = pool(unname(cox[, 1]), unname(cox[, 2])),
  binary = pool(as.numeric(or$yi), as.numeric(or$vi)),
  continuous = pool(unname(md[, 1]), unname(md[, 2])),
  old_arm_mean_difference = list(survival_re = rma(ad_s[, 1], ad_s[, 2], method = "DL")$beta[1], binary_re = rma(ad_b[, 1], ad_b[, 2], method = "DL")$beta[1]))
writeLines(toJSON(out, digits = NA, auto_unbox = TRUE), file.path(dirname(me), "federated_outcome_reference.json"))
cat("RE survival", out$survival$re$estimate, "binary", out$binary$re$estimate, "continuous", out$continuous$re$estimate,
    "| old arm-mean RE survival", out$old_arm_mean_difference$survival_re, "binary", out$old_arm_mean_difference$binary_re, "\n")
