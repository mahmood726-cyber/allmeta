# Run once from wt/ after p05-qprofile-prepare.mjs; never overwrite/rebaseline the oracle.
# The pass-1 attempt stopped before writing a reference because jsonlite was unavailable.
suppressPackageStartupMessages(library(metafor))
dir <- "hub/shared/tests/unit"
input_path <- file.path(dir, "p05-qprofile-input.json")
csv_path <- file.path(dir, "p05-qprofile-input.csv")
prepare_path <- file.path(dir, "p05-qprofile-prepare.mjs")
script_path <- file.path(dir, "p05-qprofile-reference.R")
corpus_path <- "heterogeneity/validate/corpus/corpus.json"
output_path <- file.path(dir, "p05-qprofile-reference.json")
if (file.exists(output_path)) stop("Refusing to overwrite the recorded R reference")
# The CSV bridge copies exact JSON input strings; the unit test verifies every
# recorded text and parsed double against the original JSON/corpus, without rounding.
input_rows <- read.csv(csv_path, colClasses = "character",
                       check.names = FALSE, na.strings = NULL, fileEncoding = "UTF-8")
# The bridge quotes every field. Read quoted values as text before converting:
# scan's numeric reader otherwise sees the quotes around alpha (e.g. "0.05").
input_rows$alpha <- as.numeric(input_rows$alpha)
input_rows$empty <- as.logical(input_rows$empty)
stopifnot(all(is.finite(input_rows$alpha)), all(input_rows$alpha > 0 & input_rows$alpha < 1),
          !anyNA(input_rows$empty))
inputs <- lapply(seq_len(nrow(input_rows)), function(i) as.list(input_rows[i, ]))
# Base-R 17-digit formatting preserves doubles (jsonlite digits=NA does not).
json <- function(x) {
  if (is.list(x)) {
    fields <- vapply(x, json, character(1))
    if (!is.null(names(x))) {
      fields <- paste0(encodeString(names(x), quote = '"'), ":", fields)
      return(paste0("{", paste(fields, collapse = ","), "}"))
    }
    return(paste0("[", paste(fields, collapse = ","), "]"))
  }
  if (length(x) != 1L) return(json(as.list(x)))
  if (is.character(x) && !is.na(x)) return(encodeString(x, quote = '"'))
  if (is.logical(x) && !is.na(x)) return(if (x) "true" else "false")
  if (is.numeric(x) && is.finite(x)) return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  stop("Unsupported reference value")
}
fits <- lapply(inputs, function(case) {
  text <- case$text
  rows <- strsplit(text, "\n", fixed = TRUE)[[1]]
  fields <- lapply(rows, function(row) trimws(strsplit(row, ",", fixed = TRUE)[[1]]))
  yi <- vapply(fields, function(row) as.numeric(row[length(row)-1]), numeric(1))
  sei <- vapply(fields, function(row) as.numeric(row[length(row)]), numeric(1))
  fit <- rma(yi = yi, vi = sei*sei, method = "PM", control = list(tol = 1e-12, threshold = 1e-12))
  ci <- confint(fit, type = "QP", level = 100*(1-case$alpha), control = list(tol = 1e-12))
  empty <- isTRUE(ci$ci.null)
  stopifnot(empty == case$empty)
  list(id = case$id, alpha = case$alpha, text = text, yi = yi, sei = sei,
       empty = empty, Q0 = as.numeric(fit$QE), qLo = qchisq(case$alpha/2, length(yi)-1),
       tau2 = as.numeric(fit$tau2), mu = as.numeric(coef(fit)),
       limits = list(tau2Lo = ci$random["tau^2", "ci.lb"], tau2Hi = ci$random["tau^2", "ci.ub"],
                     I2Lo = ci$random["I^2(%)", "ci.lb"], I2Hi = ci$random["I^2(%)", "ci.ub"]))
})
reference <- list(provenance = list(R = R.version.string,
  metafor = as.character(packageVersion("metafor")), metadat = as.character(packageVersion("metadat")),
  jsonlite = if (requireNamespace("jsonlite", quietly = TRUE)) {
    paste(as.character(packageVersion("jsonlite")), "(not used)")
  } else "not installed (not used)", serialization = "base R; 17 significant digits",
  input_md5 = unname(tools::md5sum(input_path)), script_md5 = unname(tools::md5sum(script_path)),
  csv_md5 = unname(tools::md5sum(csv_path)), prepare_md5 = unname(tools::md5sum(prepare_path)),
  corpus_md5 = unname(tools::md5sum(corpus_path)), session = paste(capture.output(sessionInfo()), collapse = "\n"),
  method = "rma(PM, tol=1e-12, threshold=1e-12); confint(type=QP, tol=1e-12)"), fits = fits)
writeLines(json(reference), output_path, useBytes = TRUE)
cat("R:", R.version.string, "; metafor:", as.character(packageVersion("metafor")), "\n")
for (fit in fits) cat(fit$id, "ci.null=", fit$empty, "tau2=", format(fit$tau2, digits=17), "\n")
