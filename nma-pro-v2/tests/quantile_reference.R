# Reference values for tests/test_quantiles.py: R 4.6.0 normal / t / chi-square quantiles and CDFs,
# log-normal survival and hazard, on a fixed grid.  Run from nma-pro-v2/tests:
#   Rscript --no-environ quantile_reference.R
# The grid extends the Pairwiseai/bucher grid (p down to 1e-12; df 100 .. 1e6 for t and chi-square),
# because the page's pchisq switched to Wilson-Hilferty above df 100 and its qt lost its sign at df 1e6.
library(jsonlite)
p  <- c(1e-12, 1e-8, 1e-4, 0.001, 0.01, 0.025, 0.05, 0.1, 0.5, 0.9, 0.95, 0.975, 0.99, 0.999, 1 - 1e-8)
x  <- c(-8, -6, -3, -2.5, -1.96, -1, -0.5, 0, 0.5, 1, 1.645, 1.96, 2.5, 3, 6)
df <- c(1, 2, 3, 4, 5, 10, 30, 100, 120, 200, 500, 1000, 1e4, 1e5, 1e6)
cdf <- c(1, 2, 4, 10, 30, 100, 120, 200, 500, 1000, 1e4, 1e5, 1e6)
conf <- c(0.8, 0.9, 0.95, 0.98, 0.99, 0.999)
cvdf <- c(1, 2, 3, 5, 10, 30, 100)
lt <- c(0.01, 0.1, 0.5, 1, 2, 10, 100, 1e4)
lpar <- list(c(0, 1), c(1, 0.5), c(-0.5, 2))
qc <- lapply(cdf, function(d) qchisq(p, d))
out <- list(
  p = p, x = x, df = df, chidf = cdf, conf = conf, cvdf = cvdf, lt = lt, lpar = lpar,
  qnorm = qnorm(p), pnorm = pnorm(x),
  qt = lapply(df, function(d) qt(p, d)), pt = lapply(df, function(d) pt(x, d)),
  qchisq = qc,
  # lower-tail chi-square CDF at the R quantiles (p <= 0.5 only, where the lower tail keeps precision)
  pchisq = lapply(seq_along(cdf), function(j) pchisq(qc[[j]][p <= 0.5], cdf[j])),
  pchisq_n = sum(p <= 0.5),
  crit_conf = qnorm((1 + conf) / 2),
  crit_t = lapply(cvdf, function(d) qt(0.975, d)),
  slnorm = lapply(lpar, function(v) plnorm(lt, v[1], v[2], lower.tail = FALSE)),
  hlnorm = lapply(lpar, function(v) dlnorm(lt, v[1], v[2]) / plnorm(lt, v[1], v[2], lower.tail = FALSE)),
  erf = 2 * pnorm(x[abs(x) <= 3] * sqrt(2)) - 1, erf_x = x[abs(x) <= 3],
  R = R.version.string)
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE), "quantile_r460.json")
