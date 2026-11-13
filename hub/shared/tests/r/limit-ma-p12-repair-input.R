# Repair only copied input metadata in the pass-1 fixture; never refit results.
# From wt/: Rscript hub/shared/tests/r/limit-ma-p12-repair-input.R
suppressPackageStartupMessages(library(jsonlite))
folder <- "hub/shared/tests/r"
source(file.path(folder, "limit-ma-p12-json.R"))
input_path <- file.path(folder, "limit-ma-p12-input.json")
fixture_path <- file.path(folder, "limit-ma-p12-reference.json")
input <- fromJSON(input_path, simplifyVector = FALSE)
text <- readChar(fixture_path, file.info(fixture_path)$size, useBytes = TRUE)
fixture <- fromJSON(text, simplifyVector = FALSE)
stopifnot(identical(fixture$provenance$input_md5, unname(tools::md5sum(input_path))))

# The original serializer must demonstrate its input-identity failure; keep
# the exact assertion and all original computed reference tokens unchanged.
probe <- list(chi_square = lapply(input$chi_square, function(pair)
  list(x = pair[[1]], df = pair[[2]], p = 0.25)))
old <- as.character(toJSON(probe, auto_unbox = TRUE, digits = NA, pretty = TRUE))
identity_holds <- function(payload) {
  rows <- fromJSON(payload, simplifyVector = FALSE)$chi_square
  identical(lapply(rows, function(row) list(row$x, row$df)), input$chi_square)
}
stopifnot(!identity_holds(old))
cat("Original serializer: exact input identity FAIL (expected regression witness)\n")
repaired_probe <- preserve_input_coordinates(old, input$chi_square)
stopifnot(identity_holds(repaired_probe))
cat("Corrected serializer: exact input identity PASS\n")
control <- as.character(toJSON(list(chi_square = list(list(x = 0.5, df = 1, p = 0.25))),
  auto_unbox = TRUE, digits = NA, pretty = TRUE))
stopifnot(identical(preserve_input_coordinates(control, list(list(0.5, 1))), control))
cat("Exactly representable control: unchanged bytes PASS\n")

fixed <- preserve_input_coordinates(text, input$chi_square)
stopifnot(identity_holds(fixed),
  identical(preserve_input_coordinates(fixed, input$chi_square), fixed))
for (i in seq_along(input$chi_square)) {
  previous <- fixture$chi_square[[i]]$x
  expected <- input$chi_square[[i]][[1]]
  if (!identical(previous, expected)) {
    cat(sprintf("Copied chi-square input %d: %.17g -> %.17g\n", i, previous, expected))
  }
}
if (!identical(text, fixed)) writeBin(charToRaw(fixed), fixture_path)
cat("All computed R reference tokens preserved; repair idempotent PASS\n")
