# Regenerate the nine-case oracle in a temporary directory without replacing it.
# Run from the source root with Rscript meta-regression/tests/review-p08/replay-reference.R.
destination <- file.path(tempdir(), "p08-reference-replay.json")
script <- "meta-regression/tests/review-p08/reference-metafor.R"
scope <- new.env(parent = globalenv())
for (expr in parse(script)) {
  if (is.call(expr) && identical(expr[[1]], as.name("<-")) &&
      identical(expr[[2]], as.name("output_path"))) {
    scope$output_path <- destination
  } else {
    eval(expr, scope)
  }
}
original <- readLines("meta-regression/tests/review-p08/reference-metafor.json", warn = FALSE)
fresh <- readLines(destination, warn = FALSE)
stopifnot(identical(original, fresh))
cat("PASS: all nine cases, all full-precision fields and R/package versions match the unchanged fixture exactly.\n")
