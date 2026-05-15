## mcmc-oracle.R — authoritative reference for bayesian-mcmc.
## The app's Gibbs sampler targets the normal-normal random-effects model
##   y_i ~ N(theta_i, s_i^2), theta_i ~ N(mu, tau^2),
##   mu ~ N(0, 1000^2),  tau ~ half-normal(scale = tauPrior).
## R's bayesmeta computes this posterior EXACTLY (deterministic numerical
## integration, no MCMC) -> the gold standard the MCMC must approach
## within Monte-Carlo error.
suppressPackageStartupMessages({library(bayesmeta); library(jsonlite)})

te <- c(0.30, 0.10, 0.45, 0.22, 0.55, 0.05)
se <- c(0.10, 0.12, 0.15, 0.09, 0.20, 0.08)
tauPrior <- 0.5

bm <- bayesmeta(y = te, sigma = se,
                mu.prior.mean = 0, mu.prior.sd = 1000,
                tau.prior = function(t) dhalfnormal(t, scale = tauPrior))

S <- bm$summary   # rows: mode/median/mean/sd/95%lower/95%upper ; cols: tau,mu,theta
oracle <- list(
  studies = lapply(seq_along(te), function(i) list(te = te[i], se = se[i])),
  tauPrior = tauPrior,
  mu = list(mean = S["mean", "mu"], sd = S["sd", "mu"],
            lo = S["95% lower", "mu"], hi = S["95% upper", "mu"],
            median = S["median", "mu"]),
  tau = list(mean = S["mean", "tau"], sd = S["sd", "tau"],
             lo = S["95% lower", "tau"], hi = S["95% upper", "tau"],
             median = S["median", "tau"]))
writeLines(toJSON(oracle, auto_unbox = TRUE, digits = 10),
  "C:/Projects/allmeta/bayesian-mcmc/tests/fixtures/mcmc-oracle.json")
cat("wrote mcmc-oracle.json\n")
cat("mu:  mean=", oracle$mu$mean, " sd=", oracle$mu$sd,
    " CI=[", oracle$mu$lo, ",", oracle$mu$hi, "]\n")
cat("tau: mean=", oracle$tau$mean, " sd=", oracle$tau$sd,
    " CI=[", oracle$tau$lo, ",", oracle$tau$hi, "]\n")
