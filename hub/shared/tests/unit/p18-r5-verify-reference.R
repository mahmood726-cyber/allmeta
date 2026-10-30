# Re-execute the immutable generator in a temporary directory; never overwrite its fixture.
suppressPackageStartupMessages(library(jsonlite))
root <- normalizePath('.', winslash = '/', mustWork = TRUE)
script <- file.path(root, 'hub/shared/tests/unit/p18-r5-reference.R')
retained <- fromJSON(file.path(root, 'hub/shared/tests/unit/p18-r5-reference.json'), simplifyVector = FALSE)
scratch <- tempfile('p18-r5-reference-')
dir.create(file.path(scratch, 'hub/shared/tests/unit'), recursive = TRUE)
local({
  on.exit(unlink(scratch, recursive = TRUE))
  oldwd <- setwd(scratch)
  on.exit(setwd(oldwd), add = TRUE)
  text <- paste0(paste(readLines(script, warn = FALSE), collapse = '\n'), '\n')
  copy <- 'hub/shared/tests/unit/p18-r5-reference.R'
  con <- file(copy, open = 'wb'); writeBin(charToRaw(text), con); close(con)
  source(copy, local = new.env())
  fresh <- fromJSON('hub/shared/tests/unit/p18-r5-reference.json', simplifyVector = FALSE)
  stopifnot(identical(fresh$provenance$script_md5, retained$provenance$script_md5))
  check <- function(a, b, path) {
    if (is.list(a)) {
      stopifnot(is.list(b), identical(names(a), names(b)), length(a) == length(b))
      for (i in seq_along(a)) check(a[[i]], b[[i]], paste0(path, '/', i))
    } else if (is.numeric(a)) {
      stopifnot(is.numeric(b), length(a) == length(b), all(is.finite(a)), all(is.finite(b)))
      tolerance <- if (grepl('^berkey', path)) 1e-6 else 1e-11
      if (!all(abs(a - b) <= tolerance * pmax(abs(b), .Machine$double.xmin))) stop('R reference mismatch at ', path)
    } else stopifnot(identical(a, b))
  }
  check(fresh$cases, retained$cases, 'cases')
  check(fresh$berkey, retained$berkey, 'berkey')
  cat('Fresh R agrees with all retained scaled cases and Berkey; fixture unchanged.\n')
  cat('Retained provenance:', toJSON(retained$provenance, auto_unbox = TRUE), '\n')
  cat('Fresh provenance:', toJSON(fresh$provenance, auto_unbox = TRUE), '\n')
})
