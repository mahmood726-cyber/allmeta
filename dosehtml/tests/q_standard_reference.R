# Reference values for tests/test_q_standard.py: the STANDARD Cochran Q heterogeneity test for the page's dose-response
# GLS model y ~ N(X b, V + tau2 I), V block-diagonal (one within-study covariance block per study).
#   Q_E = r0' V^-1 r0,  r0 = y - X b_FE,  b_FE = (X'V^-1 X)^-1 X'V^-1 y   (tau2 = 0: fixed-effect GLS weights)
#   df = n - p,  p = P(chi2_df > Q_E),  I2 = max(0, (Q_E - df) / Q_E) * 100
# This is metafor's rma.mv QE / QEp (QE does not depend on the random-effects structure or tau2) and the
# convention of dosresmeta::qtest (Q from the fit with Psi = 0) and its summary I2 = max(0, (Q - df) / Q).
# A Q evaluated at the estimated random-effects tau2 (what the page reported before) is not chi2(n - p) under H0.
#
# Inputs: y, dose and V of every study, as the page builds them (tests/q_standard_harness.cjs). The model matrix X
# is rebuilt here from dose (quadratic: 1, d, d^2; linear: 1, d), and QE is computed twice -- by direct GLS and by
# metafor::rma.mv -- and the two must agree. The inputs are echoed into the output so the test can confirm that the
# page still builds the same y / dose / V.
#
# Regenerate from dosehtml/tests (R 4.6.0, metafor >= 5):
#   node q_standard_harness.cjs > q_in.json
#   Rscript --no-environ q_standard_reference.R q_in.json q_standard_r460.json
suppressMessages({library(jsonlite); library(metafor)})
a <- commandArgs(trailingOnly = TRUE)
d <- fromJSON(a[1], simplifyVector = FALSE)
bd <- function(blocks) { n <- sum(sapply(blocks, function(b) b$n)); M <- matrix(0, n, n); o <- 0
  for (b in blocks) { k <- b$n; M[o + 1:k, o + 1:k] <- matrix(unlist(b$V), k, k, byrow = TRUE); o <- o + k }; M }
out <- list()
for (lab in names(d)) {
  bl <- d[[lab]]$blocks
  dose <- unlist(lapply(bl, function(b) unlist(b$dose))); y <- unlist(lapply(bl, function(b) unlist(b$y)))
  V <- bd(bl); obs <- seq_along(y)
  res <- list()
  for (model in c("quadratic", "linear")) {
    X <- if (model == "quadratic") cbind(1, dose, dose^2) else cbind(1, dose)
    n <- length(y); p <- ncol(X)
    W <- solve(V); b <- solve(t(X) %*% W %*% X, t(X) %*% W %*% y); r <- y - X %*% b
    QE <- drop(t(r) %*% W %*% r)
    fit <- rma.mv(y, V, mods = X[, -1, drop = FALSE], random = ~ 1 | obs, method = "REML")
    if (abs(fit$QE - QE) > 1e-8 * QE) stop(sprintf("%s %s: direct QE %.15g != metafor QE %.15g", lab, model, QE, fit$QE))
    df <- n - p
    if (fit$k - fit$p != df) stop("df mismatch")
    res[[model]] <- list(QE = QE, metafor_QE = fit$QE, df = df, p = pchisq(QE, df, lower.tail = FALSE),
      metafor_QEp = fit$QEp, I2 = max(0, (QE - df) / QE) * 100)
  }
  out[[lab]] <- list(blocks = bl, res = res)
}
out$R <- R.version.string; out$metafor <- as.character(packageVersion("metafor"))
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = FALSE), a[2])
