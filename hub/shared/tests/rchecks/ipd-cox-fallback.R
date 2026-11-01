# R cross-check for the IPD-Meta-Pro log-rank fallback (PR #459).
# Input: written by hub/shared/tests/rchecks/ipd-cox-fallback.mjs from the app's own seeded example.
# The app's fallback for a study with a non-finite Cox fit is effect = (O1 - E1) / V, variance = 1 / V, with O1/E1 the observed and
# expected events in the treated arm and V the log-rank variance. survival::survdiff computes O, E and V independently.
# Prints R_CHECK_PASS only if every comparison passes AND the planted wrong value is detected.
suppressPackageStartupMessages(library(survival))
dir <- "hub/shared/tests/rchecks-out/ipd-cox-fallback"
d <- read.csv(file.path(dir, "arctic.csv"))
app <- read.csv(file.path(dir, "app.csv"))
stopifnot(nrow(d) > 0, all(d$event %in% c(0, 1)), all(d$treatment %in% c(0, 1)), length(unique(d$treatment)) == 2)
sd <- survdiff(Surv(time, event) ~ factor(treatment, levels = c(0, 1)), data = d)
i1 <- 2                                   # second level = treatment 1
O1 <- sd$obs[i1]; E1 <- sd$exp[i1]; V <- if (is.matrix(sd$var)) sd$var[i1, i1] else sd$var
stopifnot(V > 0)
r_effect <- (O1 - E1) / V; r_var <- 1 / V
# The Cox fit the app found non-finite: report what R's coxph does on the same data (informational).
cx <- tryCatch(suppressWarnings(coxph(Surv(time, event) ~ treatment, data = d)), error = function(e) NULL)
cat(sprintf("ARCTIC n=%d events=%d (treated %d, control %d)\n", nrow(d), sum(d$event), sum(d$event[d$treatment == 1]), sum(d$event[d$treatment == 0])))
cat(sprintf("R log-rank: O1=%.10g E1=%.10g V=%.10g -> effect=%.15g variance=%.15g\n", O1, E1, V, r_effect, r_var))
cat(sprintf("app:        effect=%.15g variance=%.15g\n", app$effect, app$variance))
if (!is.null(cx)) cat(sprintf("R coxph on the same data: beta=%.6g se=%.6g\n", coef(cx)[1], sqrt(vcov(cx)[1, 1]))) else cat("R coxph on the same data: error\n")
tol <- 1e-9
ok_effect <- abs(app$effect - r_effect) < tol
ok_var <- abs(app$variance - r_var) < tol * max(1, abs(r_var))
plant <- app$effect + 1e-3                 # planted wrong value must be rejected
plant_detected <- !(abs(plant - r_effect) < tol)
if (plant_detected) cat("PLANT_DETECTED\n")
cat(sprintf("effect %s, variance %s (tolerance %g)\n", if (ok_effect) "match" else "MISMATCH", if (ok_var) "match" else "MISMATCH", tol))
cat(sprintf("R %s; survival %s\n", R.version.string, as.character(packageVersion("survival"))))
if (ok_effect && ok_var && plant_detected) cat("R_CHECK_PASS\n") else quit(status = 1)
