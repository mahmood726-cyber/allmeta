# Complete the unchanged Python/R parity suite with dependencies in temp only.
# No reference values are generated, and no global R library is modified.
scratch <- tempfile("p08-r5-r-library-")
dir.create(scratch)
.libPaths(c(scratch, .libPaths()))
packages <- c("metafor", "jsonlite")
missing <- packages[!vapply(packages, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing)) {
  cat("Installing missing test dependencies in a temporary R library:", paste(missing, collapse = ", "), "\n")
  install.packages(missing, lib = scratch, repos = "https://cloud.r-project.org")
}
if (!all(vapply(packages, requireNamespace, logical(1), quietly = TRUE))) {
  stop("Required R test dependencies remain unavailable")
}
cat(R.version.string, "\n")
for (package in packages) cat(package, as.character(packageVersion(package)), "\n")

# Give the existing helper an explicit executable and library search path.
# These values come from R's installation/library APIs; no environment values
# are read or logged. The inherited child process gets these settings.
Sys.setenv(
  RSCRIPT = file.path(R.home("bin"), if (.Platform$OS.type == "windows") "Rscript.exe" else "Rscript"),
  R_LIBS = paste(.libPaths(), collapse = .Platform$path.sep)
)
status <- system2("python", shQuote("scripts/p08-r5-python.py"))
quit(save = "no", status = status)
