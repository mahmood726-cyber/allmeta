# Native metafor REML reference for the real-review fixtures, computed by
# metafor's OWN iterative REML (no tau2= supplied), tightly converged.
# tests/reml_reference.R is different: it selects tau^2 with its own
# contrast-profile grid + uniroot and then passes tau2= to rma().
# Usage (from repo root): Rscript tests/reml_native_reference.R > tests/fixtures/reml_native_metafor.json
suppressMessages(library(metafor))
f <- jsonlite::fromJSON("tests/fixtures/reml_nonconvergence.json")$reviews
ctrl <- list(stepadj = 0.5, threshold = 1e-14, maxiter = 10000)
out <- list(
  r_version = R.version.string,
  metafor_version = as.character(packageVersion("metafor")),
  call = "rma(yi, vi, method='REML', control=list(stepadj=0.5, threshold=1e-14, maxiter=10000))",
  tau2 = setNames(lapply(seq_len(nrow(f)), function(i)
    rma(f$yi[[i]], f$vi[[i]], method = "REML", control = ctrl)$tau2), f$review_id))
cat(jsonlite::toJSON(out, auto_unbox = TRUE, digits = NA, pretty = TRUE), "\n")
