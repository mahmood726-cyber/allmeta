## cumul-tiny.R — R-parity for cumulative-subgroup app
##
## The JS engine (cumulative-subgroup/index.html) implements:
##   - Paule-Mandel (PM) tau2 estimator via bisection (100 iterations).
##   - Cumulative pooling: sort by year, then for each prefix of i=1..k
##     studies compute pool(studies[0..i]) using PM tau2 and IV weights.
##   - Final cumulative estimate == full-data RMA pool.
##
## This R script uses metafor::cumul(rma(yi, vi, method="PM"), order = year)
## to compute the cumulative estimates and emits the penultimate and final
## pooled estimates (mu, se, ci.lb, ci.ub) plus tau2 and I2 from the final
## full-data rma.
##
## Usage (called by _r_parity.py):
##   Rscript --vanilla cumul-tiny.R cumul-tiny.csv

suppressPackageStartupMessages(library(jsonlite))
suppressPackageStartupMessages(library(metafor))

args <- commandArgs(trailingOnly = TRUE)
d <- read.csv(args[1])
# columns: study, year, yi, vi

yi   <- d$yi
vi   <- d$vi
yr   <- d$year
k    <- length(yi)

## ---- full-data RE pool (PM) ----
res  <- rma(yi, vi, method = "PM")

## ---- cumulative estimates (ordered by year) ----
cum  <- cumul(res, order = yr)

## The JS engine uses exactly 1.96 for 95% CI (not qnorm(0.975)=1.95996...).
## To ensure tol=1e-6 parity on CI bounds, recompute from estimate+se with 1.96.
z196 <- 1.96

## Last (= full pool) step
last <- k
mu_final  <- as.numeric(cum$estimate[last])
se_final  <- as.numeric(cum$se[last])
lo_final  <- mu_final - z196 * se_final
hi_final  <- mu_final + z196 * se_final

## Penultimate step (k-1 studies)
penult <- k - 1L
mu_penu  <- as.numeric(cum$estimate[penult])
se_penu  <- as.numeric(cum$se[penult])
lo_penu  <- mu_penu - z196 * se_penu
hi_penu  <- mu_penu + z196 * se_penu

## tau2 and I2 from the full-data fit
tau2_full <- as.numeric(res$tau2)
i2_full   <- as.numeric(res$I2)
Q_full    <- as.numeric(res$QE)

cat(toJSON(list(
  ## Final cumulative step (all k studies)
  mu_final  = mu_final,
  se_final  = se_final,
  lo_final  = lo_final,
  hi_final  = hi_final,
  ## Penultimate cumulative step (k-1 studies)
  mu_penu   = mu_penu,
  se_penu   = se_penu,
  lo_penu   = lo_penu,
  hi_penu   = hi_penu,
  ## Full-data heterogeneity
  tau2      = tau2_full,
  i2        = i2_full,
  Q         = Q_full,
  k         = as.integer(k)
), auto_unbox = TRUE, digits = 15))
cat("\n")
