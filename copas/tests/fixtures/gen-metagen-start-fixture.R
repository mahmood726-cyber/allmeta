## gen-metagen-start-fixture.R -- reference for metagen-start.test.mjs.
##
## metasens::copas() starts EVERY profile fit at c(TE.random, rho0, tau) from
## the meta::metagen() object. Those two numbers come from metafor::rma.uni()
## (tau^2, REML Fisher scoring or DL) and meta's weighted.mean(); a start that
## is off by a few ulps sends R's L-BFGS-B down a different path, which is what
## left the page's objective up to 1.5e-6 above metasens's at 12 contour points
## of the allmeta Copas validation archive (Tier O). This fixture records R's
## start values BIT-EXACTLY (C99 hex floats) so the port can be held to them.
##
## Inputs: every (TE, seTE) input of the Copas validation archive's corpus
## (data/corpus.rds, built from metadat 1.6.0 by its analysis/build_corpus.R)
## with k <= 120 -- stored here as hex so the test needs neither R nor the
## archive. Plus the 12 Tier-O grid points, with metasens's attained objective.
##
## Usage: Rscript gen-metagen-start-fixture.R <corpus.rds> <out.json>
## Requires R 4.6.0, meta 8.5.0, metafor 5.0.1, metasens 1.5.3.
suppressMessages({library(meta); library(metasens); library(jsonlite)})
stopifnot(as.character(packageVersion("meta")) == "8.5.0",
          as.character(packageVersion("metafor")) == "5.0.1",
          as.character(packageVersion("metasens")) == "1.5.3")
a <- commandArgs(TRUE); inputs <- readRDS(a[1])
hx <- function(v) sprintf("%a", v)
starts <- list(); byid <- list()
for (inp in inputs) {
  if (length(inp$TE) > 120) next
  byid[[inp$id]] <- inp
  for (mt in c("REML", "DL")) {
    m <- metagen(TE = inp$TE, seTE = inp$seTE, sm = "MD", method.tau = mt,
                 method.tau.ci = "")
    sel <- !is.na(m$TE) & !is.na(m$seTE)
    starts[[length(starts) + 1]] <- list(id = inp$id, method = mt,
      TE = hx(m$TE[sel]), seTE = hx(m$seTE[sel]), tau2 = hx(m$tau2), tau = hx(m$tau),
      TE_random = hx(m$TE.random), seTE_random = hx(m$seTE.random))
  }
}
## The 12 Tier-O points (archive comparison log, optimality:TE.contour), index
## 0-based column-major as the archive's compare.py stores them.
pts <- list(c("dat.lau1992::2x2n_OR","C3",147), c("dat.lau1992::2x2n_OR","C3",228),
  c("dat.lau1992::2x2n_OR","C3",346), c("dat.lau1992::2x2n_OR","C3",366),
  c("dat.lau1992::2x2n_RR","C3",96), c("dat.lau1992::2x2n_RR","C3",173),
  c("dat.lau1992::2x2n_RR","C3",231), c("dat.lau1992::2x2n_RR","C3",316),
  c("dat.raudenbush1985::yi_vi","C1",66), c("dat.raudenbush1985::yi_vi","C1",370),
  c("dat.raudenbush1985::yi_vi","C3",241), c("dat.raudenbush1985::yi_vi","C3",374))
points <- list()
for (p in pts) {
  inp <- byid[[p[1]]]; mt <- if (p[2] == "C3") "DL" else "REML"; ngrid <- 20L
  m <- metagen(TE = inp$TE, seTE = inp$seTE, sm = "MD", method.tau = mt, method.tau.ci = "")
  TE <- m$TE; seTE <- m$seTE
  g1r <- c(0, 1.29 / (1 / min(seTE) - 1 / max(seTE))); g0r <- c(-0.25 - g1r[2] / max(seTE), 2)
  gamma0 <- seq(g0r[1], g0r[2], length = ngrid); gamma1 <- seq(g1r[1], g1r[2], length = ngrid)
  idx <- as.integer(p[3]); i <- idx %% ngrid + 1L; j <- idx %/% ngrid + 1L
  left <- as.logical(sign(as.numeric(metabias(m, meth = "linreg", k.min = 3)$estimate[1])) == 1)
  rho0 <- if (left) 0.9999 / 2 else -0.9999 / 2
  start <- c(m$TE.random, rho0, m$tau)
  o <- optim(start, fn = metasens:::copas.loglik.without.beta,
             gr = metasens:::copas.gradient.without.beta,
             lower = c(-Inf, -0.9999, 0), upper = c(Inf, 0.9999, Inf),
             gamma = c(gamma0[i], gamma1[j]), TE = TE, seTE = seTE, method = "L-BFGS-B")
  points[[length(points) + 1]] <- list(id = p[1], config = p[2], method = mt, index = idx,
    gamma = hx(c(gamma0[i], gamma1[j])), start = hx(start), value = hx(o$value),
    counts = o$counts[[1]])
}
writeLines(toJSON(list(generator = "gen-metagen-start-fixture.R",
  R = R.version.string, meta = "8.5.0", metafor = "5.0.1", metasens = "1.5.3",
  starts = starts, points = points), auto_unbox = TRUE, digits = NA), a[2])
cat(length(starts), "start cases,", length(points), "points\n")
