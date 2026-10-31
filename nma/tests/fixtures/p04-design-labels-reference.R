# Run from wt/: Rscript nma/tests/fixtures/p04-design-labels-reference.R
# Print the oracle for retention after the real R run; runtime output stays in temp.
suppressPackageStartupMessages(library(netmeta))
# CSV mirrors the JSON inputs without requiring the optional jsonlite package.
# The unit tests compare every emitted row against the original JSON inputs.
fixture_dir <- "nma/tests/fixtures"
all_rows <- read.csv(file.path(fixture_dir, "p04-design-labels-input.csv"),
                     stringsAsFactors = FALSE)
inputs <- lapply(unique(all_rows$case), function(nm)
  all_rows[all_rows$case == nm, setdiff(names(all_rows), "case"), drop = FALSE])
names(inputs) <- unique(all_rows$case)

# Encode only this fixture's ASCII strings, finite numbers and lists.
# Preserve the native R doubles with 17 significant digits.
to_json <- function(x) {
  if (is.data.frame(x)) x <- unname(lapply(seq_len(nrow(x)), function(i)
    as.list(x[i, , drop = FALSE])))
  if (is.list(x)) {
    values <- vapply(x, to_json, character(1))
    if (!is.null(names(x))) return(paste0("{", paste0(
      encodeString(names(x), quote = '"'), ":", values, collapse = ","), "}"))
    return(paste0("[", paste(values, collapse = ","), "]"))
  }
  if (length(x) != 1L) return(to_json(unname(as.list(x))))
  if (is.character(x) && !is.na(x)) return(encodeString(x, quote = '"'))
  stopifnot(is.numeric(x), is.finite(x))
  trimws(formatC(x, digits = 17, format = "g", decimal.mark = "."))
}

cases <- lapply(inputs, function(p) {
  # App est = t2 - t1, netmeta TE = treat1 - treat2.
  f <- netmeta(TE = p$est, seTE = p$se, treat1 = p$t2, treat2 = p$t1,
               studlab = p$study, sm = "MD", common = TRUE, random = TRUE,
               method.tau = "DL", method.random.ci = "classic")
  d <- decomp.design(f, warn = FALSE)$Q.decomp
  list(rows = p, decomp = list(Q = unname(d$Q), df = unname(d$df), pval = unname(d$pval)))
})
oracle <- list(provenance = list(generator = "p04-design-labels-reference.R",
  R = R.version.string, netmeta = as.character(packageVersion("netmeta")),
  meta = as.character(packageVersion("meta")),
  input_md5 = unname(tools::md5sum(file.path(fixture_dir, "p04-design-labels-input.json"))),
  serialization = "base R; 17 significant digits"), cases = cases)
encoded <- to_json(oracle)
# The initial baseline tests read this temporary oracle. Retain the emitted
# JSON as the repository fixture only after the real run has been inspected.
writeLines(encoded, file.path(dirname(tempdir()), "p04-r2-design-labels-oracle.json"), useBytes = TRUE)
cat("P04_R2_ORACLE_BEGIN\n")
cat(encoded)
cat("\nP04_R2_ORACLE_END\n")
