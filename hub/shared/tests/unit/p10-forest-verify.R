# Read-only replay: Rscript hub/shared/tests/unit/p10-forest-verify.R (from wt/).
# Run the retained generator in R's temporary directory; never replace its oracle.
verify <- function() {
  original <- getwd()
  folder <- "hub/shared/tests/unit"
  script <- normalizePath(file.path(folder, "p10-forest-reference.R"), mustWork = TRUE)
  input_path <- file.path(folder, "p10-forest-input.json")
  recorded <- jsonlite::fromJSON(file.path(folder, "p10-forest-reference.json"))
  checkout <- tempfile("p10-r-oracle-")
  dir.create(file.path(checkout, folder), recursive = TRUE)
  on.exit({
    setwd(original)
    unlink(checkout, recursive = TRUE)
  }, add = TRUE)

  # Provenance uses LF bytes, regardless of the platform's checkout convention.
  input <- readChar(input_path, file.info(input_path)$size, useBytes = TRUE)
  canonical <- gsub("\r\n", "\n", input, fixed = TRUE)
  writeBin(charToRaw(canonical), file.path(checkout, folder, "p10-forest-input.json"))
  setwd(checkout)
  invisible(capture.output(sys.source(script, envir = new.env())))
  fresh <- jsonlite::fromJSON(file.path(folder, "p10-forest-reference.json"))
  stopifnot(identical(fresh$provenance$input_md5, recorded$provenance$input_md5))
  stopifnot(identical(fresh$input, recorded$input))
  stopifnot(identical(fresh$cases, recorded$cases))
  cat("PASS: fresh native R output exactly matches all retained oracle cases.\n")
  cat(jsonlite::toJSON(fresh$provenance, auto_unbox = TRUE), "\n")
}
verify()
