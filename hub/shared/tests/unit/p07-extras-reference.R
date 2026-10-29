# Run once from wt/ before editing plus-engine.js.
suppressPackageStartupMessages(library(metafor))
fixture_dir <- "hub/shared/tests/unit"
input_path <- file.path(fixture_dir, "p07-extras-input.json")
script_path <- file.path(fixture_dir, "p07-extras-reference.R")
output_path <- file.path(fixture_dir, "p07-extras-reference.json")
if (file.exists(output_path)) stop("Refusing to overwrite the recorded R reference")
input <- jsonlite::fromJSON(input_path)

# Preserve native doubles without jsonlite's decimal rounding.
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
  if (is.numeric(x) && is.finite(x)) return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  stop("Unsupported value in native R reference")
}

fits <- lapply(input$ties, function(effect) {
  d <- input$rows
  d$y <- effect
  d$id <- seq_len(nrow(d))
  warnings <- character()
  values <- withCallingHandlers({
    f <- rma.mv(y, v, random = ~ 1 | cluster/id, data = d, method = "REML",
                control = list(rel.tol = 1e-10))
    ll <- as.numeric(logLik(f))
    profiles <- lapply(1:2, function(j) {
      ci <- confint(f, sigma2 = j, control = list(tol = 1e-10, maxiter = 1000))
      stopifnot(identical(ci$ub.sign, ""))
      limits <- ci$random[1, ]
      grid <- seq(0, max(limits[3], f$sigma2[j] * 1.5, 1e-8), length.out = 9)
      pr <- profile(f, sigma2 = j, steps = grid, plot = FALSE, progbar = FALSE)
      endpoint_gap <- tail(pr$ll, 1) - (ll - qchisq(.95, 1) / 2)
      stopifnot(all(is.finite(c(limits, pr$ll))), abs(endpoint_gap) < 1e-7)
      list(estimate = f$sigma2[j], lower = unname(limits[2]), upper = unname(limits[3]),
           x = grid, ll = pr$ll, ub_sign = ci$ub.sign, endpoint_gap = endpoint_gap)
    })
    list(effect = effect, logLik = ll, profiles = profiles)
  }, warning = function(w) {
    warnings <<- c(warnings, conditionMessage(w))
    invokeRestart("muffleWarning")
  })
  values$warnings <- as.list(warnings)
  values
})
reference <- list(
  provenance = list(
    script = "p07-extras-reference.R", script_md5 = unname(tools::md5sum(script_path)),
    input = "p07-extras-input.json", input_md5 = unname(tools::md5sum(input_path)),
    R = R.version.string, serialization = "base R; 17 significant digits",
    packages = lapply(c("metafor", "metadat", "Matrix", "nlme", "numDeriv", "jsonlite"), function(pkg) {
      list(package = pkg, version = as.character(packageVersion(pkg)))
    }),
    method = "metafor::rma.mv REML, random = ~ 1 | cluster/id; rel.tol=1e-10; confint tol=1e-10, maxiter=1000; profile at nine marks"),
  input = list(ties = input$ties, rows = lapply(seq_len(nrow(input$rows)), function(i) as.list(input$rows[i, ]))),
  fits = fits)
# Required fixture, not a test log or cache. No validation corpus is modified.
encoded <- json(reference)
writeLines(encoded, output_path, useBytes = TRUE)
cat(encoded, "\n")
