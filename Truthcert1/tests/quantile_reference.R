# Reference values for tests/test_quantiles.py: R 4.6.0 qnorm / pnorm / qt on a fixed grid.
# Run from Truthcert1/tests:  Rscript --no-environ quantile_reference.R
library(jsonlite)
p <- c(1e-8, 1e-4, 0.001, 0.01, 0.025, 0.05, 0.1, 0.5, 0.9, 0.95, 0.975, 0.99, 0.999, 1 - 1e-8)
x <- c(-6, -3, -2.5, -1.96, -1, -0.5, 0, 0.5, 1, 1.645, 1.96, 2.5, 3, 6)
df <- c(1, 2, 3, 4, 5, 10, 30, 100, 1000)
out <- list(p = p, x = x, df = df, qnorm = qnorm(p), pnorm = pnorm(x),
            qt = lapply(df, function(d) qt(p, d)), R = R.version.string)
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE), "quantile_r460.json")
# Added for Pairwiseai: chi-square quantiles and the regularised incomplete beta.
cdf <- c(1, 2, 4, 10, 30)
out$pt <- lapply(df, function(d) pt(x, d))
out$chidf <- cdf
out$qchisq <- lapply(cdf, function(d) qchisq(p, d))
ab <- list(c(10, 0.5), c(0.5, 10), c(2, 3), c(50, 0.5), c(0.5, 0.5))
bx <- c(0.001, 0.1, 0.5, 0.9, 0.999)
out$beta_ab <- ab
out$beta_x <- bx
out$pbeta <- lapply(ab, function(v) pbeta(bx, v[1], v[2]))
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE), "quantile_r460.json")
