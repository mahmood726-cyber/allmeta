# Run from wt/: Rscript hub/shared/tests/unit/p20-csv-means-replay.R
# Execute the unchanged generator in a temporary tree; never replace the reference.
replay <- function() {
  fixture_dir <- "hub/shared/tests/unit"
  generator <- file.path(fixture_dir, "p20-csv-means-reference.R")
  input_path <- file.path(fixture_dir, "p20-csv-means-input.csv")
  reference_path <- file.path(fixture_dir, "p20-csv-means-reference.json")
  recorded <- paste(readLines(reference_path, warn = FALSE), collapse = "\n")
  source_hashes <- tools::md5sum(c(generator, input_path, reference_path))
  original_wd <- getwd()
  temporary <- tempfile("p20-r-replay-")
  dir.create(file.path(temporary, fixture_dir), recursive = TRUE)
  on.exit({ setwd(original_wd); unlink(temporary, recursive = TRUE) }, add = TRUE)
  stopifnot(all(file.copy(c(generator, input_path), file.path(temporary, fixture_dir))))
  setwd(temporary)
  source(generator, local = new.env())
  fresh <- paste(readLines(reference_path, warn = FALSE), collapse = "\n")

  # Tokenize only the generated fits array (strings and JSON numbers). Compare
  # labels exactly and every numeric value at the existing JS tolerance, 1e-12.
  fits_tokens <- function(text) {
    stopifnot(grepl('"fits":\\[', text))
    fits <- sub('^.*"fits":', '', text)
    pattern <- '"[^"\\\\]*"|-?[0-9]+(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?'
    regmatches(fits, gregexpr(pattern, fits, perl = TRUE))[[1]]
  }
  expected <- fits_tokens(recorded)
  actual <- fits_tokens(fresh)
  stopifnot(length(expected) == length(actual))
  numeric <- !startsWith(expected, '"')
  stopifnot(identical(expected[!numeric], actual[!numeric]))
  differences <- abs(as.numeric(expected[numeric]) - as.numeric(actual[numeric]))
  stopifnot(length(differences) == 45L, all(is.finite(differences)), all(differences <= 1e-12))
  md5 <- function(text) sub('^.*"input_md5":"([^"]+)".*$', '\\1', text)
  stopifnot(identical(md5(recorded), md5(fresh)))
  setwd(original_wd)
  stopifnot(identical(source_hashes, tools::md5sum(c(generator, input_path, reference_path))))
  cat("PASS: fresh R replay; 5 cases, 45 numeric values; maximum absolute difference:",
      max(differences), "; original files unchanged\n")
}
replay()
