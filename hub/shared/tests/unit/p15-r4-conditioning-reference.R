# Run from wt/ to generate the independent native R reference:
# Rscript hub/shared/tests/unit/p15-r4-conditioning-reference.R
# This writes a retained reference fixture, not a test log or cache.
suppressPackageStartupMessages(library(robumeta))
directory <- "hub/shared/tests/unit"
input_path <- file.path(directory, "p15-r4-conditioning-input.json")
output_path <- file.path(directory, "p15-r4-conditioning-reference.json")
if (file.exists(output_path)) stop("Refusing to overwrite the recorded R reference")
# Explicit inputs keep this oracle runnable with only robumeta and base R.
# The unchanged unit test checks the complete recorded input against the JSON,
# as well as its MD5, so a transcription error cannot silently change the case.
input <- list(rho = 0.8,
  rows = list(
    list(cluster = "a", yi = 0.2, X = list(1, 1990)),
    list(cluster = "a", yi = 0.25, X = list(1, 1991)),
    list(cluster = "b", yi = 0.4, X = list(1, 1995)),
    list(cluster = "b", yi = 0.35, X = list(1, 1995)),
    list(cluster = "c", yi = 0.1, X = list(1, 2004)),
    list(cluster = "d", yi = 0.6, X = list(1, 2003)),
    list(cluster = "e", yi = 0.3, X = list(1, 1999)),
    list(cluster = "f", yi = 0.18, X = list(1, 2010))),
  cases = list(
    list(name = "ordinary", vi = 0.04, centred = FALSE, warn = TRUE),
    list(name = "tiny", vi = 1e20, centred = FALSE, warn = TRUE),
    list(name = "centred ordinary", vi = 0.04, centred = TRUE, warn = FALSE),
    list(name = "centred tiny", vi = 1e20, centred = TRUE, warn = FALSE)))
rows <- input$rows
cases <- lapply(input$cases, function(case) {
  d <- data.frame(cluster = vapply(rows, `[[`, "", "cluster"),
                  yi = vapply(rows, `[[`, 0, "yi"),
                  vi = case$vi,
                  year = vapply(rows, function(r) r$X[[2]], 0))
  if (case$centred) d$year <- d$year - mean(d$year)
  f <- robu(yi ~ year, data = d, studynum = cluster, var.eff.size = vi,
            modelweights = "CORR", rho = input$rho, small = TRUE)
  w <- f$data.full$r.weights
  stopifnot(length(w) == nrow(d), all(is.finite(w)), all(w > 0))
  # Input is already in factor order, as is robu's data.full.
  X <- model.matrix(~ year, data = d)
  M <- crossprod(X, w * X)
  condition <- kappa(M, exact = TRUE)
  stopifnot(is.finite(condition), (condition > 1e-9 / 2^-53) == case$warn)
  list(name = case$name, weights = as.list(w), matrix = unname(split(M, row(M))),
       kappa = condition, tau2 = as.numeric(f$mod_info$tau.sq))
})
reference <- list(
  provenance = list(script = "p15-r4-conditioning-reference.R",
    input_md5 = unname(tools::md5sum(input_path)), R = R.version.string,
    platform = R.version$platform,
    packages = list(robumeta = as.character(packageVersion("robumeta")),
                    base = as.character(packageVersion("base")),
                    stats = as.character(packageVersion("stats")),
                    jsonlite = if (requireNamespace("jsonlite", quietly = TRUE)) {
                      paste(as.character(packageVersion("jsonlite")), "(not used)")
                    } else "not installed (not used)"),
    method = "robumeta::robu(CORR, small=TRUE) fitted r.weights; base::kappa(crossprod(X, w * X), exact=TRUE)",
    serialization = "base R; 17 significant digits"),
  input = input, cases = cases)
# Preserve the R doubles rather than letting JSON formatting round them.
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
  if (is.numeric(x) && is.finite(x))
    return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  stop("Unsupported reference value")
}
writeLines(json(reference), output_path, useBytes = TRUE)
cat(R.version.string, "\nrobumeta", as.character(packageVersion("robumeta")),
    "\njsonlite", reference$provenance$packages$jsonlite, "\n")
for (case in cases) cat(case$name, "kappa =", sprintf("%.17g", case$kappa), "\n")
