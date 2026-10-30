# Execute the retained R generator in an isolated LF copy. Never overwrite the oracle.
source_root <- normalizePath(".", winslash = "/")
scratch <- tempfile("p05-native-review-", tmpdir = dirname(tempdir()))
dir.create(scratch)
unit <- "hub/shared/tests/unit"
paths <- c(file.path(unit, c("p05-qprofile-input.json", "p05-qprofile-input.csv",
  "p05-qprofile-prepare.mjs", "p05-qprofile-reference.R")),
  "heterogeneity/validate/corpus/corpus.json")
for (path in paths) {
  target <- file.path(scratch, path)
  dir.create(dirname(target), recursive = TRUE, showWarnings = FALSE)
  original <- file.path(source_root, path)
  text <- rawToChar(readBin(original, what = "raw", n = file.info(original)$size))
  # Preserve the final-newline state too: the publication corpus has no final LF.
  writeBin(charToRaw(gsub("\r\n", "\n", text, fixed = TRUE, useBytes = TRUE)), target)
}
setwd(scratch)
source(file.path(unit, "p05-qprofile-reference.R"), encoding = "UTF-8")
# Compare a fresh native run with the retained fixture; never replace that fixture.
retained <- jsonlite::fromJSON(file.path(source_root, unit, "p05-qprofile-reference.json"),
                              simplifyVector = FALSE)
stopifnot(length(reference$fits) == length(retained$fits))
max_difference <- 0
for (i in seq_along(reference$fits)) {
  fresh <- reference$fits[[i]]
  old <- retained$fits[[i]]
  for (key in c("id", "text", "empty", "alpha")) stopifnot(identical(fresh[[key]], old[[key]]))
  for (key in c("yi", "sei")) {
    values <- unlist(old[[key]])
    stopifnot(length(fresh[[key]]) == length(values), all(fresh[[key]] == values))
  }
  keys <- c("Q0", "qLo", "tau2", "mu", "limits")
  a <- unlist(fresh[keys]); b <- unlist(old[keys])
  stopifnot(identical(names(a), names(b)), all(is.finite(a)), all(is.finite(b)))
  differences <- abs(a - b)
  stopifnot(all(differences <= 1e-9))
  max_difference <- max(max_difference, differences)
}
for (key in c("input_md5", "script_md5", "csv_md5", "prepare_md5", "corpus_md5")) {
  stopifnot(identical(reference$provenance[[key]], retained$provenance[[key]]))
}
cat("FRESH_VS_RETAINED: 10 fits; exact inputs/status/hashes; absolute tolerance 1e-9; max difference",
    format(max_difference, digits = 17), "\n")
cat("FRESH_REFERENCE:", file.path(scratch, unit, "p05-qprofile-reference.json"), "\n")
cat("FRESH_PROVENANCE:", json(reference$provenance), "\n")
