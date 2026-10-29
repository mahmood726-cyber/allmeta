# Read-only diagnosis of the two pass-1 mismatches. No reference is regenerated.
# Run from wt/: Rscript hub/shared/tests/r/multilevel-ma-parity-diagnostics.R
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
fixture_dir <- "hub/shared/tests/fixtures/multilevel-ma-rpar"
input <- fromJSON(file.path(fixture_dir, "input.json"), simplifyVector = FALSE)
reference <- fromJSON(file.path(fixture_dir, "reference.json"), simplifyVector = FALSE)
get_case <- function(cases, id) Filter(function(x) identical(x$id, id), cases)[[1]]
get_data <- function(id) {
  d <- do.call(rbind, lapply(get_case(input$cases, id)$rows, as.data.frame))
  d$id <- seq_len(nrow(d))
  d
}
fit_errors <- character()
print_fit <- function(label, f) {
  cat(label, "\n")
  # A failed optional fit must not prevent the independent reduction and ridge
  # diagnostics from running. Retain the error and exit nonzero after all output.
  f <- tryCatch(f, error = function(e) e)
  if (inherits(f, "error")) {
    cat("FIT ERROR:", conditionMessage(f), "\n")
    fit_errors <<- c(fit_errors, label)
    return(invisible(NULL))
  }
  print(list(mu = as.numeric(coef(f)), se = as.numeric(f$se),
             sigma2 = f$sigma2, tau2 = f$tau2, logLik = as.numeric(logLik(f))), digits = 17)
}
cat(R.version.string, "\nmetafor", as.character(packageVersion("metafor")), "\n")

# At b=0 with equal sampling variances, the one-component REML optimum is
# sample variance minus sampling variance. Use it only as a diagnosis, never
# as a replacement fixture or a relaxed parity assertion.
d <- get_data("boundary_between")
stopifnot(length(unique(d$v)) == 1L, all(tapply(d$y, d$cluster, sum) == 0))
analytic_within <- max(0, var(d$y) - d$v[1])
recorded <- get_case(reference$cases, "boundary_between")$reml
cat("boundary_between closed-form within variance and recorded-R error\n")
print(c(analytic_within = analytic_within,
        recorded_within = recorded$sigma2Within,
        recorded_minus_analytic = recorded$sigma2Within - analytic_within), digits = 17)
print_fit("boundary_between: rma.mv with between fixed to zero",
          rma.mv(y, v, random = ~ 1 | cluster/id, data = d, method = "REML",
                 sigma2 = c(0, NA), control = list(rel.tol = 1e-12)))
print_fit("boundary_between: rma.uni REML reduction", rma.uni(y, v, data = d, method = "REML"))

# One cluster gives a flat restricted-likelihood direction in the random
# intercept variance. Independently evaluate a dense covariance matrix in R.
# The cancellation in REML does not remove b from Var(mu) = b + 1/sum(1/D).
d <- get_data("single_cluster")
recorded <- get_case(reference$cases, "single_cluster")$reml
w <- recorded$sigma2Within
dense_reml <- function(b) {
  n <- nrow(d)
  V <- diag(d$v + w) + matrix(b, n, n)
  inverse <- solve(V)
  info <- sum(inverse)
  mu <- sum(inverse %*% d$y) / info
  residual <- d$y - mu
  rss <- as.numeric(crossprod(residual, inverse %*% residual))
  logdet <- as.numeric(determinant(V, logarithm = TRUE)$modulus)
  logLik <- -.5 * ((n - 1) * log(2*pi) + logdet + log(info) + rss) + .5 * log(n)
  c(between = b, within = w, mu = mu, se = sqrt(1/info), logLik = logLik)
}
cat("single_cluster: dense REML ridge at fixed within variance\n")
print(do.call(rbind, lapply(c(0, 1e-5, .01, 1), dense_reml)), digits = 17)
print_fit("single_cluster: rma.uni REML reduction", rma.uni(y, v, data = d, method = "REML"))

cat("Completed all diagnostic sections; fit errors:", length(fit_errors), "\n")
if (length(fit_errors)) {
  cat(paste(fit_errors, collapse = "\n"), "\n")
  quit(status = 1L)
}
