# Run from wt/: Rscript hub/shared/tests/unit/p19-r2-reference.R
# Reuse the independent QR oracle, without executing its write-once fixture
# generation. Existing scripts and recorded values are never overwritten.
source_path <- "hub/shared/tests/unit/p19-f2-reference.R"
for (expr in parse(source_path)) {
  if (is.call(expr) && identical(expr[[1]], as.name("<-")) &&
      as.character(expr[[2]]) %in% c("html", "example", "texts", "reference_fit", "json")) eval(expr)
}
texts$tiny_saturated <- "a | control | 2e-100 | 1e-100\nb | control | 3e-100 | 1e-100"
reference <- list(provenance = list(
  script = "p19-r2-reference.R", oracle_script = source_path,
  R = R.version.string, stats = as.character(packageVersion("stats")),
  base = as.character(packageVersion("base")),
  method = "stats::lm.wfit QR; uncentered weighted residual Q; generalized DL via QR leverage; solve(crossprod(sqrt(W)*X)) covariance",
  serialization = "base R; 17 significant digits"),
  cases = lapply(texts, reference_fit))
encoded <- json(reference)
destination <- "hub/shared/tests/unit/p19-r2-reference.json"
if (file.exists(destination)) {
  stopifnot(identical(paste(readLines(destination, warn = FALSE), collapse = "\n"), encoded))
  cat("Fresh R replay exactly matches the immutable follow-up reference.\n")
} else {
  # Required oracle fixture, not a test log or cache.
  writeLines(encoded, destination, useBytes = TRUE)
}
cat(encoded, "\n")
