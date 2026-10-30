# Reproduce P13-R1 independently with metafor. Run from the wt directory:
# Rscript hub/shared/tests/fixtures/p13-gosh-reference.R
# The JSON is a generated reference fixture, not a replacement for archived corpora.
suppressPackageStartupMessages(library(metafor))

# Serialize this fixture with base R: jsonlite is not installed on the runner.
# Keep 17 significant digits so parsing the JSON preserves the R doubles.
json_value <- function(value) {
  if (is.list(value)) {
    fields <- vapply(value, json_value, character(1))
    if (is.null(names(value))) return(paste0("[", paste(fields, collapse = ","), "]"))
    keys <- encodeString(names(value), quote = '"')
    return(paste0("{", paste(paste0(keys, ":", fields), collapse = ","), "}"))
  }
  if (is.character(value) && length(value) == 1L) {
    return(encodeString(value, quote = '"'))
  }
  stopifnot(is.numeric(value), all(is.finite(value)))
  paste0("[", paste(formatC(value, digits = 17, format = "g", decimal.mark = "."),
                    collapse = ","), "]")
}

cases <- list()
for (remote in c(10, 1e10)) {
  te <- c(0, 4, rep(0, 13), remote)
  se <- c(1, 2, rep(1, 14))
  members <- c(1L, 2L)
  for (model in c("FE", "DL")) {
    fit <- rma.uni(yi = te[members], sei = se[members], method = model)
    cases[[length(cases) + 1L]] <- list(
      name = paste(if (remote == 10) "ordinary" else "remote", model, sep = "-"),
      model = model, te = te, se = se, members = members,
      expected = c(estimate = as.numeric(coef(fit)), I2 = fit$I2,
                   Q = fit$QE, tau2 = fit$tau2)
    )
  }
}
reference <- list(
  source = "metafor::rma.uni on the selected studies only; members are one-based",
  script = "p13-gosh-reference.R",
  versions = list(R = R.version.string,
                  metafor = as.character(packageVersion("metafor")),
                  metadat = as.character(packageVersion("metadat")),
                  numDeriv = as.character(packageVersion("numDeriv"))),
  cases = cases
)
json <- json_value(reference)
writeLines(json, "hub/shared/tests/fixtures/p13-gosh-reference.json")
cat(json, "\n")
