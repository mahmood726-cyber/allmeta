# Reference values for heterogeneity_sw_normal.test.cjs (R 4.6.0, metafor 5.2.1, meta 8.5.0, jsonlite).
#   Rscript --no-environ heterogeneity_sw_normal_reference.R   (from this folder; writes heterogeneity_sw_normal_reference.json)
# 1. Q-profile CI for tau^2 and I^2 (Viechtbauer 2007): metafor confint(rma(yi, vi, method = "REML")),
#    with uniroot tolerance 1e-13 instead of the default .Machine$double.eps^0.25, so the reference roots
#    are accurate to well below the test tolerance. Datasets: the page's nine example data sets (study
#    effects / variances from the page's two-stage analysis, frozen in studies_examples.json) and
#    synthetic edge cases (Q(0) below both quantiles, between them, k = 2, an upper root beyond 100).
# 2. Test-based I^2 CI (Higgins & Thompson 2002, as meta's lower.I2 / upper.I2: meta:::isquared).
# 3. shapiro.test (Royston 1995, AS R94) on sorted and unsorted inputs, n = 3 .. 60, ties, skewed data.
# 4. qnorm / pnorm with sd = 0 (R: qnorm(p, m, 0) = m; pnorm(x, m, 0) = step at m) and with sd < 0 (NaN).
suppressMessages({ library(jsonlite); library(metafor); library(meta) })
stopifnot(getRversion() == "4.6.0", packageVersion("metafor") == "5.2.1", packageVersion("meta") == "8.5.0")
out <- list(R = as.character(getRversion()), metafor = as.character(packageVersion("metafor")),
            meta = as.character(packageVersion("meta")))
ex <- list()
s <- fromJSON(Sys.getenv("STUDIES_JSON", "studies_examples.json"))
for (nm in names(s)) ex[[nm]] <- list(yi = s[[nm]]$yi, vi = s[[nm]]$vi)
set.seed(20261112)
ex$both_below   <- list(yi = c(0.10, 0.11, 0.09, 0.10, 0.105), vi = c(0.04, 0.05, 0.03, 0.06, 0.05))   # Q(0) < qchisq(0.025, 4)
ex$k2           <- list(yi = c(-0.4, 0.6), vi = c(0.02, 0.03))
ex$k3_wide      <- list(yi = c(-3, 0.5, 4), vi = c(0.1, 0.2, 0.15))
ex$beyond100    <- list(yi = c(-40, 1, 35, -12), vi = c(1, 2, 1.5, 1))                                 # tau2 hat > 10 -> tau2.max = 10 * tau2 hat
ex$random20     <- list(yi = round(rnorm(20, 0.2, 0.35), 4), vi = round(runif(20, 0.01, 0.2), 4))
qp <- list()
for (nm in names(ex)) {
  x <- ex[[nm]]; fit <- rma(x$yi, x$vi, method = "REML")
  ci <- suppressWarnings(confint(fit, control = list(tol = 1e-13, maxiter = 10000)))$random
  w <- 1 / x$vi; vt <- (fit$k - 1) * sum(w) / (sum(w)^2 - sum(w^2))
  qp[[length(qp) + 1]] <- list(name = nm, yi = x$yi, vi = x$vi, tau2 = fit$tau2, Q = fit$QE, vt = vt,
    tau2_lb = unname(ci["tau^2", "ci.lb"]), tau2_ub = unname(ci["tau^2", "ci.ub"]),
    I2_lb = unname(ci["I^2(%)", "ci.lb"]), I2_ub = unname(ci["I^2(%)", "ci.ub"]))
}
out$qprofile <- qp
ht <- list()
for (k in c(2, 3, 4, 5, 8, 12, 30)) for (Q in c(0.2, 0.9, 1, 1.5, 2, 2.5, 3, 4, 6, 10, 13.17279306184401, 25, 80)) {
  r <- meta:::isquared(Q, k - 1, 0.95)
  ht[[length(ht) + 1]] <- list(Q = Q, k = k, I2 = 100 * max(0, (Q - (k - 1)) / Q),
                               lower = 100 * r$lower, upper = 100 * r$upper)   # NA where meta leaves it undefined
}
out$ht <- ht
sw <- list()
add <- function(nm, x) { t <- shapiro.test(x); sw[[length(sw) + 1]] <<- list(name = nm, x = x, W = unname(t$statistic), p = t$p.value) }
add("n3", c(1, 2, 4)); add("n3_eq", c(-1, 0, 1)); add("n4", c(0.3, -1.2, 2.5, 0.1)); add("n5", c(5, 1, 3, 2, 9))
add("n6", c(0.2, 0.25, 0.3, 2.9, 0.22, 0.21)); add("n11", round(rexp(11), 4)); add("n12", round(rnorm(12), 4))
add("n20_ties", c(rep(1, 6), rep(2, 7), rep(3, 7))); add("n30_skew", round(rlnorm(30), 4))
add("n60", round(rnorm(60, 10, 3), 4)); add("n8_sorted", sort(round(rnorm(8), 4)))
add("survival_effects_unsorted", ex$survival$yi)
out$shapiro <- sw
nq <- list()
for (p in c(0, 0.025, 0.5, 0.975, 1)) for (sd in c(0, -1)) nq[[length(nq) + 1]] <- list(p = p, mean = 1.5, sd = sd, q = suppressWarnings(qnorm(p, 1.5, sd)))
out$qnorm_sd <- nq
np <- list()
for (x in c(-2, 1.5, 3)) for (sd in c(0, -1)) np[[length(np) + 1]] <- list(x = x, mean = 1.5, sd = sd, p = suppressWarnings(pnorm(x, 1.5, sd)))
out$pnorm_sd <- np
# na = "string": NA -> "NA", NaN -> "NaN", +-Inf -> "Inf" / "-Inf" (the test maps them back)
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE, na = "string"), "heterogeneity_sw_normal_reference.json")
cat("qprofile", length(qp), "ht", length(ht), "shapiro", length(sw), "qnorm_sd", length(nq), "pnorm_sd", length(np), "\n")
for (r in qp) cat(sprintf("%-24s tau2 [%.10g, %.10g] I2 [%.6f, %.6f]\n", r$name, r$tau2_lb, r$tau2_ub, r$I2_lb, r$I2_ub))
for (r in sw) cat(sprintf("%-26s W %.10f p %.6g\n", r$name, r$W, r$p))
