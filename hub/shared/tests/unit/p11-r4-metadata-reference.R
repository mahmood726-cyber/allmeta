# Native estimated-model controls, independent of the JavaScript exporter.
# Run p11-r4-prepare.mjs first. Never replace an existing reference fixture.
suppressPackageStartupMessages(library(metafor))
source(file.path(dirname(tempdir()), "p11-r4-input.R"))
target <- file.path(dirname(tempdir()), "p11-r4-metadata-reference.json")
if (file.exists("hub/shared/tests/unit/p11-r4-metadata-reference.json")) {
  stop("Refusing to rebaseline the native metadata reference")
}
json <- function(x) {
  if (is.null(x)) return("null")
  if (is.list(x)) {
    fields <- vapply(x, json, "")
    if (!is.null(names(x))) return(paste0("{", paste(paste0(encodeString(names(x), quote='"'), ":", fields), collapse=","), "}"))
    return(paste0("[", paste(fields, collapse=","), "]"))
  }
  if (length(x) != 1L) return(json(as.list(x)))
  if (is.character(x)) return(encodeString(x, quote='"'))
  if (is.logical(x)) return(if (x) "true" else "false")
  stopifnot(is.numeric(x), is.finite(x))
  trimws(formatC(x, digits=17, format="g", decimal.mark="."))
}
snapshot <- function(y, v) {
  fit <- rma.uni(y, v, method="REML", test="z", control=list(threshold=1e-12, maxiter=10000))
  list(tau2=fit$tau2, tau2_fix=fit$tau2.fix, parms=fit$parms,
       logLik=as.numeric(logLik(fit)), logLik_df=attr(logLik(fit), "df"),
       AIC=AIC(fit), BIC=BIC(fit), fit_stats=unname(as.list(as.matrix(fit$fit.stats))))
}
controls <- Filter(function(c) c$id %in% c("ordinary", "three-study", "ties", "zero"), input)
result <- list(provenance=list(R=R.version.string, metafor=as.character(packageVersion("metafor")),
  script="p11-r4-metadata-reference.R", serialization="base R; 17 significant digits"),
  cases=lapply(controls, function(c) {
    ex <- c$excluded + 1L
    list(id=c$id, yi=c$yi, vi=c$vi, full=snapshot(c$yi, c$vi),
         excluded=if (length(ex)) snapshot(c$yi[-ex], c$vi[-ex]) else NULL)
  }))
writeLines(json(result), target, useBytes=TRUE)
cat("Native metadata reference:", target, "\n")
cat(R.version.string, "; metafor", as.character(packageVersion("metafor")), "\n")
for (f in c("rma.uni", "logLik.rma", "AIC.rma", "BIC.rma", "fitstats.rma")) {
  lines <- deparse(getFromNamespace(f, "metafor"))
  writeLines(lines, file.path(dirname(tempdir()), paste0("p11-r4-review-", f, ".R")))
  ix <- grep("parms|tau2.fix|AIC|BIC|fit.stats|ll.REML|ll.ML", lines, fixed=FALSE)
  show <- sort(unique(unlist(lapply(ix, function(i) seq.int(max(1, i-2), min(length(lines), i+3))))))
  cat("\n", f, "\n")
  for (i in show) cat(sprintf("%d: %s\n", i, lines[i]))
}
