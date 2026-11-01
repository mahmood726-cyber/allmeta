# Run the shipped live-validator scripts and apply the unchanged live comparison
# rules to every quantity emitted from the actual DOM snapshot.
suppressPackageStartupMessages(library(jsonlite))
manifest_path <- file.path(dirname(tempdir()), "p16-r3-live-generation.json")
if (!file.exists(manifest_path)) stop("Missing fresh live generation manifest; run p16-live-replay.mjs successfully first")
manifest <- fromJSON(manifest_path)
stopifnot(is.character(manifest$generation), length(manifest$generation) == 1L,
  nzchar(manifest$generation), length(manifest$cases) == 6L,
  !anyDuplicated(manifest$cases),
  setequal(manifest$cases, as.vector(outer(c("plant", "control"), c("FE", "DL", "PM"), paste, sep = "-"))))
# No argument retains the complete six-case gate. Refusal controls may select
# one named case while still requiring the entire fresh generation manifest.
selected <- commandArgs(trailingOnly = TRUE)
if (length(selected) > 1L || (length(selected) == 1L && !selected %in% manifest$cases))
  stop("Expected one known live comparison case, or no argument for all six")
if (!length(selected)) selected <- manifest$cases
results <- list()
for (name in selected) {
  prefix <- file.path(dirname(tempdir()), paste0("p16-r3-live-", name))
  e <- new.env()
  outcome <- tryCatch({
    if (!file.exists(paste0(prefix, ".json")) || !file.exists(paste0(prefix, ".R")))
      stop("Missing live snapshot/script; run p16-live-replay.mjs first: ", name)
    app <- fromJSON(paste0(prefix, ".json"), simplifyVector = FALSE)
    if (!identical(app$generation, manifest$generation) ||
        !identical(readLines(paste0(prefix, ".R"), n = 1L, warn = FALSE),
          paste0("# P16 snapshot generation: ", manifest$generation)))
      stop("Stale or mixed live snapshot generation; regenerate all six cases: ", name)
    capture.output(sys.source(paste0(prefix, ".R"), envir = e))
    keys <- vapply(app$values, function(v) v$key, "")
    # A self-consistent empty snapshot and empty reference must never count as parity.
    # Require all six structural splits plus displayed results from the actual page.
    if (length(keys) < 7L || anyDuplicated(keys) ||
        sum(!startsWith(keys, "display.")) < 6L ||
        sum(startsWith(keys, "display.")) < 1L)
      stop("Insufficient native-R comparison coverage: required split and display values absent")
    stopifnot(setequal(keys, names(e$flat)))
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
