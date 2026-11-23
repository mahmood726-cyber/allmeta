# Run from wt/: Rscript hub/shared/tests/r/p20-evalue-reference.R
# Prefer an installed package. The runner may not have EValue: in that case use
# unmodified files from the same immutable CRAN mirror revision as the existing
# evalue-input oracle. Download only into the R session's temporary directory.
# No package installation, copied formula, application-derived value or git call.
suppressPackageStartupMessages(library(jsonlite))
source_info <- list(mode="installed namespace")
if (requireNamespace("EValue", quietly=TRUE)) {
  evalue_api <- asNamespace("EValue")
  evalue_version <- as.character(packageVersion("EValue"))
} else {
  revision <- "44c2dc41ce49444619bc2d97c16d87c7caef6f07"
  origin <- paste0("https://raw.githubusercontent.com/cran/EValue/", revision, "/")
  source_dir <- tempfile("p20-evalue-", tmpdir=tempdir())
  dir.create(file.path(source_dir, "R"), recursive=TRUE)
  files <- c("DESCRIPTION", "R/EValue.R", "R/effect_measures.R", "R/utils.R")
  paths <- file.path(source_dir, files)
  for (i in seq_along(files)) {
    download.file(paste0(origin, files[i]), paths[i], mode="wb", quiet=TRUE)
  }
  description <- read.dcf(paths[1])
  stopifnot(description[1,"Package"] == "EValue", description[1,"Version"] == "4.1.4")
  evalue_version <- unname(description[1,"Version"])
  source_info <- list(mode="unmodified pinned package source; not an installed namespace",
    revision=revision, origin=origin,
    md5=as.list(setNames(unname(tools::md5sum(paths)), files)))
  evalue_api <- new.env(parent=globalenv())
  for (path in paths[-1]) sys.source(path, envir=evalue_api)
}
folder <- "hub/shared/tests/r"
input_path <- file.path(folder, "p20-input.json")
input <- read_json(input_path, simplifyVector=FALSE)
cases <- lapply(input$evalue, function(c) {
  lo <- if (is.null(c$lo)) NA_real_ else c$lo
  hi <- if (is.null(c$hi)) NA_real_ else c$hi
  if (c$type == "SMD") {
    # The widget accepts endpoints, not an SE. Transform each supplied d endpoint
    # through the package's MD -> RR conversion, then apply evalues.RR.
    # evalues.MD(se=...) uses its own rounded CI multiplier and is a different input contract.
    to_rr <- eval(quote(function(x) toRR(MD(x))), envir=evalue_api)
    r <- suppressMessages(evalue_api$evalues.RR(to_rr(c$est), to_rr(lo), to_rr(hi)))
  } else {
    f <- get(paste0("evalues.", c$type), envir=evalue_api, inherits=FALSE)
    r <- suppressMessages(f(c$est, lo, hi, rare=c$rare))
  }
  bounds <- r[2, 2:3]
  ci <- if (all(is.na(bounds))) NULL else unname(min(bounds, na.rm=TRUE))
  list(id=c$id, input=c,
       expected=list(point=unname(r[2,1]), ci=ci,
                     rr=list(point=unname(r[1,1]), lo=unname(r[1,2]), hi=unname(r[1,3]))))
})
out <- list(provenance=list(R=R.version.string,
  packages=list(EValue=evalue_version, jsonlite=as.character(packageVersion("jsonlite"))),
  EValue_source=source_info,
  script="p20-evalue-reference.R", script_md5=unname(tools::md5sum(file.path(folder, "p20-evalue-reference.R"))),
  input="p20-input.json", input_md5=unname(tools::md5sum(input_path)), tolerance=1e-6,
  method="Canonical EValue functions: evalues.RR/OR/HR; SMD endpoints via toRR(MD(...)) then evalues.RR",
  disclosure="Synthetic software tests"), cases=cases)
path <- file.path(folder, "p20-evalue-reference.json")
encoded <- toJSON(out, auto_unbox=TRUE, pretty=TRUE, digits=NA, null="null", na="null")
if (file.exists(path)) {
  stopifnot(identical(paste(readLines(path, warn=FALSE), collapse="\n"), as.character(encoded)))
  cat("Verified unchanged EValue reference\n")
} else {
  writeLines(encoded, path, useBytes=TRUE)
  cat("Recorded EValue reference\n")
}
cat(R.version.string, "EValue", evalue_version, source_info$mode, "\n")
