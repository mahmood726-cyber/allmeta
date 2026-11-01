# Execute the actual app exports; override quit only to collect all six outcomes.
results <- list()
reference <- list()
numeric_fit <- function(f) list(status = f$status, tau2 = f$tau2, splits = f$splits, global = f$global)
for (case in c("plant", "control")) for (model in c("FE", "DL", "PM")) {
  label <- paste(case, model, sep = "-")
  e <- new.env()
  e$quit <- function(...) stop("export reported mismatches")
  outcome <- tryCatch({
    capture.output(sys.source(file.path(dirname(tempdir()), paste0("p16-r3-", label, ".R")), envir = e))
    list(ok = TRUE, checks = e$n_checks, passed = e$n_ok)
  }, error = function(err) list(ok = FALSE, checks = e$n_checks, passed = e$n_ok, error = conditionMessage(err), mismatches = e$bad))
  results[[label]] <- outcome
  if (isTRUE(outcome$ok)) reference[[label]] <- list(rows = e$d, treatments = e$treatments,
    full = numeric_fit(e$full), drops = lapply(e$loo, numeric_fit))
  cat("P16_R_EXPORT", label, jsonlite::toJSON(outcome, auto_unbox = TRUE, digits = 17), "\n")
}
versions <- list(R = R.version.string, netmeta = as.character(packageVersion("netmeta")),
  metafor = as.character(packageVersion("metafor")), jsonlite = as.character(packageVersion("jsonlite")))
jsonlite::write_json(list(versions = versions,
  results = results), file.path(dirname(tempdir()), "p16-r3-export-results.json"), auto_unbox = TRUE, digits = 17, pretty = TRUE)
jsonlite::write_json(list(versions = versions, cases = reference),
  file.path(dirname(tempdir()), "p16-r3-reference.json"), auto_unbox = TRUE, digits = 17, pretty = TRUE, na = "null")
cat("P16_R_VERSIONS", jsonlite::toJSON(versions, auto_unbox = TRUE), "\n")
stopifnot(all(vapply(results, function(x) isTRUE(x$ok), logical(1))))
