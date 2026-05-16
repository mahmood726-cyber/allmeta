## workbench-oracle.R — authoritative reference for workbench poolAll().
## Canonical Paule-Mandel random-effects meta-analysis:
##   tau2 = root of  sum 1/(v_i+tau2) (y_i - mu(tau2))^2 = k-1   (0 if
##   Q(0) <= k-1); mu = sum w y / sum w, w=1/(v+tau2); se=sqrt(1/sum w);
##   Q0 = fixed-effect Cochran Q; I2 = max(0,100*(Q0-(k-1))/Q0).
## NOTE: canonical PM (Q=k-1 root) — NOT metafor rma(method="PM"), which
## is a different iterative variant (see bayesian-ma finding).
suppressPackageStartupMessages(library(jsonlite))

y <- c(0.30, 0.10, 0.45, 0.22, 0.55)
se <- c(0.10, 0.12, 0.15, 0.09, 0.20)
v  <- se^2
k  <- length(y)
z  <- qnorm(0.975)

Qf <- function(t2) { w <- 1/(v + t2); mu <- sum(w*y)/sum(w); sum(w*(y-mu)^2) }
Q0 <- Qf(0)
tau2 <- if (Q0 <= k - 1) 0 else
  uniroot(function(t2) Qf(t2) - (k - 1), c(0, 100), tol = 1e-12)$root
w   <- 1/(v + tau2)
mu  <- sum(w*y)/sum(w)
sem <- sqrt(1/sum(w))
I2  <- max(0, 100*(Q0 - (k-1))/Q0)

oracle <- list(
  studies = lapply(seq_along(y), function(i) list(est=y[i], se=se[i])),
  k = k, tau2 = round(tau2, 10), Q = round(Q0, 10), I2 = round(I2, 8),
  mu = round(mu, 10), se = round(sem, 10),
  lo = round(mu - z*sem, 10), hi = round(mu + z*sem, 10))
writeLines(toJSON(oracle, auto_unbox = TRUE, digits = 12),
  "C:/Projects/allmeta/workbench/tests/fixtures/workbench-oracle.json")
cat("wrote workbench-oracle.json\n")
cat("tau2=", tau2, " mu=", mu, " se=", sem, " Q0=", Q0, " I2=", I2, "\n")
