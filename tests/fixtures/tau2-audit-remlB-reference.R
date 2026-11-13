# Reference values for tests/test_tau2_audit_remlB.py (lane remlB tau2-estimator audit, 2026-11-12).
# metafor 5.2.1 (R 4.6.0) at tight tolerances for the univariate and meta-regression sets; networks
# from the estimating equations (see netfit below).
# Usage: Rscript tests/fixtures/tau2-audit-remlB-reference.R  (writes the oracle JSON next to it)
suppressMessages({library(metafor); library(jsonlite)})
ctl <- list(threshold = 1e-14, tol = 1e-14, maxiter = 10000, stepadj = 0.5)
U <- list()
b <- escalc("RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = dat.bcg)
U$bcg <- list(yi = as.numeric(b$yi), vi = as.numeric(b$vi))
bd <- dat.bangertdrowns2004[!is.na(dat.bangertdrowns2004$yi), ]
U$bangertdrowns <- list(yi = as.numeric(bd$yi), vi = as.numeric(bd$vi))
n <- escalc("MD", m1i = m1i, sd1i = sd1i, n1i = n1i, m2i = m2i, sd2i = sd2i, n2i = n2i, data = dat.normand1999)
U$normand <- list(yi = as.numeric(n$yi), vi = as.numeric(n$vi))
m <- escalc("ZCOR", ri = ri, ni = ni, data = dat.molloy2014)
U$molloy <- list(yi = as.numeric(m$yi), vi = as.numeric(m$vi))
U$k2 <- list(yi = U$bcg$yi[1:2], vi = U$bcg$vi[1:2])            # k = 2, tau2 = 0
U$k2het <- list(yi = U$bcg$yi[c(4, 8)], vi = U$bcg$vi[c(4, 8)])  # k = 2, tau2 > 0
U$tau0 <- list(yi = c(0.10, 0.12, 0.09, 0.11, 0.105), vi = c(0.04, 0.05, 0.03, 0.06, 0.045))
meths <- c("DL", "HE", "SJ", "ML", "REML", "EB", "PM")
fitall <- function(y, v, mods = NULL, intercept = TRUE) {
  o <- list(); for (me in meths) { f <- tryCatch(if (is.null(mods)) rma(y, v, method = me, control = ctl) else
                                                 rma(y, v, mods = mods, intercept = intercept, method = me, control = ctl), error = function(e) NULL)
    o[[me]] <- if (is.null(f)) NA else f$tau2 }; o }
uni <- list()
for (nm in names(U)) { x <- U[[nm]]; r <- list(yi = x$yi, vi = x$vi, tau2 = fitall(x$yi, x$vi))
  if (length(x$yi) >= 4) { r$reg_sqrtv <- fitall(x$yi, x$vi, mods = cbind(sqrt(x$vi)))
                           r$reg_index <- fitall(x$yi, x$vi, mods = cbind(seq_along(x$yi))) }
  uni[[nm]] <- r }
# networks
suppressMessages(library(netmeta, lib.loc = c(.libPaths(), "C:/Users/mahmo/wt/rlib2")))
data(Senn2013); data(smokingcessation)
p <- pairwise(list(treat1, treat2, treat3), event = list(event1, event2, event3), n = list(n1, n2, n3), data = smokingcessation, sm = "OR")
raw <- list(senn = data.frame(studlab = as.character(Senn2013$studlab), treat1 = as.character(Senn2013$treat1), treat2 = as.character(Senn2013$treat2), TE = Senn2013$TE, seTE = Senn2013$seTE),
            smoking = data.frame(studlab = as.character(p$studlab), treat1 = as.character(p$treat1), treat2 = as.character(p$treat2), TE = p$TE, seTE = p$seTE))
design <- function(x) { x$treat1 <- as.character(x$treat1); x$treat2 <- as.character(x$treat2)  # factor codes would index the wrong columns
  tr <- sort(unique(c(x$treat1, x$treat2))); X <- matrix(0, nrow(x), length(tr) - 1); colnames(X) <- tr[-1]
  for (i in seq_len(nrow(x))) { if (x$treat1[i] != tr[1]) X[i, x$treat1[i]] <- 1; if (x$treat2[i] != tr[1]) X[i, x$treat2[i]] <- -1 }; X }
# Network tau2 computed from the estimating equations directly (rows independent, V = diag(seTE^2)):
# DL = (Q - df) / tr(P), PM: Q(tau2) = df, REML/ML: (restricted) log-likelihood maximised on
# log(tau2). rma(mods = design, intercept = FALSE) is NOT used here: on senn_2arm metafor 5.2.1
# reported QE = 159.1 for coefficients whose weighted RSS is 96.84 (= netmeta's Q), so its
# network values could not be trusted. netmeta 3.7.0 DL on senn_2arm = 0.1144159 (matches below).
netfit <- function(x) { X <- design(x); y <- x$TE; v <- x$seTE^2; n <- length(y); p <- ncol(X); df <- n - p
  gls <- function(t2) { W <- diag(1 / (v + t2), n); A <- solve(t(X) %*% W %*% X); b <- A %*% t(X) %*% W %*% y; e <- y - X %*% b
    list(Q = sum(e^2 / (v + t2)), W = W, A = A, ld = sum(log(v + t2)), ldx = as.numeric(determinant(solve(A))$modulus)) }
  g0 <- gls(0); P <- g0$W - g0$W %*% X %*% g0$A %*% t(X) %*% g0$W
  DL <- max(0, (g0$Q - df) / sum(diag(P)))
  PM <- if (g0$Q <= df) 0 else { hi <- mean(v); while (gls(hi)$Q > df) hi <- 2 * hi; uniroot(function(t) gls(t)$Q - df, c(0, hi), tol = 1e-15 * hi)$root }
  lik <- function(t2, reml) { g <- gls(t2); -0.5 * (g$ld + g$Q + if (reml) g$ldx else 0) }
  mx <- function(reml) { sc <- mean(v); u <- seq(log(sc * 1e-10), log(sc * 1e4), length = 400); val <- sapply(exp(u), lik, reml = reml); j <- which.max(val)
    if (j == 1 && lik(0, reml) >= val[1]) return(0)
    o <- optimize(function(z) -lik(exp(z), reml), c(u[max(1, j - 1)], u[min(400, j + 1)]), tol = 1e-14); t <- exp(o$minimum)
    if (lik(0, reml) >= lik(t, reml)) 0 else t }
  list(DL = DL, PM = PM, REML = mx(TRUE), ML = mx(FALSE)) }
nets <- list()
for (nm in names(raw)) { x <- raw[[nm]]; multi <- names(which(table(x$studlab) > 1)); y <- x[!x$studlab %in% multi, ]
  nets[[paste0(nm, "_2arm")]] <- list(data = y, tau2 = netfit(y), rows_independent = FALSE)
  nets[[paste0(nm, "_rows_independent")]] <- list(data = x, tau2 = netfit(x), rows_independent = TRUE) }
out <- list(generated = format(Sys.time(), "%Y-%m-%d"), metafor = as.character(packageVersion("metafor")), R = R.version.string,
            note = "scaled sets (normand x1e4, x1e-4) are checked against c^2 times the unscaled value; tau2 is exactly scale-equivariant",
            uni = uni, nets = nets)
writeLines(toJSON(out, digits = NA, auto_unbox = TRUE, dataframe = "rows", pretty = TRUE), file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))), "tau2-audit-remlB-oracle.json"))
