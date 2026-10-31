# Run from the wt root: Rscript hub/shared/tests/r/influence-p11-reference.R
# New fixtures only; never writes to the published influence/validate/corpus.
suppressPackageStartupMessages(library(metafor))
script <- "hub/shared/tests/r/influence-p11-reference.R"
input <- "hub/shared/tests/r/influence-p11-input.json"
output <- "hub/shared/tests/r/influence-p11-reference.json"
# Base R only: jsonlite is not installed in the supplied R runner. Record the
# exact inputs actually used below; the Node provenance test compares the whole
# input object with the existing JSON, in addition to checking its byte hash.
case <- function(id, yi, vi, exclusions = list()) list(
  id = id, yi = as.list(yi), vi = as.list(vi), exclusions = lapply(exclusions, as.list)
)
spec <- list(schema = "influence-p11-input-v1", cases = list(
  case("inf-tiny-control", c(0.2,-0.1,0.15,0.05,0.8), c(0.04,0.03,0.025,0.02,0.018), list(4, c(0,4))),
  case("mixed-heterogeneity", c(-0.8,-0.1,0.4,0.9,1.5,0.2), c(0.04,0.09,0.025,0.16,0.0625,0.01), list(c(0,4), 1)),
  case("identical-effects", rep(0.25,5), c(0.01,0.04,0.09,0.0225,0.0625), list(c(0,4))),
  case("null-symmetric", c(-0.1,-0.05,0,0.05,0.1), rep(0.04,5), list(c(0,4))),
  case("k3-positive", c(-0.6,0.1,0.8), c(0.04,0.09,0.16)),
  case("k3-boundary", c(0,0.01,-0.01), c(0.01,0.02,0.03)),
  case("unequal-precision", c(0.03,0.15,-0.2,1.3,0.4,0.6), c(0.0001,0.04,0.09,0.16,0.0225,0.0625), list(0, c(0,3)))
))

# This fixture contains finite numbers, booleans, simple strings and lists only.
# Preserve all native-double precision and array shape (including empty and
# one-element exclusions). Reject missing/non-finite results instead of hiding
# them as JSON nulls. encodeString is restricted to JSON-compatible characters.
encode_json <- function(x) {
  if (is.list(x)) {
    fields <- vapply(x, encode_json, character(1))
    if (!is.null(names(x))) {
      fields <- paste0(vapply(names(x), encode_json, character(1)), ":", fields)
      return(paste0("{", paste(fields, collapse = ","), "}"))
    }
    return(paste0("[", paste(fields, collapse = ","), "]"))
  }
  if (length(x) != 1L) return(encode_json(as.list(x)))
  if (is.character(x) && !is.na(x) && !grepl("[[:cntrl:]]", x)) return(encodeString(x, quote = '"'))
  if (is.logical(x) && !is.na(x)) return(if (x) "true" else "false")
  if (is.numeric(x) && is.finite(x)) return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  stop("Unsupported or non-finite value in R reference")
}
ctl <- list(threshold = 1e-12, maxiter = 10000)
fit <- function(y, v) rma.uni(yi = y, vi = v, method = "REML", test = "z", control = ctl)
summary_values <- function(r) list(
  k = r$k, mu = as.numeric(coef(r)), seMu = r$se, tau2 = r$tau2,
  ciLo = r$ci.lb, ciHi = r$ci.ub, z = r$zval, p = r$pval,
  Q = r$QE, df = r$k - r$p, Qp = r$QEp, I2 = r$I2, H2 = r$H2
)
cases <- lapply(spec$cases, function(d) {
  y <- unlist(d$yi); v <- unlist(d$vi)
  r <- fit(y, v)
  loo <- leave1out(r)
  inf <- influence(r)
  stopifnot(is.logical(inf$is.infl), !anyNA(inf$is.infl))
  diagnostics <- lapply(seq_along(y), function(i) list(
    loo_mu = loo$estimate[i], loo_seMu = loo$se[i],
    loo_ciLo = loo$ci.lb[i], loo_ciHi = loo$ci.ub[i],
    loo_z = loo$zval[i], loo_p = loo$pval[i], loo_tau2 = loo$tau2[i],
    loo_Q = loo$Q[i], loo_Qp = loo$Qp[i], loo_I2 = loo$I2[i], loo_H2 = loo$H2[i],
    dfbetas = inf$dfbs[[1]][i], resid = inf$inf$rstudent[i],
    dffits = inf$inf$dffits[i], cooksD = inf$inf$cook.d[i],
    covRatio = inf$inf$cov.r[i], hat = inf$inf$hat[i], weight = inf$inf$weight[i],
    influential = inf$is.infl[i], tau2_del = inf$inf$tau2.del[i], QE_del = inf$inf$QE.del[i]
  ))
  exclusions <- lapply(d$exclusions, function(indices) {
    excluded <- unlist(indices)
    keep <- setdiff(seq_along(y), excluded + 1L)
    stopifnot(length(keep) >= 3)
    list(excluded = as.list(excluded), kept = summary_values(fit(y[keep], v[keep])))
  })
  list(id = d$id, full = summary_values(r), diag = diagnostics, exclusions = exclusions)
})
result <- list(
  schema = "influence-p11-reference-v1",
  provenance = list(R = R.version.string,
    packages = list(metafor = as.character(packageVersion("metafor")),
                    metadat = as.character(packageVersion("metadat")),
                    Matrix = as.character(packageVersion("Matrix")),
                    nlme = as.character(packageVersion("nlme")),
                    numDeriv = as.character(packageVersion("numDeriv"))),
    serialization = "base R; 17 significant digits; no jsonlite dependency",
    generator = script, generator_md5 = unname(tools::md5sum(script)),
    input = input, input_md5 = unname(tools::md5sum(input)),
    method = "REML", test = "z", level = 95, control = ctl,
    calls = c("metafor::rma.uni", "metafor::leave1out", "stats::influence (metafor rma.uni method)"),
    index_convention = "exclusions use zero-based app row indices",
    prediction_intervals = "Not offered by influence; no predict() values compared"),
  input = spec, cases = cases
)
json <- encode_json(result)
# Replays verify the pinned fixture instead of silently replacing references.
if (file.exists(output)) {
  stopifnot(identical(readLines(output, warn = FALSE), json))
  cat("Verified existing fixture without rewriting:", output, "\n")
} else {
  writeLines(json, output, useBytes = TRUE)
  cat("Generated", output, "\n")
}
cat(R.version.string, "; metafor ", as.character(packageVersion("metafor")),
    "; cases ", length(cases), "\n", sep = "")
