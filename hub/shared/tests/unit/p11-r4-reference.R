# Independent orthogonal-contrast oracle; run once before changing the exporter.
# This samples score brackets for these fixtures, not a general global certificate.
suppressPackageStartupMessages(library(metafor))
fixture <- "hub/shared/tests/unit/p11-r4-reference.json"
if (file.exists(fixture)) stop("Refusing to rebaseline the native R reference")
# R tempdir() is a child of the platform temporary directory.
source(file.path(dirname(tempdir()), "p11-r4-input.R"))
source("tests/reml_reference.R")
fits <- lapply(input, function(c) {
  y <- unlist(c$yi); v <- unlist(c$vi); ex <- unlist(c$excluded) + 1L
  reference <- reml_reference(y, v)
  list(id=c$id, yi=y, vi=v, full=as.list(reference),
       deletion_tau2=vapply(seq_along(y), function(i) reml_reference(y[-i], v[-i])[["tau2"]], 0.0),
       excluded_tau2=if (length(ex)) reml_reference(y[-ex], v[-ex])[["tau2"]] else NULL)
})
# Use base R formatting to retain all 17 significant digits (no rounded oracle).
json <- function(x) {
  if (is.null(x)) return("null")
  if (is.list(x)) {
    fields <- vapply(x, json, "")
    if (!is.null(names(x))) return(paste0("{", paste(paste0(encodeString(names(x), quote='"'), ":", fields), collapse=","), "}"))
    return(paste0("[", paste(fields, collapse=","), "]"))
  }
  if (length(x) != 1L) return(json(as.list(x)))
  if (is.character(x)) return(encodeString(x, quote='"'))
  stopifnot(is.numeric(x), is.finite(x))
  trimws(formatC(x, digits=17, format="g", decimal.mark="."))
}
# Canonical source bytes for any new reference. The existing fixture is never
# regenerated; p11-r4-provenance.json preserves its historical CRLF identity.
oracle <- "tests/reml_reference.R"
oracle_lf <- tempfile(fileext=".R")
writeBin(charToRaw(gsub("\r\n", "\n", rawToChar(readBin(oracle, "raw", n=file.info(oracle)$size)),
                       fixed=TRUE)), oracle_lf)
oracle_md5 <- unname(tools::md5sum(oracle_lf))
unlink(oracle_lf)
result <- list(provenance=list(R=R.version.string, metafor=as.character(packageVersion("metafor")),
  jsonlite=if (requireNamespace("jsonlite", quietly=TRUE)) {
    paste(as.character(packageVersion("jsonlite")), "(not used)")
  } else "not installed (not used)", script="p11-r4-reference.R",
  oracle=oracle, oracle_md5=oracle_md5,
  serialization="base R; 17 significant digits"), cases=fits)
writeLines(json(result), fixture, useBytes=TRUE)
cat("Recorded", length(fits), "independent native R cases\n")
