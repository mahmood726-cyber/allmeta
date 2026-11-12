# Reference values for tests/engine/upperTail.test.js: R 4.6.0, lower.tail = FALSE (no packages beyond jsonlite).
# Run from HTA/tests/reference:  Rscript --no-environ upper_tail_reference.R
library(jsonlite)
f <- function(...) list(...)
out <- list(
  R = R.version.string,
  metareg_qm = f(stat = 5168.757575757576, df = 1, p = pchisq(5168.757575757576, 1, lower.tail = FALSE)),
  mr_ivw_q   = f(stat = 3000, df = 4, p = pchisq(3000, 4, lower.tail = FALSE)),
  gray       = f(stat = 18.94270480489817, df = 1, p = pchisq(18.94270480489817, 1, lower.tail = FALSE)),
  rmst_z     = f(stat = 2.9792765713993137, p = 2 * pnorm(2.9792765713993137, lower.tail = FALSE)),
  fe_z       = f(stat = 31.671487630794214, p = 2 * pnorm(31.671487630794214, lower.tail = FALSE)),
  egger_t    = f(stat = 2.3469387755102034, df = 1, p = 2 * pt(2.3469387755102034, 1, lower.tail = FALSE)),
  chi2_lower = f(x = c(0.5, 3.841459, 10.8276, 30), df = 1, p = pchisq(c(0.5, 3.841459, 10.8276, 30), 1)),
  t_df1      = f(t = c(1, 2, 4, 6.3138, 12.706), df = 1, p2 = 2 * pt(c(1, 2, 4, 6.3138, 12.706), 1, lower.tail = FALSE)),
  norm_lower = f(z = c(-3, -0.5, 0, 0.5, 1.959963984540054, 3), p = pnorm(c(-3, -0.5, 0, 0.5, 1.959963984540054, 3))),
  gamma_upper = f(x = c(0.5, 3, 60, 120), shape = c(2, 2, 30, 100), p = pgamma(c(0.5, 3, 60, 120), c(2, 2, 30, 100), lower.tail = FALSE)),
  bma_gamma_surv = f(t = 60, shape = 30, rate = 1, p = pgamma(60, 30, 1, lower.tail = FALSE)),
  chisq_large = f(x = c(454, 500, 1000), df = c(1, 1, 100), p = pchisq(c(454, 500, 1000), c(1, 1, 100), lower.tail = FALSE))
)
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE), "upper_tail_r460.json")
