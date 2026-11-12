# Reference values for the E-value page's non-null, SE-based SMD, regression (OLS)
# and risk-difference E-values, computed with the CRAN package EValue 4.1.4.
# Synthetic software test inputs only (not clinical data).
# Run:  Rscript evalue/tests/fixtures/evalue-extended-reference.R > evalue/tests/fixtures/evalue-extended-reference.json
suppressPackageStartupMessages(suppressWarnings({ library(EValue); library(jsonlite) }))
stopifnot(as.character(packageVersion("EValue")) == "4.1.4")
na2null <- function(x) if (is.na(x)) NULL else unname(x)
ev <- function(m) list(point = na2null(m[2, 1]), lower = na2null(m[2, 2]), upper = na2null(m[2, 3]),
                       rr = list(point = na2null(m[1, 1]), lo = na2null(m[1, 2]), hi = na2null(m[1, 3])))
q <- function(expr) suppressMessages(suppressWarnings(expr))
cases <- list()
add <- function(id, args, out) cases[[length(cases) + 1]] <<- c(list(id = id), args, list(expected = out))
A <- function(...) { a <- list(...); a[!vapply(a, function(v) length(v) == 1 && is.na(v), TRUE)] }

ratio <- list(
  list("rr-true-below-est", "RR", 2.0, 1.5, 2.7, NA, 1.5),
  list("rr-true-above-est", "RR", 2.0, 1.5, 2.7, NA, 2.5),
  list("rr-true-crossed", "RR", 1.2, 0.9, 1.6, NA, 1.1),
  list("rr-protective-true", "RR", 0.6, 0.4, 0.9, NA, 0.8),
  list("rr-protective-true-below", "RR", 0.6, 0.4, 0.9, NA, 0.5),
  list("rr-est-equals-true", "RR", 1.5, 1.2, 1.9, NA, 1.5),
  list("rr-true-noci", "RR", 2.0, NA, NA, NA, 1.3),
  list("rr-true-one", "RR", 2.0, 1.5, 2.7, NA, 1),
  list("or-common-true", "OR", 2.0, 1.5, 2.7, FALSE, 1.2),
  list("or-rare-true", "OR", 2.0, 1.5, 2.7, TRUE, 1.2),
  list("hr-common-true", "HR", 1.6, 1.2, 2.1, FALSE, 1.1),
  list("hr-rare-protective-true", "HR", 0.7, 0.5, 0.95, TRUE, 0.9))
for (r in ratio) {
  f <- switch(r[[2]], RR = evalues.RR, OR = evalues.OR, HR = evalues.HR)
  args <- list(est = r[[3]], lo = r[[4]], hi = r[[5]], true = r[[7]])
  if (r[[2]] != "RR") args$rare <- r[[6]]
  add(r[[1]], list(fun = paste0("evalues.", r[[2]]), measure = r[[2]], point = r[[3]],
                   lo = na2null(r[[4]]), hi = na2null(r[[5]]), rare = isTRUE(r[[6]]), true = r[[7]]),
      ev(q(do.call(f, args))))
}
md <- list(list("md-se", 0.5, 0.1, 0), list("md-se-protective", -0.36, 0.115, 0),
           list("md-se-true", 0.5, 0.1, 0.2), list("md-se-crossing", 0.1, 0.2, 0),
           list("md-noci-true", 0.5, NA, 0.3), list("md-se-zero", 0.4, 0, 0))
for (r in md)
  add(r[[1]], list(fun = "evalues.MD", measure = "SMD", point = r[[2]], se = na2null(r[[3]]), true = r[[4]]),
      ev(q(evalues.MD(est = r[[2]], se = r[[3]], true = r[[4]]))))
ols <- list(list("ols-basic", 2.5, 0.8, 10, 1, 0), list("ols-delta2", 2.5, 0.8, 10, 2, 0),
            list("ols-delta-negative", 2.5, 0.8, 10, -2, 0), list("ols-true", 2.5, 0.8, 10, 1, 0.05),
            list("ols-nose", -1.2, NA, 4, 1, 0), list("ols-crossing", 0.5, 0.6, 3, 1, 0),
            list("ols-delta-zero", 2.5, 0.8, 10, 0, 0))
for (r in ols)
  add(r[[1]], list(fun = "evalues.OLS", measure = "OLS", point = r[[2]], se = na2null(r[[3]]), sd = r[[4]],
                   delta = r[[5]], true = r[[6]]),
      ev(q(evalues.OLS(est = r[[2]], se = r[[3]], sd = r[[4]], delta = r[[5]], true = r[[6]]))))
rd <- list(list("rd-basic", 40, 60, 20, 80, 0), list("rd-true", 40, 60, 20, 80, 0.05),
           list("rd-crossing", 12, 88, 10, 90, 0), list("rd-large", 300, 700, 150, 850, 0),
           list("rd-unbalanced", 30, 20, 100, 400, 0), list("rd-small-effect", 55, 45, 45, 55, 0))
for (r in rd) {
  o <- q(evalues.RD(n11 = r[[2]], n10 = r[[3]], n01 = r[[4]], n00 = r[[5]], true = r[[6]]))
  add(r[[1]], list(fun = "evalues.RD", measure = "RD", n11 = r[[2]], n10 = r[[3]], n01 = r[[4]], n00 = r[[5]],
                   true = r[[6]]), list(point = unname(o$est.Evalue), lower = na2null(o$lower.Evalue)))
}
cat(toJSON(list(R = paste(R.version$major, R.version$minor, sep = "."), EValue = as.character(packageVersion("EValue")),
                disclosure = "Synthetic software test inputs, not clinical data.", cases = cases),
           auto_unbox = TRUE, digits = I(17), pretty = TRUE, null = "null"), "\n")
