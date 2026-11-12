# Reference values for upper_tails.test.cjs (R 4.6.0, metafor, jsonlite).
#   Rscript --no-environ upper_tails_reference.R      (from this folder; writes upper_tails_reference.json)
# Every p-value here is an upper tail computed by R with lower.tail = FALSE, so it keeps
# relative precision far below 1e-16, where 1 - CDF(x) in the page returned 0 or noise.
suppressMessages({ library(metafor); library(jsonlite) })
stopifnot(getRversion() == "4.6.0")
out <- list(R = as.character(getRversion()), metafor = as.character(packageVersion("metafor")))

# 1. MetaAnalysis.fixedEffect: pooled p (normal) and heterogeneity p (chi-square, k - 1 df)
y <- c(1.10, 1.95, 0.55, 1.60, 0.40, 1.25); v <- c(0.010, 0.012, 0.008, 0.015, 0.011, 0.009)
f <- rma(y, v, method = "FE")
out$fe <- list(y = y, v = v, est = f$b[1], z = f$zval, pval = f$pval, Q = f$QE, QEp = f$QEp)

# 2. MetaAnalysis.randomEffectsDL + applyHKSJ: p from t with k - 1 df (data chosen so that the
#    HKSJ scale factor exceeds 1, so the page's floor max(1, q) is inactive and metafor knha applies)
y2 <- c(6.00, 6.05, 5.97, 6.10, 5.92, 6.03); v2 <- c(1e-4, 1.2e-4, 0.8e-4, 1.5e-4, 1.1e-4, 0.9e-4)
d0 <- rma(y2, v2, method = "DL")
w <- 1 / (v2 + d0$tau2); qadj <- sum(w * (y2 - d0$b[1])^2) / (length(y2) - 1)
stopifnot(qadj > 1)
d <- rma(y2, v2, method = "DL", test = "knha")
out$hksj <- list(y = y2, v = v2, est = d$b[1], tau2 = d$tau2, t = d$zval, df = length(y2) - 1, pval = d$pval)

# 3. FreemanTukeyTransform.metaAnalysis: heterogeneity p (chi-square), Freeman-Tukey double arcsine
#    (metafor measure "PFT" is the same transform and variance 1 / (4 n + 2))
ft <- function(xi, ni) { e <- escalc("PFT", xi = xi, ni = ni); g <- rma(yi, vi, data = e, method = "FE")
  list(events = xi, totals = ni, Q = g$QE, df = length(xi) - 1, QEp = g$QEp) }
out$ft1 <- ft(c(100, 175, 260, 130, 215), rep(500, 5))
out$ft2 <- ft(c(40, 175, 330, 110, 260), rep(500, 5))

# 4. the inlined AlmTail functions themselves, deep in the tails
out$grid <- list(
  pnorm = lapply(c(-3, 0.5, 5, 10, 20, 37.5), function(z) list(z = z, p = pnorm(z, lower.tail = FALSE))),
  pchisq = lapply(list(c(3, 2), c(200, 3), c(1000, 10), c(1400, 2), c(600, 4)), function(a)
    list(x = a[1], df = a[2], p = pchisq(a[1], a[2], lower.tail = FALSE))),
  pt = lapply(list(c(-2, 4), c(10, 5), c(50, 3), c(1000, 10), c(234, 5)), function(a)
    list(t = a[1], df = a[2], p = pt(a[1], a[2], lower.tail = FALSE))))
writeLines(toJSON(out, digits = NA, auto_unbox = TRUE, pretty = TRUE), "upper_tails_reference.json")
cat("fe pval", f$pval, "QEp", f$QEp, "| hksj pval", d$pval, "| ft1 QEp", out$ft1$QEp, "ft2 QEp", out$ft2$QEp, "\n")
