# Run from wt/: Rscript hub/shared/tests/unit/p05-qprofile-reference.R
# Retained reference fixture, not a test log. Never overwrite an existing oracle.
suppressPackageStartupMessages(library(metafor))
directory <- "hub/shared/tests/unit"
script <- file.path(directory, "p05-qprofile-reference.R")
input_path <- file.path(directory, "p05-qprofile-input.json")
output_path <- file.path(directory, "p05-qprofile-reference.json")
if (file.exists(output_path)) stop("Refusing to overwrite the recorded R reference")
# Explicit synthetic inputs avoid an optional JSON package dependency. The unit
# test checks every recorded input against the JSON source, plus both file hashes.
inputs <- list(
  ceiling = list(yi = c(-1000, 1000), vi = c(1, 1)),
  ordinary = list(yi = c(-1, 1), vi = c(1, 1)),
  heterogeneous = list(yi = c(0.8, 0.2, 0.95, -0.1, 0.55, 0.7, 0.05, 0.4),
                       vi = c(0.02, 0.03, 0.015, 0.04, 0.025, 0.02, 0.05, 0.03)),
  homogeneous = list(yi = c(0.2, -0.1, 0.15, 0.05, -0.02),
                     vi = c(0.04, 0.03, 0.025, 0.02, 0.015)),
  identical = list(yi = c(0.2, 0.2, 0.2), vi = c(1, 1, 1)))

# Encode just the finite numbers, strings and lists used by this fixture, keeping
# 17 significant digits from the R doubles. No reference values are hand-entered.
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

cases <- lapply(inputs, function(input) {
  fit <- rma.uni(yi = input$yi, vi = input$vi, method = "PM")
  # Explicitly provide a bracket beyond this review case, retaining QP inversion.
  ci <- confint(fit, type = "QP", control = list(tau2.max = 1e12, tol = 1e-14, maxiter = 1000))$random
  values <- list(tau2PM = unname(fit$tau2),
                 tau2Lo = unname(ci["tau^2", "ci.lb"]),
                 tau2Hi = unname(ci["tau^2", "ci.ub"]),
                 I2Lo = unname(ci["I^2(%)", "ci.lb"]),
                 I2Hi = unname(ci["I^2(%)", "ci.ub"]))
  stopifnot(all(is.finite(unlist(values))))
  list(yi = input$yi, vi = input$vi, values = values)
})
reference <- list(
  provenance = list(R = R.version.string,
                    metafor = as.character(packageVersion("metafor")),
                    jsonlite = if (requireNamespace("jsonlite", quietly = TRUE)) {
                      paste(as.character(packageVersion("jsonlite")), "(not used)")
                    } else "not installed (not used)",
                    serialization = "base R; 17 significant digits",
                    packages = lapply(c("metafor", "metadat", "Matrix", "nlme", "numDeriv"), function(pkg) {
                      list(package = pkg, version = as.character(packageVersion(pkg)))
                    }),
                    script = script, script_md5 = unname(tools::md5sum(script)),
                    input = input_path, input_md5 = unname(tools::md5sum(input_path)),
                    method = "rma.uni(method=PM); confint(type=QP, control=list(tau2.max=1e12, tol=1e-14, maxiter=1000))",
                    disclosure = "Synthetic software regression inputs; no clinical observations."),
  cases = cases)
encoded <- json(reference)
writeLines(encoded, output_path, useBytes = TRUE)
cat(encoded, "\n")
