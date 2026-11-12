# Reference values for tests/test_upper_tail.py: R 4.6.0, lower.tail = FALSE.
# The statistics (z, t, Q) are the page's own, as printed by tests/upper_tail_harness.cjs; only the p-values are R's.
# Run from Pairwiseai/tests:  Rscript --no-environ upper_tail_reference.R
library(jsonlite)
out <- list(
  R = R.version.string,
  fe    = list(z = 15.244672428530023, p = 2 * pnorm(15.244672428530023, lower.tail = FALSE)),
  small = list(z = 1.3806905179316278, p = 2 * pnorm(1.3806905179316278, lower.tail = FALSE)),
  hksj  = list(t = 12.169350382905813, df = 3, p = 2 * pt(12.169350382905813, 3, lower.tail = FALSE)),
  het   = list(Q = 4.546629213483145, df = 3, p = pchisq(4.546629213483145, 3, lower.tail = FALSE))
)
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE), "upper_tail_r460.json")
