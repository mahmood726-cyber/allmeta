## gen-metasens-fixture.R — regenerate copas-metasens-fixture.json.
##
##   Rscript copas/tests/fixtures/gen-metasens-fixture.R
##
## Pins and ASSERTS the reference versions; a version difference aborts rather
## than silently producing a fixture the test would then enshrine.
## The fixture is the reference for copas/tests/copas-core-metasens.test.mjs,
## which checks shared/copas-core.js against metasens::copas() without a browser.
suppressPackageStartupMessages({
  library(metasens); library(meta); library(metadat); library(jsonlite)
})
PINS <- list(R = "4.6.0", metasens = "1.5.3", meta = "8.5.0", metadat = "1.6.0")
act <- list(R = paste(R.version$major, R.version$minor, sep = "."),
            metasens = as.character(packageVersion("metasens")),
            meta = as.character(packageVersion("meta")),
            metadat = as.character(packageVersion("metadat")))
for (p in names(PINS)) if (!identical(PINS[[p]], act[[p]]))
  stop(sprintf("version pin failed: %s needs %s, have %s", p, PINS[[p]], act[[p]]))

data(dat.hackshaw1998, package = "metadat")
TE <- dat.hackshaw1998$yi
seTE <- sqrt(dat.hackshaw1998$vi)
keep <- is.finite(TE) & is.finite(seTE) & seTE > 0
TE <- TE[keep]; seTE <- seTE[keep]

ll <- metasens:::copas.loglik.without.beta
gr <- metasens:::copas.gradient.without.beta
llb <- metasens:::copas.loglik.with.beta

mk <- function(method.tau, ngrid) {
  m <- metagen(TE = TE, seTE = seTE, sm = "MD", method.tau = method.tau)
  cp <- suppressWarnings(copas(m, ngrid = ngrid))
  rho.bound <- 0.9999
  left <- as.logical(sign(suppressWarnings(
    metabias(m, meth = "linreg", k.min = 3))$estimate[1]) == 1)
  rho0 <- if (left) rho.bound / 2 else -rho.bound / 2
  gamma0.rescale <- (cp$gamma0 - min(cp$gamma0)) / (max(cp$gamma0) - min(cp$gamma0))
  gamma1.rescale <- (cp$gamma1 - min(cp$gamma1)) / (max(cp$gamma1) - min(cp$gamma1))
  lines <- contourLines(x = gamma0.rescale, y = gamma1.rescale,
                        z = cp$TE.contour, nlevels = 10)
  ## gamma0.slope / gamma1.slope are not returned by copas(); rebuild them the
  ## way copas() does and keep them for the port to reproduce.
  x.s <- (1 - cp$slope - cp$regr$intercepts) / (cp$regr$slopes - cp$slope)
  y.s <- 1 + cp$slope * (x.s - 1)
  g0.s <- x.s * (max(cp$gamma0) - min(cp$gamma0)) + min(cp$gamma0)
  g1.s <- y.s * (max(cp$gamma1) - min(cp$gamma1)) + min(cp$gamma1)
  sel <- g0.s >= min(cp$gamma0.range) & g0.s <= max(cp$gamma0.range) &
         g1.s >= min(cp$gamma1.range) & g1.s <= max(cp$gamma1.range)
  g0.s <- g0.s[sel]; g1.s <- g1.s[sel]
  ord <- rev(order(pnorm(g0.s + g1.s / max(seTE))))
  g0.s <- c(10, g0.s[ord]); g1.s <- c(0, g1.s[ord])
  ## and the gradient at copas()'s own reported parameters
  grad <- t(vapply(seq_along(g0.s), function(i)
    gr(c(cp$TE.slope[i], cp$rho.slope[i], cp$tau.slope[i]),
       gamma = c(g0.s[i], g1.s[i]), TE = TE, seTE = seTE), numeric(3)))
  ## The contour fits' full parameter vectors and attained objective values.
  ## copas() does not return them, and without them the attained objective
  ## cannot be compared at a grid point, which is where metasens's own optimiser
  ## turns out to stall. Rebuilt with copas()'s exact optim call; TE.contour from
  ## this rebuild is asserted against copas()'s own below.
  cmu <- crho <- ctau <- cval <- numeric(ngrid * ngrid)
  j0 <- NULL
  for (i in seq_along(cp$gamma0)) for (j in seq_along(cp$gamma1)) {
    try(j0 <- optim(c(cp$TE.random, rho0, cp$tau), fn = ll, gr = gr,
                    lower = c(-Inf, -rho.bound, 0), upper = c(Inf, rho.bound, Inf),
                    gamma = c(cp$gamma0[i], cp$gamma1[j]), TE = TE, seTE = seTE,
                    method = "L-BFGS-B"), silent = TRUE)
    idx <- i + (j - 1L) * ngrid
    cmu[idx] <- j0$par[1]; crho[idx] <- j0$par[2]
    ctau[idx] <- j0$par[3]; cval[idx] <- j0$value
  }
  stopifnot(identical(as.numeric(cp$TE.contour), cmu))
  list(method.tau = method.tau, ngrid = ngrid,
       TE.random = as.numeric(cp$TE.random), seTE.random = as.numeric(cp$seTE.random),
       tau = as.numeric(cp$tau), left = left, rho0 = rho0, rho.bound = rho.bound,
       gamma0.range = cp$gamma0.range, gamma1.range = cp$gamma1.range,
       gamma0 = cp$gamma0, gamma1 = cp$gamma1,
       gamma0.rescale = gamma0.rescale, gamma1.rescale = gamma1.rescale,
       TE.contour = as.numeric(cp$TE.contour),
       contour.mu = cmu, contour.rho = crho, contour.tau = ctau,
       contour.value = cval,
       pretty.levels = pretty(range(cp$TE.contour, na.rm = TRUE), 10),
       contour.lines = lapply(lines, function(l)
         list(level = l$level, x = l$x, y = l$y)),
       regr = cp$regr, slope = cp$slope,
       gamma0.slope = g0.s, gamma1.slope = g1.s,
       publprob = cp$publprob,
       TE.slope = cp$TE.slope, seTE.slope = cp$seTE.slope,
       rho.slope = cp$rho.slope, tau.slope = cp$tau.slope,
       loglik1 = cp$loglik1, loglik2 = cp$loglik2,
       gradient.at.par = grad,
       pval.rsb = cp$pval.rsb, N.unpubl = cp$N.unpubl,
       lower.slope = cp$lower.slope, upper.slope = cp$upper.slope,
       TE.adjust = cp$TE.adjust, seTE.adjust = cp$seTE.adjust,
       lower.adjust = cp$lower.adjust, upper.adjust = cp$upper.adjust,
       pval.adjust = cp$pval.adjust, tau.adjust = cp$tau.adjust,
       pval.rsb.adj = cp$pval.rsb.adj, N.unpubl.adj = cp$N.unpubl.adj,
       sign.rsb = cp$sign.rsb, level.ma = cp$level.ma)
}

out <- list(
  meta = list(generated = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
              R = R.version.string, versions = act,
              dataset = "metadat::dat.hackshaw1998 (yi, sqrt(vi))",
              k = length(TE)),
  TE = TE, seTE = seTE,
  configs = list(REML_10 = mk("REML", 10L), REML_20 = mk("REML", 20L),
                 DL_10 = mk("DL", 10L))
)
path <- file.path("copas", "tests", "fixtures", "copas-metasens-fixture.json")
writeLines(toJSON(out, auto_unbox = TRUE, digits = NA, na = "string",
                  matrix = "rowmajor"), path)
cat("wrote", path, "with", length(out$configs), "configurations, k =", length(TE), "\n")
