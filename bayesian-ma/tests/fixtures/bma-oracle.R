## bma-oracle.R — authoritative reference for bayesian-ma.
## Conjugate normal-normal: y_i ~ N(theta, v_i+tau2), theta ~ N(mu0, tau0^2).
## Posterior is closed-form (deterministic; no MCMC -> R-hat/ESS N/A).
## tau2 via the CANONICAL Paule-Mandel estimator: tau2 solves
##   sum w_i (y_i - mu_w)^2 = k - 1,  w_i = 1/(v_i+tau2)  (Paule & Mandel
## 1982; Viechtbauer 2005). NOTE: metafor rma(method="PM") solves a
## subtly different iterative variant (Q != k-1 at its root, ~1e-5 off),
## so the canonical Q=k-1 uniroot is the authoritative reference here.
## Posterior tail/ROPE probabilities via R's exact pnorm.
suppressPackageStartupMessages(library(jsonlite))

studies <- data.frame(
  est = c(0.42, 0.18, 0.55, 0.30, 0.12),
  se  = c(0.10, 0.14, 0.20, 0.09, 0.07))
v   <- studies$se^2
mu0 <- 0; tau0 <- 1; threshold <- 0; rope <- 0.1
k   <- nrow(studies)

Qpm <- function(t2) { w <- 1/(v + t2); mu <- sum(w*studies$est)/sum(w)
                       sum(w*(studies$est - mu)^2) }
tau2_pm <- if (Qpm(0) <= k - 1) 0 else
  uniroot(function(t2) Qpm(t2) - (k - 1), c(0, 100), tol = 1e-12)$root

post <- function(tau2) {
  prec  <- 1/tau0^2 + sum(1/(v + tau2))
  pv    <- 1/prec
  pm    <- (mu0/tau0^2 + sum(studies$est/(v + tau2))) * pv
  psd   <- sqrt(pv)
  list(mu = pm, sd = psd,
       lo = pm - qnorm(0.975)*psd, hi = pm + qnorm(0.975)*psd,
       pLess  = pnorm((threshold - pm)/psd),
       pInside= pnorm((rope - pm)/psd) - pnorm((-rope - pm)/psd))
}
mk <- function(tau2) { p <- post(tau2); list(tau2=tau2,
  mu=round(p$mu,12), sd=round(p$sd,12), lo=round(p$lo,12),
  hi=round(p$hi,12), pLess=round(p$pLess,12), pInside=round(p$pInside,12)) }

oracle <- list(
  studies = lapply(seq_len(nrow(studies)), function(i)
    list(est = studies$est[i], se = studies$se[i])),
  mu0 = mu0, tau0 = tau0, threshold = threshold, rope = rope,
  tau2_pm = round(tau2_pm, 12),
  fixed0 = mk(0),
  pm     = mk(tau2_pm))
writeLines(toJSON(oracle, auto_unbox = TRUE, digits = 14),
  "C:/Projects/allmeta/bayesian-ma/tests/fixtures/bma-oracle.json")
cat("wrote bma-oracle.json; tau2_PM=", tau2_pm, "\n")
cat("fixed0:", unlist(oracle$fixed0), "\n")
cat("pm:    ", unlist(oracle$pm), "\n")
