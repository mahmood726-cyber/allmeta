# Independent, known-variance fixed-effect linear GLS for the synthetic regression case.
# Uses base R/stats only, not an estimated residual variance or a memorised reference.
dose <- rep(1:3, 3)
y <- -0.4 * dose
se <- rep(0.1, length(dose))
X <- matrix(dose / se, ncol=1)
V <- solve(crossprod(X))
b <- as.numeric(V %*% crossprod(X, y / se))
grid <- c(0, 1, 2, 1e200)
z <- qnorm(0.975)
prediction <- function(d) {
  lp <- d * b
  uncertainty <- abs(d) * sqrt(V[1,1])
  lo <- lp - z * uncertainty
  hi <- lp + z * uncertainty
  values <- c(dose=d, logRR=lp, se=uncertainty, ciLo=lo, ciHi=hi,
              rr=exp(lp), rrLo=exp(lo), rrHi=exp(hi))
  stopifnot(all(is.finite(values)))
  paste0('{', paste(sprintf('"%s":%.17g', names(values), values), collapse=','), '}')
}
cat('{"source":"base R known-variance independent fixed-effect GLS",',
    '"R_version":"', R.version.string, '","stats_version":"', as.character(packageVersion('stats')),
    '","coef":', sprintf('%.17g', b), ',"vcov":', sprintf('%.17g', V[1,1]),
    ',"predictions":[', paste(vapply(grid, prediction, character(1)), collapse=','), ']}\n', sep='')
