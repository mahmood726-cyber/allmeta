## limit-tiny.R — R-parity for limit meta-analysis (Rücker 2011)
##
## Computes the limit meta-analysis using metasens::limitmeta() on top of
## meta::metagen() with DL heterogeneity estimator.
##
## metasens::limitmeta() fields:
##   TE.adjust    = scalar limit-adjusted pooled estimate (theta.limit)
##   seTE.adjust  = SE of the limit-adjusted estimate
##   TE.random    = unadjusted DL random-effects estimate
##   seTE.random  = SE of unadjusted RE estimate
##   tau          = sqrt(tau2) from DL
##   beta.r       = slope of Rücker regression (se → effect drift)
##   G.squared    = inconsistency statistic
##
## Key values (2026-05-14, R 4.5.2, metasens):
##   k         = 10
##   te_re     = 0.5300923657391    (DL RE pooled, unadjusted)
##   se_re     = 0.04306742585149
##   tau       = 0.08504039784495   (sqrt(tau2))
##   te_adj    = 0.411998...        (limit-adjusted; attenuated vs RE)
##   se_adj    = 0.08879212...
##   te_fe     = 0.5121282168817    (FE pooled)
##   se_fe     = 0.03141100465003
##   beta_r    = slope of Rücker regression (positive = small-study effect)
##
## NOTE: The JS engine uses a simplified WLS regression of te ~ SE weighted by
## 1/(se² + tau²) and extrapolates to SE=0 as the limit estimate.
## metasens::limitmeta() uses the full Rücker (2011) algorithm with an additional
## residual decomposition. Therefore:
##   (a) RE/FE baseline estimates match (tol=1e-6 — closed-form identical)
##   (b) Limit estimate: JS approximation vs R full algorithm — direction must match
##       (te_adj < te_re for this small-study-effect fixture), tolerance 1e-1
##   (c) beta.r (slope): positive consistent with small studies having larger effects
##   (d) tau: shared DL estimator — match at tol=1e-6
##
## Usage (called by test_against_metasens.py):
##   Rscript --vanilla limit-tiny.R limit-tiny.csv

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
tau    <- as.numeric(m$tau)
tau2   <- as.numeric(m$tau^2)
te_fe  <- as.numeric(m$TE.common)
se_fe  <- as.numeric(m$seTE.common)
k      <- as.integer(nrow(d))

# Limit meta-analysis (Rücker 2011) via metasens::limitmeta()
lm_fit <- limitmeta(m)

te_adj  <- as.numeric(lm_fit$TE.adjust)
se_adj  <- as.numeric(lm_fit$seTE.adjust)
beta_r  <- as.numeric(lm_fit$beta.r)
alpha_r <- as.numeric(lm_fit$alpha.r)

result <- list(
  k       = k,
  te_re   = te_re,
  se_re   = se_re,
  tau     = tau,
  tau2    = tau2,
  te_fe   = te_fe,
  se_fe   = se_fe,
  te_adj  = te_adj,
  se_adj  = se_adj,
  beta_r  = beta_r,
  alpha_r = alpha_r
)

cat(toJSON(result, auto_unbox = TRUE, digits = 12))
cat("\n")
