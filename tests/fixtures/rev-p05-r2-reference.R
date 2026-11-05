# Run from wt. New oracle only; never overwrite a recorded reference.
suppressPackageStartupMessages(library(metafor))
dest <- "tests/fixtures/rev-p05-r2-reference.json"
if (file.exists(dest)) stop("Refusing to overwrite the recorded R reference")
inputs <- list(
  imprecise_outlier = list(yi = c(-2, 0, 2, 1e40), vi = c(1, 1, 1, 1e100)),
  extreme_imprecise_outlier = list(yi = c(-2, 0, 2, 1e150), vi = c(1, 1, 1, 1e308)),
  translated = list(yi = 1e12 + c(-2, 0, 2), vi = c(1, 1, 1)),
  centered = list(yi = c(-2, 0, 2), vi = c(1, 1, 1)),
  small_root = list(yi = c(-1, 0, 1), vi = c(.5, .5, .5)))
refs <- lapply(inputs, function(d) {
  y <- d$yi - d$yi[which.min(d$vi)]
  q <- function(t) {
    w <- 1 / (d$vi + t)
    mu <- sum(w * y) / sum(w)
    sum(w * (y - mu)^2) - (length(y) - 1)
  }
  # Independently solve the defining PM equation in native R. The tight,
  # local bracket avoids metafor's huge default tau2.max on imprecise outliers.
  root <- uniroot(q, c(0, 8), tol = 1e-13)$root
  stopifnot(abs(q(root)) < 1e-10)
  fit <- tryCatch(rma(yi = y, vi = d$vi, method = "PM",
    control = list(tau2.max = 8, tol = 1e-13)), error = function(e) e)
  # Retain explicit package refusals rather than presenting them as R parity.
  native <- if (inherits(fit, "error")) list(error = conditionMessage(fit)) else list(tau2 = fit$tau2, se = fit$se)
  list(yi = d$yi, vi = d$vi, tau2 = root, q_minus_df = q(root), metafor = native)
})
json <- function(x) {
  if (is.list(x)) {
    fields <- vapply(x, json, character(1))
    if (!is.null(names(x))) {
      fields <- paste0(encodeString(names(x), quote = '"'), ":", fields)
      return(paste0("{", paste(fields, collapse = ","), "}"))
    }
    return(paste0("[", paste(fields, collapse = ","), "]"))
  }
  if (length(x) != 1L) return(json(as.list(x)))
  if (is.character(x) && !is.na(x)) return(encodeString(x, quote = '"'))
  if (is.numeric(x) && is.finite(x)) return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  stop("Unsupported oracle value")
}
reference <- list(provenance = list(R = R.version.string,
  metafor = as.character(packageVersion("metafor")),
  script = "tests/fixtures/rev-p05-r2-reference.R",
  serialization = "base R; 17 significant digits", tol = 1e-13,
  method = "stats::uniroot, defining PM Q equation; metafor::rma PM attempted independently"), cases = refs)
encoded <- json(reference)
writeLines(encoded, dest, useBytes = TRUE)
cat(encoded, "\n")
