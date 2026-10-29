# Run from wt/: Rscript hub/shared/tests/unit/p07-translation-reference.R
# Generate once before changing the engine; do not rebaseline after a JS change.
suppressPackageStartupMessages(library(metafor))
fixture_dir <- "hub/shared/tests/unit"
reference_path <- file.path(fixture_dir, "p07-translation-reference.json")
if (file.exists(reference_path)) stop("Refusing to overwrite the recorded R reference")
# Keep the six input rows explicit so the oracle needs only metafor and base R.
# The unit test checks these recorded rows against the JS input, as well as its MD5.
input <- list(
  offsets = c(0, 1, -1, 1000, -1000, 1000000, -1000000),
  rows = data.frame(cluster = rep(c("A", "B", "C"), each = 2),
                    y = c(-1.25, -0.75, 0.25, 0.75, 1.75, 2.25),
                    v = rep(0.0625, 6)))

# Encode only the finite numbers, strings and lists used by this fixture.
# 17 significant digits retain the native R doubles; no values are rounded by hand.
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
  if (is.numeric(x) && is.finite(x)) {
    return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  }
  stop("Unsupported value in native R reference")
}

fits <- lapply(input$offsets, function(offset) {
  d <- input$rows
  d$y <- d$y + offset
  d$id <- seq_len(nrow(d))
  f <- rma.mv(y, v, random = ~ 1 | cluster/id, data = d,
              method = "REML", control = list(rel.tol = 1e-10))
  values <- list(mu = as.numeric(coef(f)), se = as.numeric(f$se),
                 ciLo = as.numeric(f$ci.lb), ciHi = as.numeric(f$ci.ub),
                 sigma2Between = f$sigma2[1], sigma2Within = f$sigma2[2],
                 logLik = as.numeric(logLik(f)))
  stopifnot(all(is.finite(unlist(values))))
  list(offset = offset, values = values)
})
reference <- list(
  provenance = list(script = "p07-translation-reference.R",
                    input = "p07-translation-input.json",
                    input_md5 = unname(tools::md5sum(file.path(fixture_dir, "p07-translation-input.json"))),
                    R = R.version.string, metafor = as.character(packageVersion("metafor")),
                    jsonlite = if (requireNamespace("jsonlite", quietly = TRUE)) {
                      paste(as.character(packageVersion("jsonlite")), "(not used)")
                    } else "not installed (not used)",
                    serialization = "base R; 17 significant digits",
                    packages = lapply(c("metafor", "metadat", "Matrix", "nlme", "numDeriv"), function(pkg) {
                      list(package = pkg, version = as.character(packageVersion(pkg)))
                    }),
                    method = "metafor::rma.mv(y, v, random = ~ 1 | cluster/id, method = REML, control = list(rel.tol = 1e-10))"),
  input = list(offsets = input$offsets,
               rows = lapply(seq_len(nrow(input$rows)), function(i) as.list(input$rows[i, ]))),
  fits = fits)
# This is the required reference fixture, not a test log or cache.
encoded <- json(reference)
writeLines(encoded, reference_path, useBytes = TRUE)
cat(encoded, "\n")
