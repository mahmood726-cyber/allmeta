# Reference values for tests/test_upper_tail.py: R 4.6.0, lower.tail = FALSE.
# Run from nma-dose-response-app/tests:  Rscript --no-environ upper_tail_reference.R
library(jsonlite)
out <- list(
  R = R.version.string,
  dbt = list(Q = 484, df = 1, p = pchisq(484, 1, lower.tail = FALSE)),
  chisq_10_5 = pchisq(10, 5),
  norm_196 = pnorm(1.959963984540054)
)
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE), "upper_tail_r460.json")
