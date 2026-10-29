# Run from wt/ after node hub/shared/tests/unit/p08-r-export-fixture.mjs.
# The first run records an immutable native R reference and pre-fix evidence.
# Later runs verify the current exact exports without overwriting the fixture.
suppressPackageStartupMessages(library(metafor))
work_dir <- file.path(dirname(tempdir()), "allmeta-p08-r3")
source(file.path(work_dir, "cases.R"), encoding = "UTF-8")
reference_path <- "hub/shared/tests/unit/p08-r-export-reference.json"

# Base R JSON writer, including control characters (jsonlite is not required).
json_string <- function(value) {
  pieces <- vapply(utf8ToInt(enc2utf8(value)), function(point) {
    if (point == 34L) return('\\"')
    if (point == 92L) return('\\\\')
    if (point < 32L) return(sprintf("\\u%04x", point))
    intToUtf8(point)
  }, character(1))
  paste0('"', paste0(pieces, collapse = ""), '"')
}
json <- function(value) {
  if (is.null(value)) return("null")
  if (is.list(value)) {
    entries <- vapply(value, json, character(1))
    if (!is.null(names(value))) {
      entries <- paste0(vapply(names(value), json_string, character(1)), ":", entries)
      return(paste0("{", paste(entries, collapse = ","), "}"))
    }
    return(paste0("[", paste(entries, collapse = ","), "]"))
  }
  if (length(value) != 1L) return(json(as.list(value)))
  if (is.character(value)) return(json_string(value))
  if (is.logical(value)) return(if (value) "true" else "false")
  stop("Unsupported reference type")
}

baseline_fit <- NULL
records <- lapply(cases, function(item) {
  script_path <- file.path(work_dir, paste0(item$id, ".R"))
  script <- readChar(script_path, file.info(script_path)$size, useBytes = TRUE)
  expected <- c(item$label, "Trial B", "Trial C", "Trial D")
  target <- new.env(parent = globalenv())
  error <- tryCatch({
    invisible(capture.output(eval(parse(text = script), envir = target)))
    NULL
  }, error = function(e) conditionMessage(e))
  parsed <- if (is.null(error)) target$labels else NULL
  slab <- if (is.null(error)) target$res$slab else NULL
  fit <- if (is.null(error)) c(coef(target$res), target$res$se, target$res$tau2) else NULL
  if (item$id == "plain" && is.null(error)) baseline_fit <<- fit
  faithful <- is.null(error) && identical(parsed, expected) && identical(slab, expected)
  same_fit <- is.null(error) && identical(fit, baseline_fit)
  cat(sprintf("P08-R3 native R %s %s: labels=%s model=%s%s\n", item$kind, item$id,
              if (faithful) "PASS" else "FAIL", if (same_fit) "PASS" else "FAIL",
              if (is.null(error)) "" else paste0("; ", error)))
  list(id = item$id, kind = item$kind, label = item$label,
       literal = encodeString(item$label, quote = '"'),
       original_script = script, original_error = error,
       original_labels = if (is.null(parsed)) NULL else as.list(parsed),
       original_slab = if (is.null(slab)) NULL else as.list(slab),
       labels_match = faithful, model_matches = same_fit)
})

if (!file.exists(reference_path)) {
  reference <- list(provenance = list(
    script = "p08-r-export-reference.R", app_sha256 = app_sha256,
    R = R.version.string, metafor = as.character(packageVersion("metafor")),
    encoder = "base::encodeString(quote = double quote)",
    packages = lapply(c("metafor", "metadat", "Matrix", "nlme", "numDeriv"), function(pkg) {
      list(package = pkg, version = as.character(packageVersion(pkg)))
    })), cases = records)
  # Required reference fixture; runtime exports and logs remain in TEMP.
  writeLines(json(reference), reference_path, useBytes = TRUE)
  cat("Recorded native R fixture and original app exports: ", reference_path, "\n", sep = "")
} else {
  cat("Kept the existing native R reference unchanged.\n")
}
failures <- vapply(records, function(record) !record$labels_match || !record$model_matches, logical(1))
if (any(failures)) stop(sum(failures), " exact app exports failed native R round-trip checks")
cat("All exact app exports preserve labels, metafor slab, and numeric fits.\n")
