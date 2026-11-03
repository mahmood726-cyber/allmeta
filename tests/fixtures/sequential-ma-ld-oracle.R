## sequential-ma-ld-oracle.R -- reference values for tests/test_sequential_ma_exact.py.
## Run from the repository root:  Rscript tests/fixtures/sequential-ma-ld-oracle.R
## Efficacy boundaries: Lan-DeMets alpha-spending solved exactly with mvtnorm (Miwa, 1024 steps; uniroot tol 1e-12)
## under both spending conventions; futility: RTSA 0.2.2 non-binding design boundaries.
suppressPackageStartupMessages({ library(jsonlite); library(mvtnorm); library(RTSA) })
fam_spend <- function(fam, a, t) switch(fam, OBF = 2 * (1 - pnorm(qnorm(1 - a / 2) / sqrt(t))),
                                        POCOCK = a * log(1 + (exp(1) - 1) * t), LINEAR = a * t)
mvref <- function(inc, info, side) {
  K <- length(inc); b <- numeric(K); S <- outer(info, info, function(a, c) sqrt(pmin(a, c) / pmax(a, c)))
  for (k in 1:K) {
    if (k == 1) { b[1] <- qnorm(inc[1], lower.tail = FALSE); next }
    f <- function(x) { lo <- if (side == 2) c(-b[1:(k - 1)], x) else c(rep(-Inf, k - 1), x)
      as.numeric(pmvnorm(lower = lo, upper = c(b[1:(k - 1)], Inf), sigma = S[1:k, 1:k], algorithm = Miwa(steps = 1024))) - inc[k] }
    b[k] <- uniroot(f, c(0, 12), tol = 1e-12)$root
  }
  b
}
cfg <- list(list(t = c(.2, .4, .6, .8, 1), alpha = .05, side = 2, family = "OBF"),
            list(t = c(.25, .5, .75, 1), alpha = .05, side = 2, family = "POCOCK"),
            list(t = c(.3, .6, 1), alpha = .025, side = 1, family = "OBF"),
            list(t = c(.1, .15, .6, .95, 1), alpha = .05, side = 2, family = "LINEAR"),
            list(t = c(.4, .8, 1.25), alpha = .05, side = 2, family = "OBF"))
for (i in seq_along(cfg)) { cf <- cfg[[i]]; tt <- pmin(cf$t, 1)
  cfg[[i]]$total <- mvref(diff(c(0, fam_spend(cf$family, cf$alpha, tt))) / cf$side, cf$t, cf$side)
  cfg[[i]]$per_side <- mvref(diff(c(0, fam_spend(cf$family, cf$alpha / cf$side, tt))), cf$t, cf$side) }
fut <- list(list(t = c(.25, .5, .75, 1), alpha = .05, beta = .1, side = 2, family = "OBF", beta_family = "OBF"),
            list(t = c(.5, .75, 1), alpha = .025, beta = .1, side = 1, family = "OBF", beta_family = "OBF"),
            list(t = c(.33, .66, 1), alpha = .025, beta = .1, side = 1, family = "OBF", beta_family = "POCOCK"))
es <- c(OBF = "esOF", POCOCK = "esPoc")
for (i in seq_along(fut)) { f <- fut[[i]]
  b <- boundaries(timing = f$t, alpha = f$alpha, beta = f$beta, side = f$side, futility = "non-binding",
                  es_alpha = es[[f$family]], es_beta = es[[f$beta_family]])
  fut[[i]]$efficacy <- b$alpha_ubound; fut[[i]]$root <- b$root
  fut[[i]]$futility <- if (f$side == 1) b$beta_lbound else b$beta_ubound }
z <- c(-8, -5, -3, -1, 0, 1, 2.5, 5, 8)
out <- list(pnorm = list(z = z, lower = pnorm(z), upper = pnorm(z, lower.tail = FALSE)), efficacy = cfg, futility = fut,
            versions = list(R = R.version.string, mvtnorm = as.character(packageVersion("mvtnorm")), RTSA = as.character(packageVersion("RTSA"))))
writeLines(toJSON(out, auto_unbox = TRUE, digits = NA, pretty = TRUE, na = "null"), "tests/fixtures/sequential-ma-ld-oracle.json")
cat("wrote tests/fixtures/sequential-ma-ld-oracle.json\n")
