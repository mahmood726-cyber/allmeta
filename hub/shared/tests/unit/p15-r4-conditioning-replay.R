# Run from wt/: Rscript hub/shared/tests/unit/p15-r4-conditioning-replay.R
# Re-run the retained oracle in R's temporary directory. Never overwrite the
# recorded fixture. The emitted JSON includes the fresh R/package versions.
replay <- function() {
  directory <- normalizePath("hub/shared/tests/unit", winslash = "/", mustWork = TRUE)
  script <- file.path(directory, "p15-r4-conditioning-reference.R")
  input_path <- file.path(directory, "p15-r4-conditioning-input.json")
  bytes <- readBin(input_path, "raw", n = file.info(input_path)$size)
  lf <- gsub("\r\n", "\n", rawToChar(bytes), fixed = TRUE)
  scratch <- tempfile("p15-r4-replay-")
  dir.create(file.path(scratch, "hub/shared/tests/unit"), recursive = TRUE)
  original_wd <- getwd()
  on.exit({ setwd(original_wd); unlink(scratch, recursive = TRUE) }, add = TRUE)
  writeBin(charToRaw(lf), file.path(scratch, "hub/shared/tests/unit/p15-r4-conditioning-input.json"))
  setwd(scratch)
  oracle <- new.env()
  sys.source(script, envir = oracle)
  cat("Fresh native R reference (recorded fixture unchanged):\n")
  cat(oracle$json(oracle$reference), "\n")
}
replay()
