# From wt/: Rscript dta-sroc/tests/fixtures/deeks-reference.R
# Synthetic regression fixtures, not clinical data. No mada comparator is claimed.
# First execution creates the required reference artifact; later executions only
# verify it. Ordinary test output goes to stdout, not to files in the source tree.
stopifnot(requireNamespace("jsonlite", quietly = TRUE))
tp <- c(60, 70, 80, 65, 75, 85)
fp <- c(20, 30, 10, 15, 25, 35)
balanced <- function(n) data.frame(tp = tp, fp = fp, fn = n - tp, tn = n - fp)
ordinary <- data.frame(tp = c(85, 62, 110, 55, 130, 92, 74),
                       fp = c(10, 12, 25, 6, 40, 18, 8),
                       fn = c(15, 18, 40, 8, 30, 25, 12),
                       tn = c(140, 108, 200, 90, 300, 185, 130))
zero <- ordinary
zero$fn[2] <- 0
unequal <- balanced(100)
unequal$tp[1:3] <- c(40, 50, 60)
unequal$fn[1:3] <- 75 - unequal$tp[1:3]
unequal$tn[1:3] <- 150 - unequal$fp[1:3]
corrected <- balanced(100)
corrected[1, ] <- c(0, 20, 99, 79) # +0.5 gives the same ESS as the other rows
near <- function(step) {
  n <- 1e8 + (0:5) * step
  data.frame(tp = tp * 1e6, fp = fp * 1e6,
             fn = n - tp * 1e6, tn = n - fp * 1e6)
}
inputs <- list(constant100 = balanced(100), constant150 = balanced(150),
               constantUnequalGroups = unequal, constantAfterCorrection = corrected,
               nearConstant = near(1), closeEstimable = near(10000),
               ordinary = ordinary, ordinaryZeroCell = zero)
cases <- lapply(names(inputs), function(id) {
  rows <- inputs[[id]]
  z <- rows
  needs_correction <- apply(z == 0, 1, any)
  z[needs_correction, ] <- z[needs_correction, ] + 0.5
  n1 <- z$tp + z$fn
  n0 <- z$fp + z$tn
  ess <- 4 * n1 * n0 / (n1 + n0)
  x <- 1 / sqrt(ess)
  y <- log((z$tp * z$tn) / (z$fp * z$fn))
  fit <- stats::lm(y ~ x, weights = ess, tol = 1e-7)
  estimable <- fit$rank == 2L
  co <- if (estimable) summary(fit)$coefficients else NULL
  list(id = id, rows = rows, rank = fit$rank,
       slopeAliased = is.na(unname(stats::coef(fit)["x"])),
       expected = if (estimable) list(
         slope = unname(co["x", "Estimate"]),
         intercept = unname(co["(Intercept)", "Estimate"]),
         t = unname(co["x", "t value"]), df = fit$df.residual,
         p = unname(co["x", "Pr(>|t|)"])) else NULL)
})
out <- list(R = R.version.string,
            packages = list(stats = as.character(packageVersion("stats")),
                            jsonlite = as.character(packageVersion("jsonlite"))),
            method = "stats::lm(y ~ x, weights = ESS, tol = 1e-7); y = ln(DOR), x = 1/sqrt(ESS); +0.5 only to rows with a zero cell",
            cases = cases)
destination <- "dta-sroc/tests/fixtures/deeks-reference.json"
encoded <- jsonlite::toJSON(out, pretty = TRUE, auto_unbox = TRUE,
                           digits = NA, na = "null", null = "null", dataframe = "rows")
if (file.exists(destination)) {
  reference <- jsonlite::fromJSON(destination, simplifyVector = FALSE)
  actual <- jsonlite::fromJSON(encoded, simplifyVector = FALSE)
  stopifnot(identical(reference, actual))
  cat("Existing Deeks reference verified; no fixture overwritten.\n")
} else {
  writeLines(encoded, destination, useBytes = TRUE)
  cat("Created Deeks R reference fixture.\n")
}
cat(R.version.string, "\n")
cat("stats", out$packages$stats, "; jsonlite", out$packages$jsonlite, "\n")
for (case in cases) {
  cat(case$id, ": rank =", case$rank, "; slope aliased =", case$slopeAliased, "\n")
  if (!is.null(case$expected)) print(case$expected, digits = 17)
}
