## prop-tiny.R — R-parity for proportion-ma
##
## The JS engine (proportion-ma/index.html) implements:
##   - Logit transform with Cochrane Handbook §10.4.4 / Sweeting 2004 continuity
##     correction at extremes (x=0 or x=n: add 0.5 to numerator and complement,
##     add 1 to denominator). Variance = 1/(x+0.5) + 1/(n-x+0.5) at extremes;
##     1/x + 1/(n-x) otherwise. This matches metafor::escalc(measure="PLO").
##   - Paule-Mandel (PM) tau2 estimator via iterative reweighting (up to 50 iters,
##     convergence |adj| < 1e-8).
##   - Back-transform via logit^{-1}(mu_re) = 1/(1+exp(-mu_re)).
##
## The R script replicates the identical algorithm so the test asserts genuine
## JS<->R numeric equivalence (not metafor::rma REML, which would differ).
##
## Usage (called by _r_parity.py):
##   Rscript --vanilla prop-tiny.R prop-tiny.csv

suppressPackageStartupMessages(library(jsonlite))

args <- commandArgs(trailingOnly = TRUE)
d <- read.csv(args[1])
# columns: study, events, total

x <- as.integer(d$events)
n <- as.integer(d$total)
k <- length(x)

## ---- logit transform (matching JS logitTransform) ----
logit_te <- function(xi, ni) {
  extreme <- (xi == 0L) | (xi == ni)
  cx <- ifelse(extreme, xi + 0.5, xi)
  cn <- ifelse(extreme, ni + 1L, ni)
  p  <- cx / cn
  list(y = log(p / (1 - p)), v = 1/cx + 1/(cn - cx))
}

res <- logit_te(x, n)
y <- res$y
v <- res$v

## ---- Paule-Mandel iteration (matches JS pool() PM branch, 50 iters) ----
df <- k - 1L

pm_tau2 <- function(y, v, max_iter = 50L, tol = 1e-8) {
  tau <- 0
  for (it in seq_len(max_iter)) {
    wi  <- 1 / (v + tau)
    swi <- sum(wi)
    mu_t <- sum(wi * y) / swi
    Qt  <- sum(wi * (y - mu_t)^2)
    dQ  <- sum(wi^2 * (y - mu_t)^2)
    adj <- (Qt - df) / dQ
    tau <- max(0, tau + adj)
    if (abs(adj) < tol) break
  }
  tau
}

tau2 <- pm_tau2(y, v)

## ---- RE pooling ----
wRE  <- 1 / (v + tau2)
swRE <- sum(wRE)
mu_re  <- sum(wRE * y) / swRE
seRE   <- sqrt(1 / swRE)

## ---- Q, I2 ----
wFE  <- 1 / v
swFE <- sum(wFE)
mu_fe <- sum(wFE * y) / swFE
Q    <- sum(wFE * (y - mu_fe)^2)
i2   <- if (Q > df) 100 * (Q - df) / Q else 0

## ---- back-transform ----
poolP <- 1 / (1 + exp(-mu_re))
poolLo <- 1 / (1 + exp(-(mu_re - 1.96 * seRE)))
poolHi <- 1 / (1 + exp(-(mu_re + 1.96 * seRE)))

cat(toJSON(list(
  mu_re    = as.numeric(mu_re),
  seRE     = as.numeric(seRE),
  tau2     = as.numeric(tau2),
  Q        = as.numeric(Q),
  i2       = as.numeric(i2),
  poolP    = as.numeric(poolP),
  poolLo   = as.numeric(poolLo),
  poolHi   = as.numeric(poolHi),
  k        = as.integer(k)
), auto_unbox = TRUE, digits = 15))
cat("\n")
