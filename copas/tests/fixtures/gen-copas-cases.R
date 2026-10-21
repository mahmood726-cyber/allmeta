## gen-copas-cases.R — regenerate copas-cases-fixture.json.
##
##   Rscript copas/tests/fixtures/gen-copas-cases.R      (from the repo root)
##
## The companion to gen-metasens-fixture.R, which covers ONE dataset
## (dat.hackshaw1998, k = 37) in three configurations. That leaves the
## repo-resident suite with no small-k case, only one value of metasens's
## `left`, no all-negative contour surface, no saddle cell and no R reference
## at all for the unadjusted pool the page displays. This file supplies those
## four things (review-212 MAJOR-5 and MAJOR-9):
##
##   A. POOLS — meta::metagen()'s common-effect and random-effects estimates
##      under both tau2 methods, on two datasets. The page's startValues()
##      gets TE.random / seTE.random / tau from window.AlmMaCore.pool() in
##      shared/ma-core.js, and displays the unadjusted random-effects estimate
##      as the first row of its summary table, so this is a DISPLAYED value
##      with no R reference anywhere in the repository. copas-core.js's own
##      closed-form DerSimonian-Laird fallback is checked against the same
##      values; it is never exercised by the metasens fixture, which always
##      supplies TE_random explicitly.
##
##   B. SMALL k AND BOTH `left` BRANCHES — full copas() output on k = 8, in
##      both selection directions. k = 8 is in the 3 <= k < 15 range the page
##      permits but warns about, and the regime the metasens fixture (k = 37)
##      says nothing about. `left` is metasens's Egger-sign determination; it
##      flips both rho0's sign and the with-beta fit's rho box, so roughly half
##      the selection model's sign logic is unexercised while only one value of
##      it appears in the fixtures. The second case is the first with every
##      effect negated: the Copas model is sign-symmetric in the effect, so
##      this is the cleanest reproducible way to reach left = FALSE, and the
##      two cases together pin the sign logic against R rather than against
##      an assumption of symmetry.
##
##   C. CONTOUR QUIRKS — grDevices::contourLines() and base::pretty() on
##      hand-built surfaces that reach the two R quirks copas-core.js
##      deliberately reproduces:
##        R-QUIRK 1  the `xl` swap-temporary leak in the four-intersection
##                   branch — needs a saddle cell
##        R-QUIRK 2  zmax initialised to DBL_MIN rather than -DBL_MAX, so an
##                   all-negative surface keeps zmax = DBL_MIN and `atom`
##                   becomes 1e-3 * (DBL_MIN - zmin) — needs an all-negative
##                   surface
##      Both look like bugs. A future contributor will try to "fix" them, and
##      until now nothing in the repository would have failed if they did.
##      Also an NA-cornered surface and a constant surface, which take the
##      nacode branches.
##
## Pins and ASSERTS the reference versions, as gen-metasens-fixture.R does.
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

FIXDIR <- file.path("copas", "tests", "fixtures")
if (!dir.exists(FIXDIR))
  stop("run this from the repo root: ", file.path(FIXDIR, "gen-copas-cases.R"))

data(dat.hackshaw1998, package = "metadat")
H.TE <- dat.hackshaw1998$yi
H.seTE <- sqrt(dat.hackshaw1998$vi)
keep <- is.finite(H.TE) & is.finite(H.seTE) & H.seTE > 0
H.TE <- H.TE[keep]; H.seTE <- H.seTE[keep]

## The small-k case: the eight LEAST precise studies of hackshaw1998. Chosen by
## a deterministic rule (order by seTE descending, take 8) rather than by hand,
## so it can be re-derived, and deliberately the imprecise tail, where a
## selection model has something to find.
ord <- order(H.seTE, decreasing = TRUE)[1:8]
S.TE <- H.TE[ord]; S.seTE <- H.seTE[ord]

## ---------------------------------------------------------------- A. pools
pools <- function(TE, seTE) {
  out <- list()
  for (mt in c("REML", "DL")) {
    m <- metagen(TE = TE, seTE = seTE, sm = "MD", method.tau = mt)
    out[[mt]] <- list(
      method.tau = mt,
      TE.common = as.numeric(m$TE.common), seTE.common = as.numeric(m$seTE.common),
      TE.random = as.numeric(m$TE.random), seTE.random = as.numeric(m$seTE.random),
      tau = as.numeric(m$tau), tau2 = as.numeric(m$tau^2),
      Q = as.numeric(m$Q), df.Q = as.numeric(m$df.Q), I2 = as.numeric(m$I2))
  }
  out
}

## ------------------------------------------------- B. small k, both `left`
ll <- metasens:::copas.loglik.without.beta
gr <- metasens:::copas.gradient.without.beta

mkCase <- function(TE, seTE, ngrid) {
  m <- metagen(TE = TE, seTE = seTE, sm = "MD", method.tau = "REML")
  cp <- suppressWarnings(copas(m, ngrid = ngrid))
  rho.bound <- 0.9999
  left <- as.logical(sign(suppressWarnings(
    metabias(m, meth = "linreg", k.min = 3))$estimate[1]) == 1)
  rho0 <- if (left) rho.bound / 2 else -rho.bound / 2
  g0.res <- (cp$gamma0 - min(cp$gamma0)) / (max(cp$gamma0) - min(cp$gamma0))
  g1.res <- (cp$gamma1 - min(cp$gamma1)) / (max(cp$gamma1) - min(cp$gamma1))
  lines <- contourLines(x = g0.res, y = g1.res, z = cp$TE.contour, nlevels = 10)
  ## gamma0.slope / gamma1.slope the way copas() builds them internally.
  x.s <- (1 - cp$slope - cp$regr$intercepts) / (cp$regr$slopes - cp$slope)
  y.s <- 1 + cp$slope * (x.s - 1)
  g0.s <- x.s * (max(cp$gamma0) - min(cp$gamma0)) + min(cp$gamma0)
  g1.s <- y.s * (max(cp$gamma1) - min(cp$gamma1)) + min(cp$gamma1)
  sel <- g0.s >= min(cp$gamma0.range) & g0.s <= max(cp$gamma0.range) &
         g1.s >= min(cp$gamma1.range) & g1.s <= max(cp$gamma1.range)
  g0.s <- g0.s[sel]; g1.s <- g1.s[sel]
  o <- rev(order(pnorm(g0.s + g1.s / max(seTE))))
  g0.s <- c(10, g0.s[o]); g1.s <- c(0, g1.s[o])
  ## Per-grid-point attained objective, with copas()'s exact optim call, so the
  ## port's optimality can be checked here too. TE.contour from this rebuild is
  ## asserted against copas()'s own.
  cmu <- cval <- numeric(ngrid * ngrid)
  j0 <- NULL
  for (i in seq_along(cp$gamma0)) for (j in seq_along(cp$gamma1)) {
    try(j0 <- optim(c(cp$TE.random, rho0, cp$tau), fn = ll, gr = gr,
                    lower = c(-Inf, -rho.bound, 0), upper = c(Inf, rho.bound, Inf),
                    gamma = c(cp$gamma0[i], cp$gamma1[j]), TE = TE, seTE = seTE,
                    method = "L-BFGS-B"), silent = TRUE)
    idx <- i + (j - 1L) * ngrid
    cmu[idx] <- j0$par[1]; cval[idx] <- j0$value
  }
  stopifnot(identical(as.numeric(cp$TE.contour), cmu))
  list(k = length(TE), ngrid = ngrid, method.tau = "REML",
       TE = TE, seTE = seTE,
       TE.random = as.numeric(cp$TE.random), seTE.random = as.numeric(cp$seTE.random),
       tau = as.numeric(cp$tau), left = left, rho0 = rho0, rho.bound = rho.bound,
       egger.estimate = as.numeric(suppressWarnings(
         metabias(m, meth = "linreg", k.min = 3))$estimate[1]),
       gamma0.range = cp$gamma0.range, gamma1.range = cp$gamma1.range,
       gamma0 = cp$gamma0, gamma1 = cp$gamma1,
       gamma0.rescale = g0.res, gamma1.rescale = g1.res,
       TE.contour = as.numeric(cp$TE.contour), contour.value = cval,
       pretty.levels = pretty(range(cp$TE.contour, na.rm = TRUE), 10),
       contour.lines = lapply(lines, function(l)
         list(level = l$level, x = l$x, y = l$y)),
       regr = cp$regr, slope = cp$slope,
       gamma0.slope = g0.s, gamma1.slope = g1.s,
       publprob = cp$publprob,
       TE.slope = cp$TE.slope, seTE.slope = cp$seTE.slope,
       rho.slope = cp$rho.slope, tau.slope = cp$tau.slope,
       loglik1 = cp$loglik1, loglik2 = cp$loglik2,
       pval.rsb = cp$pval.rsb, N.unpubl = cp$N.unpubl,
       lower.slope = cp$lower.slope, upper.slope = cp$upper.slope,
       TE.adjust = cp$TE.adjust, seTE.adjust = cp$seTE.adjust,
       lower.adjust = cp$lower.adjust, upper.adjust = cp$upper.adjust,
       pval.adjust = cp$pval.adjust, tau.adjust = cp$tau.adjust,
       pval.rsb.adj = cp$pval.rsb.adj, N.unpubl.adj = cp$N.unpubl.adj,
       sign.rsb = cp$sign.rsb, level.ma = cp$level.ma)
}

## ------------------------------------------------------- C. contour quirks
## Surfaces are given as R matrices and emitted column-major (as.numeric), the
## same layout copas() hands contourLines() and the same layout the port uses.
surfaces <- list(
  ## R-QUIRK 2: every value negative, so contourLines()'s zmax starts at
  ## DBL_MIN and stays there, and `atom` becomes 1e-3 * (DBL_MIN - zmin).
  all_negative = matrix(c(-1.0, -1.4, -1.9, -2.5,
                          -1.3, -1.8, -2.4, -3.1,
                          -1.7, -2.3, -3.0, -3.8,
                          -2.2, -2.9, -3.7, -4.6), nrow = 4, byrow = TRUE),
  ## R-QUIRK 1: a saddle. The centre cell has two opposite corners high and two
  ## low, so a level crossing it produces FOUR intersections and takes the
  ## branch that reuses `xl` as a swap temporary without restoring it.
  saddle = matrix(c( 2.0,  1.0,  0.0, -1.0,  -2.0,
                     1.0,  0.5,  0.0, -0.5,  -1.0,
                     0.0,  0.0,  0.0,  0.0,   0.0,
                    -1.0, -0.5,  0.0,  0.5,   1.0,
                    -2.0, -1.0,  0.0,  1.0,   2.0), nrow = 5, byrow = TRUE),
  ## A sharper saddle, to make the four-intersection branch unambiguous.
  saddle2 = matrix(c( 1.0, -1.0,  1.0,
                     -1.0,  0.0, -1.0,
                      1.0, -1.0,  1.0), nrow = 3, byrow = TRUE),
  ## NA corners: the nacode branches.
  na_corners = matrix(c(NA,  1.0,  2.0,  NA,
                       1.0,  1.5,  2.5, 3.0,
                       2.0,  2.5,  3.5, 4.0,
                        NA,  3.0,  4.0,  NA), nrow = 4, byrow = TRUE),
  ## A constant surface: no level can cross anything.
  constant = matrix(rep(0.3, 16), nrow = 4),
  ## Mixed signs straddling zero, where pretty() must place a level AT zero.
  straddle = matrix(c(-0.6, -0.3,  0.0,  0.3,
                      -0.3,  0.0,  0.3,  0.6,
                       0.0,  0.3,  0.6,  0.9,
                       0.3,  0.6,  0.9,  1.2), nrow = 4, byrow = TRUE)
)

mkSurface <- function(z) {
  n <- nrow(z); m <- ncol(z)
  x <- seq(0, 1, length.out = n); y <- seq(0, 1, length.out = m)
  lv <- pretty(range(z, na.rm = TRUE), 10)
  lines <- contourLines(x = x, y = y, z = z, levels = lv)
  list(nrow = n, ncol = m, x = x, y = y,
       z = as.numeric(z),                       # column-major, as the port reads it
       pretty.levels = lv,
       contour.lines = lapply(lines, function(l)
         list(level = l$level, x = l$x, y = l$y)))
}

out <- list(
  meta = list(generated = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
              R = R.version.string, versions = act,
              datasets = list(
                hackshaw = "metadat::dat.hackshaw1998 (yi, sqrt(vi))",
                small_k = "the 8 largest-seTE studies of dat.hackshaw1998, by order(seTE, decreasing = TRUE)[1:8]",
                small_k_negated = "small_k with every effect negated, to reach left = FALSE")),
  pools = list(hackshaw = c(list(k = length(H.TE), TE = H.TE, seTE = H.seTE),
                            pools(H.TE, H.seTE)),
               small_k = c(list(k = length(S.TE), TE = S.TE, seTE = S.seTE),
                           pools(S.TE, S.seTE))),
  cases = list(small_k_10 = mkCase(S.TE, S.seTE, 10L),
               small_k_negated_10 = mkCase(-S.TE, S.seTE, 10L)),
  surfaces = lapply(surfaces, mkSurface)
)

## The two cases must actually differ in `left`, or case B has not been built.
if (identical(out$cases$small_k_10$left, out$cases$small_k_negated_10$left))
  stop("both small-k cases have left = ", out$cases$small_k_10$left,
       "; the point of the second case is to reach the other branch")
## And the small-k case must really be small-k.
stopifnot(out$cases$small_k_10$k == 8L, out$cases$small_k_10$k < 15L)
## R-QUIRK 2 needs a genuinely all-negative surface.
stopifnot(all(out$surfaces$all_negative$z < 0))

path <- file.path(FIXDIR, "copas-cases-fixture.json")
## digits = 17, for the reason gen-metasens-fixture.R gives: pretty()'s level
## count and contourLines' crossing test are DISCRETE functions of the values,
## so a one-ULP perturbation can change the answer the test demands.
writeLines(toJSON(out, auto_unbox = TRUE, digits = 17, na = "string",
                  matrix = "rowmajor"), path)
cat("wrote", path, "\n")
cat("  pools    :", paste(names(out$pools), collapse = ", "), "\n")
cat("  cases    :", paste(sprintf("%s (k=%d, left=%s)", names(out$cases),
      vapply(out$cases, function(c) c$k, integer(1)),
      vapply(out$cases, function(c) c$left, logical(1))), collapse = "; "), "\n")
cat("  surfaces :", paste(sprintf("%s (%dx%d, %d lines)", names(out$surfaces),
      vapply(out$surfaces, function(s) s$nrow, integer(1)),
      vapply(out$surfaces, function(s) s$ncol, integer(1)),
      vapply(out$surfaces, function(s) length(s$contour.lines), integer(1))),
      collapse = "; "), "\n")
