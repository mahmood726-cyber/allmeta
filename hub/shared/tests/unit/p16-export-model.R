# Run every original export check, but partition the six cases across wrapper
# commands so no one command needs to finish all six within the 20-minute cap.
# The historical fixture and its generating collector remain untouched.
p16_export_model <- function(model) {
  stopifnot(model %in% c("FE", "DL", "PM"))
  results <- list()
  for (case in c("plant", "control")) {
    label <- paste(case, model, sep = "-")
    e <- new.env()
    e$quit <- function(...) stop("export reported mismatches")
    outcome <- tryCatch({
      capture.output(sys.source(file.path(dirname(tempdir()), paste0("p16-r3-", label, ".R")), envir = e))
      stopifnot(e$n_checks == 329L, e$n_ok == 329L)
      list(ok = TRUE, checks = e$n_checks, passed = e$n_ok)
    }, error = function(err) list(ok = FALSE, checks = e$n_checks, passed = e$n_ok,
      error = conditionMessage(err), mismatches = e$bad))
    results[[label]] <- outcome
    cat("P16_R_EXPORT", label, jsonlite::toJSON(outcome, auto_unbox = TRUE, digits = 17), "\n")
  }
  versions <- list(R = R.version.string, netmeta = as.character(packageVersion("netmeta")),
    metafor = as.character(packageVersion("metafor")), jsonlite = as.character(packageVersion("jsonlite")))
  jsonlite::write_json(list(versions = versions, results = results),
    file.path(dirname(tempdir()), paste0("p16-r3-export-results-", model, ".json")),
    auto_unbox = TRUE, digits = 17, pretty = TRUE)
  cat("P16_R_VERSIONS", jsonlite::toJSON(versions, auto_unbox = TRUE), "\n")
  stopifnot(all(vapply(results, function(x) isTRUE(x$ok), logical(1))))
}
