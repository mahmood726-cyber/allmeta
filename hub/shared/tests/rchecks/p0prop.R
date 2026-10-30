# The inputs and results MUST come from features-p0prop.spec.mjs running the page.
# Missing, incomplete, nonfinite, mismatched or stale evidence fails closed.
suppressPackageStartupMessages(library(metafor))
args <- commandArgs(trailingOnly = FALSE)
script <- sub("^--file=", "", args[grepl("^--file=", args)])
if (length(script) != 1L) stop("Run this file with Rscript")
out <- file.path(dirname(normalizePath(script)), "..", "rchecks-out", "p0prop")
read_evidence <- function(name, columns) {
  path <- file.path(out, name)
  if (!file.exists(path)) stop("Missing page-produced evidence: ", name)
  rows <- read.csv(path, stringsAsFactors = FALSE, check.names = FALSE)
  if (nrow(rows) == 0L || !identical(names(rows), columns)) stop("Invalid evidence schema: ", name)
  rows
}
inputs <- read_evidence("inputs.csv", c("id","row","events","total","label"))
values <- read_evidence("values.csv", c("id","transform","tauEstimator","k","mu_re","seRE","tau2","lo","hi","poolP","poolLo","poolHi"))
refusal <- read_evidence("refusal.csv", c("events","total","row","label","refused","error"))
ids <- as.vector(outer(as.vector(outer(c("prop-tiny","heterogeneous","boundaries"), c("logit","ft","raw"), paste, sep="-")), c("PM","DL","FE"), paste, sep="-"))
if (nrow(values) != length(ids) || anyDuplicated(values$id) || !setequal(values$id, ids) || !setequal(inputs$id, ids)) stop("Incomplete or duplicate page fixtures")
valid_counts <- function(x, n) all(is.finite(x) & is.finite(n) & x == floor(x) & n == floor(n) & x >= 0 & n > 0 & x <= n)
if (!valid_counts(inputs$events, inputs$total)) stop("Page exported invalid counts as valid inputs")
fields <- c("mu_re","seRE","tau2","lo","hi","poolP","poolLo","poolHi")
matches <- function(actual, expected) {
  length(actual) == length(expected) && all(is.finite(actual)) && all(is.finite(expected)) && all(abs(actual - expected) <= 1e-6)
}
references <- list()
# Exact test labels from fixtures/p0prop/cases.mjs, not estimated quantities.
labels <- list("prop-tiny"=paste("Study", LETTERS[1:5]), "heterogeneous"=LETTERS[1:5], "boundaries"=c("Zero","All","Interior"))
for (i in seq_len(nrow(values))) {
  row <- values[i, ]
  data <- inputs[inputs$id == row$id, ]
  if (!identical(as.integer(data$row), seq_len(nrow(data))) || row$k != nrow(data) || anyNA(data$label) || any(!nzchar(data$label))) stop("Row/label/count mismatch: ", row$id)
  if (!(row$transform %in% c("logit","ft","raw")) || !(row$tauEstimator %in% c("PM","DL","FE")) || !endsWith(row$id, paste(row$transform,row$tauEstimator,sep="-"))) stop("Transform/method label mismatch")
  fixture <- sub("-(logit|ft|raw)-(PM|DL|FE)$", "", row$id)
  if (!identical(data$label, labels[[fixture]])) stop("Study labels changed: ", row$id)
  measure <- c(logit="PLO", ft="PFT", raw="PR")[[row$transform]]
  fit <- metafor::rma(measure=measure, xi=data$events, ni=data$total,
    add=if (row$transform == "ft") 0 else 0.5, to="only0", method=row$tauEstimator,
    test="z", control=list(threshold=1e-12, tol=1e-18, maxiter=10000))
  analysis <- predict(fit)
  back <- switch(row$transform,
    logit=function(z) metafor::transf.ilogit(z),
    ft=function(z) metafor::transf.ipft.hm(z, targs=list(ni=data$total)),
    raw=function(z) pmin(1, pmax(0,z)))
  probability <- predict(fit, transf=back)
  expected <- c(mu_re=as.numeric(coef(fit)), seRE=as.numeric(fit$se), tau2=fit$tau2,
    lo=analysis$ci.lb, hi=analysis$ci.ub, poolP=probability$pred, poolLo=probability$ci.lb, poolHi=probability$ci.ub)
  actual <- as.numeric(row[1, fields])
  if (!matches(actual, expected)) stop("Page/R mismatch at tolerance 1e-6: ", row$id)
  references[[row$id]] <- expected
}
# Plant 1: deliberately wrong numerical row must be rejected by the SAME comparison.
wrong <- as.numeric(values[1, fields]); wrong[1] <- wrong[1] + 0.01
if (matches(wrong, references[[values$id[1]]])) stop("Planted numerical error escaped detection")
# Plant 2: the former parseInt/floor behaviour wrongly accepts 12.5 as 12.
if (nrow(refusal) != 1L || refusal$events != 12.5 || refusal$total != 150 || refusal$row != 2L || refusal$label != "Bad study" || refusal$refused != 1L || !grepl("Row 2", refusal$error, fixed=TRUE) || !grepl("Bad study", refusal$error, fixed=TRUE) || !grepl("whole", refusal$error, fixed=TRUE)) stop("Page did not explicitly refuse the planted fractional row")
expected_refused <- !valid_counts(refusal$events, refusal$total)
truncated_refused <- !valid_counts(floor(refusal$events), refusal$total)
if (!expected_refused || truncated_refused == as.logical(refusal$refused)) stop("Truncated-count plant escaped detection")
cat("PLANT_DETECTED\n")
cat(sprintf("Compared %d page fits (%d numerical quantities) at 1e-6; refusal row/label/flag exact.\n", nrow(values), nrow(values)*length(fields)))
cat("R_CHECK_PASS\n")
