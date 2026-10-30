# Run the recorded generator unchanged in a temporary tree; never overwrite an oracle.
root <- normalizePath(".", winslash = "/", mustWork = TRUE)
scratch <- tempfile("p15-r5-reference-")
dir.create(scratch)
unit <- "hub/shared/tests/unit"
dir.create(file.path(scratch, unit), recursive = TRUE)
fixtures <- "rve-meta/tests/fixtures/p15-eigen"
dir.create(file.path(scratch, fixtures), recursive = TRUE)
for (name in c("eigen", "minimal-complex", "complex")) {
  path <- file.path(fixtures, paste0(name, ".json"))
  stopifnot(file.copy(file.path(root, path), file.path(scratch, path)))
}
script <- file.path(unit, "p15-r5-reference.R")
stopifnot(file.copy(file.path(root, script), file.path(scratch, script)))
input <- file.path(unit, "p15-r5-input.json")
bytes <- readBin(file.path(root, input), "raw", n = file.info(file.path(root, input))$size)
writeBin(charToRaw(gsub("\r\n", "\n", rawToChar(bytes), fixed = TRUE)), file.path(scratch, input))
local({
  previous <- setwd(scratch)
  on.exit(setwd(previous))
  source(script, local = TRUE)
})
recorded <- jsonlite::fromJSON(file.path(root, unit, "p15-r5-reference.json"), simplifyVector = FALSE)
fresh <- jsonlite::fromJSON(file.path(scratch, unit, "p15-r5-reference.json"), simplifyVector = FALSE)
stopifnot(identical(recorded$provenance$input_md5, fresh$provenance$input_md5))
stopifnot(identical(names(recorded$cases), names(fresh$cases)))
for (name in names(recorded$cases)) {
  a <- recorded$cases[[name]]
  b <- fresh$cases[[name]]
  stopifnot(identical(a$input, b$input), identical(a$result$status, b$result$status))
  if (a$result$status == "refused") {
    stopifnot(identical(a$result$reason, b$result$reason))
  } else {
    near <- function(x, y, absolute = FALSE) {
      stopifnot(is.finite(x), is.finite(y), abs(x - y) <= 1e-9 * if (absolute) 1 else max(1, abs(x)))
    }
    near(a$result$tau2, b$result$tau2)
    stopifnot(length(a$result$table) == length(b$result$table))
    for (i in seq_along(a$result$table)) for (key in c("b.r", "SE", "t", "dfs", "prob", "CI.L", "CI.U")) {
      near(a$result$table[[i]][[key]], b$result$table[[i]][[key]], key %in% c("prob", "CI.L", "CI.U"))
    }
  }
  cat("PASS recorded reference:", name, "\n")
}
cat("Fresh fixture and generator retained in:", scratch, "\n")
print(fresh$provenance)
