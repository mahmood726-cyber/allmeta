# Re-run the unchanged, retained generator in temporary storage. Never overwrite
# the recorded fixture or its hashes. Run from wt/ with Rscript.
root <- normalizePath(".", winslash = "/")
unit <- "hub/shared/tests/unit"
work <- tempfile("p16-native-reference-")
dir.create(file.path(work, unit), recursive = TRUE)
lf <- function(path) paste0(paste(readLines(path, warn = FALSE), collapse = "\n"), "\n")
for (name in c("p16-dl-input.json", "p16-dl-input.R", "p16-dl-reference.R")) {
  text <- lf(file.path(root, unit, name))
  # The retained fixture records the historical R mirror with CRLF. Recreate
  # that historical serialization only in the temporary R run directory.
  if (name == "p16-dl-input.R") text <- gsub("\n", "\r\n", text, fixed = TRUE)
  con <- file(file.path(work, unit, name), "wb")
  writeBin(charToRaw(text), con)
  close(con)
}
setwd(work)
capture.output(source(file.path(unit, "p16-dl-reference.R")),
               file = file.path(work, "native-reference.log"))
actual <- readLines(file.path(unit, "p16-dl-reference.json"))
expected <- readLines(file.path(root, unit, "p16-dl-reference.json"))
stopifnot(identical(actual, expected))
cat("PASS: fresh native R output exactly matches the retained fixture, including all input/script hashes and versions.\n")
cat(R.version.string, "; stats ", as.character(packageVersion("stats")), "\n", sep = "")
cat("Temporary evidence: ", work, "\n", sep = "")
