# Independent REML reference: orthogonal residual contrasts diagonalise the
# covariance and remove the intercept without AllMeta's weighted-mean score.
# Run via scripts/validate_reml_reference.cjs (native R or bundled WebR).
reml_reference <- function(yi, vi) {
  k <- length(yi)
  H <- qr.Q(qr(matrix(1, k, 1)), complete=TRUE)[, -1, drop=FALSE]
  eig <- eigen(crossprod(H, vi * H), symmetric=TRUE)
  lambda <- eig$values
  z2 <- drop(crossprod(eig$vectors, crossprod(H, yi)))^2
  score <- function(t) sum((z2 - lambda - t) / (lambda + t)^2) / 2
  ll <- function(t) -sum(log(lambda + t) + z2 / (lambda + t)) / 2
  upper <- sum((yi - mean(yi))^2) + max(vi)
  grid <- c(0, exp(seq(log(min(lambda)) - 24, log(upper), length.out=4096)))
  scores <- vapply(grid, score, 0.0)
  ix <- which(sign(scores[-length(scores)]) != sign(scores[-1]))
  roots <- vapply(ix, function(i) uniroot(score, grid[c(i, i+1)],
                    tol=1e-14, maxiter=1000)$root, 0.0)
  candidates <- c(0, roots)
  tau2 <- candidates[which.max(vapply(candidates, ll, 0.0))]
  fit <- metafor::rma(yi, vi, method="REML", tau2=tau2)
  hk <- metafor::rma(yi, vi, method="REML", tau2=tau2, test="knha")
  fit0 <- metafor::rma(yi, vi, method="REML", tau2=0)
  c(tau2=tau2, mu=unname(coef(fit)), se=fit$se,
    ciLo=fit$ci.lb, ciHi=fit$ci.ub, I2=fit$I2,
    knhaSe=hk$se, knhaCiLo=hk$ci.lb, knhaCiHi=hk$ci.ub,
    logLik=as.numeric(logLik(fit)), boundaryLogLik=as.numeric(logLik(fit0)))
}

reml_iterative <- function(yi, vi, control) {
  tryCatch({
    fit <- metafor::rma(yi, vi, method="REML", control=control)
    paste(sprintf("%.17g", c(fit$tau2, logLik(fit))), collapse=",")
  }, error=function(e) paste("ERROR", conditionMessage(e)))
}
