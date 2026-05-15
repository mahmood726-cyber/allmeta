## copas-oracle.R — deterministic parity oracle for the JS Copas profile-MLE.
##
## Strategy: do NOT try to reconstruct metasens's contourLines()-derived slope.
## Instead define a reproducible "publication-probability path" of (gamma0,
## gamma1) points (the conventional Copas sensitivity presentation: smallest-SE
## study essentially always published; largest-SE study's publprob swept down),
## then call metasens's OWN copas.loglik.without.beta + optim(L-BFGS-B) at each
## point exactly as metasens does internally (source lines 224-248). The JS
## engine must reproduce (TE, rho, tau, seTE) at the identical (gamma0, gamma1).
## This isolates engine parity from R's contour algorithm.
suppressPackageStartupMessages({library(metasens); library(meta); library(jsonlite)})

cat("===== metasens:::lambda (port this exactly) =====\n")
print(metasens:::lambda)

d  <- read.csv("C:/Projects/allmeta/copas/tests/fixtures/copas-tiny.csv")
TE <- d$yi; seTE <- d$sei
m  <- metagen(TE = TE, seTE = seTE, sm = "MD", method.tau = "DL")
TE.random <- as.numeric(m$TE.random)
tau       <- as.numeric(m$tau)
rho.bound <- 0.9999
seMin <- min(seTE); seMax <- max(seTE)

## left: same determination metasens uses (Egger linreg sign).
left <- as.logical(sign(metabias(m, meth = "linreg", k.min = 3)$estimate[1]) == 1)
rho0 <- if (left) rho.bound / 2 else -rho.bound / 2

## Reproducible publprob path. p = publication prob of the largest-SE study;
## smallest-SE study pinned at pHi (~always published). Solve the 2 linear eqns
##   g0 + g1/seMin = qnorm(pHi)
##   g0 + g1/seMax = qnorm(p)
pHi    <- 0.9999
pgrid  <- c(1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3)

ll <- metasens:::copas.loglik.without.beta
gr <- metasens:::copas.gradient.without.beta

rows <- list()
seTE.prev <- NA_real_
for (idx in seq_along(pgrid)) {
  p <- pgrid[idx]
  if (p >= 1) {                       # no selection: unadjusted RE baseline
    g1 <- 0; g0 <- qnorm(pHi)
  } else {
    g1 <- (qnorm(pHi) - qnorm(p)) / (1 / seMin - 1 / seMax)
    g0 <- qnorm(pHi) - g1 / seMin
  }
  fit <- optim(c(TE.random, rho0, tau), fn = ll, gr = gr,
               lower = c(-Inf, -rho.bound, 0), upper = c(Inf, rho.bound, Inf),
               gamma = c(g0, g1), TE = TE, seTE = seTE, method = "L-BFGS-B")
  fitH <- optim(c(TE.random, rho0, tau), fn = ll, gr = gr,
                lower = c(-Inf, -rho.bound, 0), upper = c(Inf, rho.bound, Inf),
                gamma = c(g0, g1), TE = TE, seTE = seTE,
                method = "L-BFGS-B", hessian = TRUE)
  ## Raw Hessian-based seTE (pure engine output; the parity test targets this
  ## where finite). Then the faithful metasens fallback (copas source 241-248)
  ## for the path-dependent display value the app must reproduce.
  seTE.raw <- tryCatch(sqrt(solve(fitH$hessian + 1e-08)[1, 1]),
                        error = function(e) NA_real_)
  seTEi <- seTE.raw
  if (idx > 1 && (is.na(seTEi) || seTEi == 0)) seTEi <- seTE.prev
  if (is.na(seTEi) || seTEi == 0)
    seTEi <- tryCatch(sqrt(1 / fitH$hessian[1, 1]),
                       error = function(e) NA_real_)
  seTE.prev <- seTEi
  p.si  <- pnorm(g0 + g1 / seTE)
  rows[[length(rows) + 1]] <- list(
    publprob = p, gamma0 = g0, gamma1 = g1,
    TE = fit$par[1], rho = fit$par[2], tau = fit$par[3],
    seTE_hessian = ifelse(is.finite(seTE.raw), seTE.raw, NA_real_),
    seTE = seTEi, negloglik = fit$value,
    N_unpubl = sum((1 - p.si) / p.si))
}

oracle <- list(
  fixture = "copas-tiny", seTE_min = seMin, seTE_max = seMax,
  TE_random = TE.random, tau_dl = tau, rho_bound = rho.bound,
  left = left, rho0 = rho0, pHi = pHi,
  points = do.call(rbind.data.frame, rows))
writeLines(toJSON(oracle, auto_unbox = TRUE, digits = 12, dataframe = "rows"),
           "C:/Projects/allmeta/copas/tests/fixtures/copas-oracle.json")
cat("\nwrote copas-oracle.json with", length(rows), "points\n")
print(oracle$points)
