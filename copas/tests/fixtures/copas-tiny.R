## copas-tiny.R — R-parity for copas selection model
##
## The JS engine (copas/index.html) implements a simplified Copas selection model:
##   - Selection probability: p_i = Phi(a - gamma/se_i)  [HT-reweighted]
##   - Binary-search for intercept `a` such that mean p_i = 1 - pUnobs
##   - Adjusted pooled estimate: sum((w_i/p_i) * te_i) / sum(w_i/p_i)
##     where w_i = 1/se_i^2
##
## This script uses metasens::copas() (full MLE grid over gamma0/gamma1)
## to produce the canonical reference values for the fixture.
##
## Key values (2026-05-14, R 4.5.2, metasens):
##   te_re   = 0.248973119064    (DL RE pooled, unadjusted baseline)
##   se_re   = 0.032431596631
##   tau2_dl = 0.0005030100235
##   te_fe   = 0.246944262521    (FE pooled)
##   se_fe   = 0.031411004650
##   te_adj  = 0.216959372226    (Copas MLE-adjusted; attenuated vs RE as expected)
##   se_adj  = 0.035016325088
##   slope   = 0.477176161301    (positive: small-study effects larger than large-study)
##   rho_bound = 0.9999
##
## NOTE: As of the Copas-MLE rewrite the JS engine implements the FULL
## Copas & Shi (2000) profile likelihood (faithful port of
## metasens:::copas.loglik.without.beta). Engine R-parity is verified by
## copas-oracle.R + tests/copas-parity.spec.mjs (profile MLE matches
## metasens to ~1e-4 on effect / rho [where identified] / tau at shared
## (gamma0,gamma1) points). This script remains the unadjusted-baseline
## reference: the JS fe_pooled/fe_se match metafor to 1e-6, and te_adj/
## slope/rho_bound below stay valid metasens::copas() values. metasens's
## single auto-selected te_adj (contourLines slope machinery) is NOT
## reproduced by the app by design — it reports the full sensitivity curve.
##
## Usage (called by test_against_metasens.py):
##   Rscript --vanilla copas-tiny.R copas-tiny.csv

suppressPackageStartupMessages(library(metasens))
suppressPackageStartupMessages(library(meta))
suppressPackageStartupMessages(library(jsonlite))

args <- commandArgs(trailingOnly = TRUE)
csv_path <- if (length(args) >= 1) args[1] else stop("supply CSV path as argument")
d <- read.csv(csv_path)
# columns: study, yi, sei

m <- metagen(TE = d$yi, seTE = d$sei, sm = 'MD', method.tau = 'DL',
             studlab = d$study)

# Unadjusted estimates
te_re  <- as.numeric(m$TE.random)
se_re  <- as.numeric(m$seTE.random)
tau2   <- as.numeric(m$tau^2)
te_fe  <- as.numeric(m$TE.common)
se_fe  <- as.numeric(m$seTE.common)
k      <- as.integer(nrow(d))

# Copas selection model
cp <- copas(m)

te_adj    <- as.numeric(cp$TE.adjust)
se_adj    <- as.numeric(cp$seTE.adjust)
slope     <- as.numeric(cp$slope)
rho_bound <- as.numeric(cp$rho.bound)

result <- list(
  k         = k,
  te_re     = te_re,
  se_re     = se_re,
  tau2_dl   = tau2,
  te_fe     = te_fe,
  se_fe     = se_fe,
  te_adj    = te_adj,
  se_adj    = se_adj,
  slope     = slope,
  rho_bound = rho_bound
)

cat(toJSON(result, auto_unbox = TRUE, digits = 12))
cat("\n")
