# Run from wt/. This immutable oracle is generated BEFORE the application fix.
dir <- "hub/shared/tests/unit"
input_path <- file.path(dir, "p09-beta-input.json")
output_path <- file.path(dir, "p09-beta-reference.json")
if (file.exists(output_path)) stop("Refusing to overwrite native R reference")
# Only input data are duplicated here. The test verifies every row against the
# JSON input; reference answers are always computed by native stats below.
# No third-party JSON package is needed on the runner.
input <- list(intervals = list(
  list(name="balanced-billion", x=500000000, n=1000000000),
  list(name="balanced-trillion", x=500000000000, n=1000000000000),
  list(name="balanced-safe-limit", x=4503599627370495, n=9007199254740990),
  list(name="skew-billion", x=100000000, n=1000000000),
  list(name="skew-trillion", x=100000000000, n=1000000000000),
  list(name="rare-trillion", x=1000000, n=1000000000000),
  list(name="few-trillion", x=8, n=1000000000000),
  list(name="one-trillion", x=1, n=1000000000000),
  list(name="almost-all-trillion", x=999999999999, n=1000000000000),
  list(name="zero-trillion", x=0, n=1000000000000),
  list(name="all-trillion", x=1000000000000, n=1000000000000),
  list(name="balanced-million", x=500000, n=1000000),
  list(name="ordinary", x=5, n=100),
  list(name="balanced-small", x=50, n=100),
  list(name="zero-small", x=0, n=100),
  list(name="all-small", x=100, n=100),
  list(name="one-small", x=1, n=100),
  list(name="almost-all-small", x=99, n=100),
  list(name="zero-single", x=0, n=1),
  list(name="all-single", x=1, n=1)
), cdfs = list(
  list(name="center-billion", x=0.5, a=500000000, b=500000001),
  list(name="center-trillion", x=0.5, a=500000000000, b=500000000001),
  list(name="tail-trillion", x=0.499999, a=500000000000, b=500000000001),
  list(name="ordinary", x=0.05, a=5, b=96)
))
intervals <- lapply(input$intervals, function(row) {
  x <- row$x; n <- row$n
  list(name = row$name, x = x, n = n,
       lo = if (x == 0) 0 else qbeta(.025, x, n-x+1),
       hi = if (x == n) 1 else qbeta(.975, x+1, n-x))
})
cdfs <- lapply(input$cdfs, function(row) {
  c(row, list(value = pbeta(row$x, row$a, row$b),
              log_prefactor = dbeta(row$x, row$a, row$b, log = TRUE) +
                log(row$x) + log1p(-row$x)))
})
# Base-R serialization preserves all 17 significant digits of the oracle doubles.
encode <- function(x) {
  if (is.list(x)) {
    fields <- vapply(x, encode, character(1))
    if (!is.null(names(x))) return(paste0("{", paste(paste0(
      encodeString(names(x), quote = '"'), ":", fields), collapse = ","), "}"))
    return(paste0("[", paste(fields, collapse = ","), "]"))
  }
  if (is.character(x)) return(encodeString(x, quote = '"'))
  if (is.numeric(x) && length(x) == 1 && is.finite(x))
    return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  stop("Unsupported oracle value")
}
reference <- list(provenance = list(
  R = R.version.string, stats = as.character(packageVersion("stats")),
  jsonlite = if (requireNamespace("jsonlite", quietly=TRUE)) {
    paste(as.character(packageVersion("jsonlite")), "(not used)")
  } else "not installed (not used)",
  metafor = if (requireNamespace("metafor", quietly=TRUE)) {
    paste(as.character(packageVersion("metafor")), "(not used)")
  } else "not installed (not used)",
  input_md5 = unname(tools::md5sum(input_path)),
  script_md5 = unname(tools::md5sum(file.path(dir, "p09-beta-reference.R"))),
  method = "stats::qbeta, stats::pbeta, stats::dbeta; 17 significant digits"),
  intervals = intervals, cdfs = cdfs)
writeLines(encode(reference), output_path, useBytes = TRUE)
cat("Created native R oracle:", length(intervals), "intervals,", length(cdfs), "CDFs\n")
cat(encode(reference$provenance), "\n")
