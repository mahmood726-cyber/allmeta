# P07-R2: independent reference for typical sampling variance, not a REML fit.
# Run from wt: Rscript hub/shared/tests/fixtures/p07-variance-shares.R
# The trace of the intercept-only weighted residual projection is
# sum_i w_i * sum_{j != i}(w_j) / sum(w). Compute each leave-one-out sum
# directly so the reference does not subtract nearly equal squared sums.
typical <- function(se) {
  w <- 1 / se^2
  trace <- sum(vapply(seq_along(w), function(i) {
    (w[i] / sum(w)) * sum(w[-i])
  }, numeric(1)))
  (length(w) - 1) / trace
}

designs <- list(
  equal_unit = rep(1, 6),
  equal_large = rep(10000, 6),
  unequal_unit = c(1, 2, 3, 1, 2, 3),
  unequal_large = c(1, 2, 3, 1, 2, 3) * 10000,
  dominant_weight = c(1e-10, 1, 1, 1, 1, 1)
)
cases <- lapply(designs, function(se) list(se = se, sigma2_typical = typical(se)))
stopifnot(all(vapply(cases, function(x) is.finite(x$sigma2_typical) &&
                    x$sigma2_typical > 0, logical(1))))
reference <- list(
  provenance = list(R = R.version.string, base = as.character(packageVersion("base")),
                    jsonlite = as.character(packageVersion("jsonlite")),
                    method = "(k-1) / trace(W - w w' / sum(w)); leave-one-out sums"),
  cases = cases
)
path <- "hub/shared/tests/fixtures/p07-variance-shares.json"
encoded <- jsonlite::toJSON(reference, auto_unbox = TRUE, digits = NA, pretty = TRUE)
# Preserve the recorded reference on replay; never silently re-baseline it.
if (file.exists(path)) {
  saved <- jsonlite::fromJSON(path, simplifyVector = FALSE)
  current <- jsonlite::fromJSON(encoded, simplifyVector = FALSE)
  stopifnot(identical(saved$cases, current$cases))
} else {
  writeLines(encoded, path, useBytes = TRUE)
}
cat(encoded, "\n")
