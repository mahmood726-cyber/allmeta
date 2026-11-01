# The wrapper resolves Rscript itself but does not put it on Node's PATH.
# Use the running R installation to invoke the unchanged refusal assertions.
arguments <- commandArgs(trailingOnly = FALSE)
script <- sub("^--file=", "", arguments[startsWith(arguments, "--file=")])
stopifnot(length(script) == 1L)
runner <- file.path(dirname(normalizePath(script, mustWork = TRUE)), "p16-native-r-refusal.mjs")
executable <- if (.Platform$OS.type == "windows") "Rscript.exe" else "Rscript"
candidates <- c(file.path(R.home("bin"), executable), file.path(R.home("bin"), "x64", executable))
rscript <- candidates[file.exists(candidates)][1L]
stopifnot(!is.na(rscript), file.exists(runner))
# Each negative control changes plant-FE only. Avoid re-running the other five
# unchanged fits inside every 120-second child deadline; full parity is separate.
status <- system2("node", c(shQuote(runner), shQuote(normalizePath(rscript, mustWork = TRUE)), "plant-FE"))
if (!identical(status, 0L)) stop("Native-R refusal controls failed with status ", status)
