# Independent R reference for the multivariate-ma plus panel.
# Usage: Rscript --vanilla generate-plus.R plus/corpus.json plus/reference.json
# For every configuration of the plus corpus (92, derived from the P18 v1 validation corpus):
#   (a) supplied-covariance bivariate REML fit,
#   (b) a within-study correlation sweep: every study gets cov = rho_w*sqrt(v1*v2), rho_w in the corpus grid,
#   (c) univariate REML per outcome on the same rows (metafor::rma),
#   (d) z and two-sided normal p for every pooled mean.
# Bivariate fits: mvmeta::mvmeta(method="reml", bscov="unstr") from four starts, then refined by nlminb on
# mvmeta's own REML profile (remlprof.fn) with its analytic gradient (remlprof.gr). Boundaries adjudicated as in
# the P18 v1 validation (exact G=0 when the covariance score at 0 is PSD and the likelihood confirms; exact k=2).
args <- commandArgs(trailingOnly = TRUE)
inp <- if (length(args) >= 1) args[1] else "plus/corpus.json"
outp <- if (length(args) >= 2) args[2] else "plus/reference.json"
cat(R.version.string, "\n"); print(.libPaths())
for (p in c("mvmeta", "metafor", "jsonlite")) cat(p, as.character(packageVersion(p)), "\n")
MV_CONTROL <- list(maxiter = 10000, reltol = 1e-13, optim = list(maxit = 10000, reltol = 1e-13))
NLMINB_CONTROL <- list(rel.tol = 1e-15, x.tol = 1e-15, eval.max = 20000, iter.max = 10000)
RMA_CONTROL <- list(threshold = 1e-12, maxiter = 10000)
cat("mvmeta control:", deparse(MV_CONTROL), "\n")
cat("nlminb refinement control:", deparse(NLMINB_CONTROL), "\n")
cat("metafor::rma control:", deparse(RMA_CONTROL), "\n")

json17 <- function(x) {
  enc <- function(v) {
    if (is.null(v)) return("null")
    if (is.list(v)) {
      z <- vapply(v, enc, character(1))
      if (!is.null(names(v))) return(paste0("{", paste(paste0(vapply(names(v), function(s) encodeString(s, quote = '"'), ""), ":", z), collapse = ","), "}"))
      return(paste0("[", paste(z, collapse = ","), "]"))
    }
    atom <- function(a) {
      if (is.na(a)) return("null")
      if (is.numeric(a)) return(if (is.finite(a)) sprintf("%.17g", a) else "null")
      if (is.logical(a)) return(if (a) "true" else "false")
      encodeString(as.character(a), quote = '"')
    }
    z <- vapply(v, atom, character(1))
    if (length(z) == 1) z else paste0("[", paste(z, collapse = ","), "]")
  }
  enc(x)
}
rows_of <- function(M) lapply(seq_len(nrow(M)), function(i) as.list(unname(M[i, ])))
vec <- function(x) as.list(unname(as.numeric(x)))
ns <- asNamespace("mvmeta")
remlfn <- get("remlprof.fn", ns); remlgr <- get("remlprof.gr", ns)

fit_mv <- function(Y, S) {
  k <- nrow(Y)
  if (k < 2) return(list(status = "refused", reason = "k<2"))
  if (any(vapply(S, function(s) min(eigen(s, symmetric = TRUE, only.values = TRUE)$values) <= 0, logical(1))))
    return(list(status = "refused", reason = "Within-study covariance must be positive definite."))
  fits <- list()
  start <- diag(pmax(apply(Y, 2, var) - colMeans(t(vapply(S, diag, numeric(2)))), 1e-4))
  for (g in list(NULL, start, start * .1, start * 10)) {
    ctl <- MV_CONTROL; ctl$initPsi <- g
    f <- tryCatch(suppressWarnings(mvmeta::mvmeta(Y ~ 1, S = S, method = "reml", bscov = "unstr", control = ctl)), error = function(e) NULL)
    if (!is.null(f) && isTRUE(f$converged)) fits[[length(fits) + 1L]] <- f
  }
  if (!length(fits)) return(list(status = "refused", reason = "mvmeta did not converge"))
  f <- fits[[which.max(vapply(fits, function(x) as.numeric(logLik(x)), 0))]]
  Xl <- rep(list(diag(2)), k); yl <- lapply(seq_len(k), function(i) Y[i, ]); nal <- rep(list(c(FALSE, FALSE)), k)
  ll_par <- function(par) remlfn(par, Xl, yl, S, nal, 2, k, 1, 2 * k, "unstr", list())
  gr_par <- function(par) remlgr(par, Xl, yl, S, nal, 2, k, 1, 2 * k, "unstr", list())
  reml_at <- function(G) remlfn(numeric(), Xl, yl, S, nal, 2, k, 1, 2 * k, "fixed", list(Psifix = G))
  Psi <- f$Psi; llm <- as.numeric(logLik(f))
  L0 <- tryCatch(t(chol(Psi + diag(1e-14, 2))), error = function(e) NULL)
  refined <- "no"; G <- Psi; ll <- llm; gmax <- NA_real_
  if (!is.null(L0)) {
    p0 <- L0[lower.tri(L0, diag = TRUE)]
    nl <- tryCatch(nlminb(p0, function(p) -ll_par(p), function(p) -gr_par(p), control = NLMINB_CONTROL), error = function(e) NULL)
    if (!is.null(nl) && is.finite(nl$objective) && -nl$objective >= llm - 1e-12 * max(1, abs(llm))) {
      L <- diag(0, 2); L[lower.tri(L, diag = TRUE)] <- nl$par; G <- tcrossprod(L); ll <- -nl$objective
      refined <- paste("nlminb:", nl$message); par <- nl$par
      # Newton polish on mvmeta's analytic REML gradient (Hessian by central differences of
      # remlprof.gr); a step is accepted only if the likelihood does not fall and the gradient shrinks.
      for (it in seq_len(60)) {
        g <- gr_par(par); if (max(abs(g)) < 1e-12) break
        h <- 1e-6 * pmax(1, abs(par))
        H <- sapply(seq_along(par), function(j) { e <- replace(numeric(length(par)), j, h[j]); (gr_par(par + e) - gr_par(par - e)) / (2 * h[j]) })
        H <- (H + t(H)) / 2; st <- tryCatch(solve(H, g), error = function(e) NULL); if (is.null(st)) break
        l0 <- ll_par(par); acc <- FALSE
        for (r in 2^-(0:30)) { pn <- par - r * st; ln <- ll_par(pn)
          if (is.finite(ln) && ln >= l0 - 1e-14 * max(1, abs(l0)) && max(abs(gr_par(pn))) < max(abs(g))) { par <- pn; acc <- TRUE; break } }
        if (!acc) break
      }
      newton_it <- it
      L <- diag(0, 2); L[lower.tri(L, diag = TRUE)] <- par; G <- tcrossprod(L); ll <- ll_par(par)
      gmax <- max(abs(gr_par(par))); refined <- paste0(refined, "; newton iterations ", newton_it)
    }
  }
  adjudication <- "none"
  zero <- matrix(0, 2, 2)
  ff <- mvmeta::mvmeta(Y ~ 1, S = S, method = "fixed"); mu0 <- as.numeric(coef(ff)); C0 <- vcov(ff)
  W <- lapply(S, solve)
  score <- Reduce("+", lapply(seq_len(k), function(i) { w <- W[[i]]; wr <- w %*% (Y[i, ] - mu0); w - w %*% C0 %*% w - tcrossprod(wr) }))
  if (min(eigen(score, symmetric = TRUE)$values) >= 0 && reml_at(zero) >= ll - 1e-12 * max(1, abs(ll))) {
    G <- zero; adjudication <- "zero: covariance score at G=0 positive semidefinite; mvmeta REML profile confirms"
  }
  if (k == 2) {
    d <- Y[1, ] - Y[2, ]; q <- as.numeric(crossprod(d, solve(S[[1]] + S[[2]], d)))
    G <- if (q > 1) .5 * (1 - 1 / q) * tcrossprod(d) else zero
    adjudication <- "two-study exact constrained REML covariance"
  }
  fg <- mvmeta::mvmeta(Y ~ 1, S = lapply(S, function(s) s + G), method = "fixed")
  mu <- as.numeric(coef(fg)); CV <- unname(vcov(fg)); se <- sqrt(diag(CV))
  ll <- reml_at(G) + log(k)  # metafor REML normalization: + 0.5*log|X'X| = log(k) for two balanced outcomes
  z <- mu / se
  list(status = "ok", k = k, mu = vec(mu), muSE = vec(se), muVcov = rows_of(CV), G = rows_of(unname(G)),
       rho = if (all(diag(G) > 0)) max(-1, min(1, G[1, 2] / sqrt(prod(diag(G))))) else NULL,
       logLik = ll, z = vec(z), p = vec(2 * pnorm(-abs(z))),
       adjudication = adjudication, refinement = refined, rGradMax = gmax, mvmetaLogLik = llm + log(k), starts = length(fits))
}

fit_uni <- function(y, v) {
  r <- tryCatch(metafor::rma(yi = y, vi = v, method = "REML", test = "z", control = RMA_CONTROL), error = function(e) e)
  if (inherits(r, "error")) return(list(status = "refused", reason = conditionMessage(r)))
  list(status = "ok", k = r$k, mu = as.numeric(r$beta), se = r$se, tau2 = r$tau2, logLik = as.numeric(logLik(r)),
       z = r$zval, p = r$pval, iterations = r$iter)
}

corpus <- jsonlite::fromJSON(inp, simplifyVector = FALSE)
grid <- unlist(corpus$grid)
stopifnot(length(grid) == 19, isTRUE(all.equal(grid, (-9:9) / 10, tolerance = 0)))
out <- list(); t0 <- Sys.time()
for (c in corpus$configurations) {
  rows <- c$rows; k <- length(rows)
  Y <- do.call(rbind, lapply(rows, function(r) unlist(r$y)))
  V <- do.call(rbind, lapply(rows, function(r) unlist(r$v)))
  Cv <- vapply(rows, function(r) r$cov, 0)
  Ssup <- lapply(seq_len(k), function(i) matrix(c(V[i, 1], Cv[i], Cv[i], V[i, 2]), 2))
  sweep <- lapply(grid, function(rw) {
    S <- lapply(seq_len(k), function(i) { cc <- rw * sqrt(V[i, 1] * V[i, 2]); matrix(c(V[i, 1], cc, cc, V[i, 2]), 2) })
    x <- fit_mv(Y, S); x$rhoW <- rw; x
  })
  uni <- lapply(1:2, function(j) fit_uni(Y[, j], V[, j]))
  out[[length(out) + 1L]] <- list(id = c$id, k = k, supplied = fit_mv(Y, Ssup), sweep = sweep, univariate = uni)
  cat(length(out), c$id, k, out[[length(out)]]$supplied$status, sprintf("%.1fs", as.numeric(Sys.time() - t0, units = "secs")), "\n")
}
zg <- c(0, 1e-8, 1e-3, .5, 1, 1.959963984540054, 2.5, 3, 4, 5, 6, 8, 10, 15, 20, 30, 37)
pgrid <- lapply(zg, function(z) list(z = z, p = 2 * pnorm(-z)))
# Second oracle on Berkey: metafor::rma.mv over the same sweep.
b <- corpus$configurations[[1]]; stopifnot(b$id == "mvmeta::berkey98::PD+AL::REML::supplied")
kb <- length(b$rows); Yb <- do.call(rbind, lapply(b$rows, function(r) unlist(r$y))); Vb <- do.call(rbind, lapply(b$rows, function(r) unlist(r$v)))
mvx <- lapply(grid, function(rw) {
  S <- lapply(seq_len(kb), function(i) { cc <- rw * sqrt(Vb[i, 1] * Vb[i, 2]); matrix(c(Vb[i, 1], cc, cc, Vb[i, 2]), 2) })
  d <- data.frame(yi = c(t(Yb)), outcome = factor(rep(1:2, kb)), study = rep(seq_len(kb), each = 2))
  f <- metafor::rma.mv(yi, metafor::bldiag(S), mods = ~ outcome - 1, random = ~ outcome | study, struct = "UN", method = "REML", data = d,
                       control = list(rel.tol = 1e-10, x.tol = 1e-10, iter.max = 10000, eval.max = 20000))
  list(rhoW = rw, mu = vec(coef(f)), muSE = vec(f$se), G = rows_of(unname(f$G)), logLik = as.numeric(logLik(f)))
})
doc <- list(schema = "multivariate-ma-plus-reference-v1", R = R.version.string,
            versions = list(mvmeta = as.character(packageVersion("mvmeta")), metafor = as.character(packageVersion("metafor")), jsonlite = as.character(packageVersion("jsonlite"))),
            controls = list(mvmeta = "maxiter=10000, reltol=1e-13 (BFGS, analytic gradient), 4 starts", nlminb = "rel.tol=1e-15, x.tol=1e-15, eval.max=20000, iter.max=10000 on remlprof.fn/remlprof.gr, then <=60 Newton steps on remlprof.gr (central-difference Hessian, h=1e-6*max(1,|par|); accept only if logLik does not fall and max|gradient| shrinks; stop when max|gradient|<1e-12)", rma = "REML, test='z', threshold=1e-12, maxiter=10000"),
            grid = as.list(grid), configurations = out, pnormGrid = pgrid, metaforBerkeySweep = mvx)
writeLines(json17(doc), outp, useBytes = TRUE)
nfit <- sum(vapply(out, function(o) sum(vapply(o$sweep, function(s) s$status == "ok", TRUE)) + (o$supplied$status == "ok"), 0))
cat("PLUS REFERENCE", length(out), "configurations;", length(grid), "rho_w each;", nfit, "bivariate fits;",
    sum(vapply(out, function(o) sum(vapply(o$univariate, function(u) u$status == "ok", TRUE)), 0)), "univariate fits\n")
