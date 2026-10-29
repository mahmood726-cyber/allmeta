# Run from wt/: Rscript hub/shared/tests/unit/p20-csv-means-reference.R
# This creates an immutable reference fixture, not a test log or cache.
suppressPackageStartupMessages(library(metafor))
fixture_dir <- "hub/shared/tests/unit"
input_path <- file.path(fixture_dir, "p20-csv-means-input.csv")
reference_path <- file.path(fixture_dir, "p20-csv-means-reference.json")
if (file.exists(reference_path)) stop("Refusing to overwrite the recorded R reference")
input <- read.csv(input_path, stringsAsFactors = FALSE)

# Base R serialization avoids an optional jsonlite dependency and preserves doubles.
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
  if (is.numeric(x) && is.finite(x))
    return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  stop("Unsupported value in R reference")
}

fits <- lapply(seq_len(nrow(input)), function(i) {
  r <- input[i, ]
  smd <- escalc(measure = "SMD", m1i = r$m1, sd1i = r$sd1, n1i = r$n1,
                m2i = r$m2, sd2i = r$sd2, n2i = r$n2, correct = TRUE, vtype = "LS")
  md <- escalc(measure = "MD", m1i = r$m1, sd1i = r$sd1, n1i = r$n1,
               m2i = r$m2, sd2i = r$sd2, n2i = r$n2)
  list(case = r$case, input = as.list(r[c("m1", "sd1", "n1", "m2", "sd2", "n2")]),
       g = as.numeric(smd$yi), vi = as.numeric(smd$vi), md = as.numeric(md$yi))
})
reference <- list(
  provenance = list(
    script = "p20-csv-means-reference.R", input = "p20-csv-means-input.csv",
    input_md5 = unname(tools::md5sum(input_path)), R = R.version.string,
    metafor = as.character(packageVersion("metafor")),
    packages = lapply(c("metafor", "metadat", "Matrix", "nlme", "numDeriv"), function(pkg) {
      list(package = pkg, version = as.character(packageVersion(pkg)))
    }),
    method = 'metafor::escalc(measure="SMD", correct=TRUE, vtype="LS"); escalc(measure="MD")',
    serialization = "base R; 17 significant digits"),
  fits = fits)
encoded <- json(reference)
writeLines(encoded, reference_path, useBytes = TRUE)
cat(encoded, "\n")
