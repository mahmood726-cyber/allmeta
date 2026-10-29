# Run the shipped live-validator scripts and apply the unchanged live comparison
# rules to every quantity emitted from the actual DOM snapshot.
suppressPackageStartupMessages(library(jsonlite))
results <- list()
for (case in c("plant", "control")) for (model in c("FE", "DL", "PM")) {
  name <- paste(case, model, sep = "-")
  prefix <- file.path(dirname(tempdir()), paste0("p16-r3-live-", name))
  e <- new.env()
  outcome <- tryCatch({
    if (!file.exists(paste0(prefix, ".json")) || !file.exists(paste0(prefix, ".R")))
      stop("Missing live snapshot/script; run p16-live-replay.mjs first: ", name)
    app <- fromJSON(paste0(prefix, ".json"), simplifyVector = FALSE)
    capture.output(sys.source(paste0(prefix, ".R"), envir = e))
    keys <- vapply(app$values, function(v) v$key, "")
    stopifnot(!anyDuplicated(keys), setequal(keys, names(e$flat)))
    failures <- character(); failed_keys <- character()
    for (v in app$values) {
      key <- v$key; actual <- v$value; expected <- e$flat[[key]]
      kind <- app$rules$kind[[key]]
      tol <- app$rules$tolerance[[key]]
      if (is.null(tol)) tol <- app$rules$tolerance$default
      ok <- if (is.null(actual)) length(expected) == 1 && is.na(expected)
        else if (kind == "exact") identical(as.character(actual), as.character(expected))
        else if (length(expected) != 1 || is.na(expected)) FALSE
        else if (kind == "abs") abs(actual - expected) <= tol
        else abs(actual - expected) / max(1, abs(expected)) <= tol
      if (!isTRUE(ok)) {
        failed_keys <- c(failed_keys, key)
        failures <- c(failures, paste(key, "app", actual, "R", expected))
      }
    }
    list(ok = !length(failures), checks = length(keys), passed = length(keys) - length(failures),
      non_display_checks = sum(!startsWith(keys, "display.")),
      non_display_failed = sum(!startsWith(failed_keys, "display.")), failures = failures)
  }, error = function(err) list(ok = FALSE, error = conditionMessage(err)))
  results[[name]] <- outcome
  cat("P16_LIVE_R", name, toJSON(outcome, auto_unbox = TRUE, digits = 17), "\n")
}
versions <- list(R = R.version.string, netmeta = as.character(packageVersion("netmeta")),
  metafor = as.character(packageVersion("metafor")), jsonlite = as.character(packageVersion("jsonlite")))
write_json(list(versions = versions, results = results),
  file.path(dirname(tempdir()), "p16-r3-live-results.json"), auto_unbox = TRUE, digits = 17, pretty = TRUE)
cat("P16_LIVE_R_VERSIONS", toJSON(versions, auto_unbox = TRUE), "\n")
stopifnot(all(vapply(results, function(x) isTRUE(x$ok), logical(1))))
