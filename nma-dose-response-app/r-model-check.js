/* nma-dose-response-app/r-model-check.js
 * "Download R script" and "Verify in R (WebR)" for the Model Summary.
 * The script is generated from the page's CURRENT analysed inputs (window._nmaState.rawData and the
 * model controls), refits the network in R and prints, for every quantity the Model Summary shows,
 * the page's value, R's value, |difference| and MATCH / MISMATCH / NOT CHECKED, then one final line
 * "MATCH n/n" or "MISMATCH k of n quantities differ" computed in R. The tolerance is half a unit in the
 * last digit the page displays (the page shows 1-3 decimals; app.js formatNumber).
 * In-browser R uses the unchanged shared/webr-runner.js (pinned same-origin webR); base R only.
 * App-local; no shared file is changed. The R code below is the R_ENGINE string.
 */
(function () {
  'use strict';

  var R_ENGINE = String.raw`# ---------------------------------------------------------------------------
# R refit of the page's Model Summary.
# No R package fits this page's model (one curve per treatment plus a study
# offset, refitted by three alternating sweeps, AICc choice among Emax,
# sigmoid Emax, log-linear, restricted cubic spline and fractional polynomial).
# netmeta and metafor (the references in the validation pack) cover only
# special cases of it, and dosresmeta / MBNMAdose fit different models, so the
# model is written here in base R from the page's own formulas (app.js:
# prepareData, fitNetwork, computeStudyOffsets, computeTau2ByTreatment,
# residualTau2, jointLinearSolve, fitEmax, fitHill, fitLogLinear, fitRcs,
# fitFracPoly, computeWeightedStats, computeStats). The least-squares
# solutions themselves come from R: lm.wfit (QR) for the linear models and
# optim (L-BFGS-B / BFGS with analytic gradients, many starts) for Emax and
# sigmoid Emax; the heterogeneity roots come from uniroot. Base R only.
# ---------------------------------------------------------------------------
fmt_page <- function(v) {          # the page's formatNumber()
  if (length(v) != 1 || is.na(v) || !is.finite(v)) return("-")
  a <- abs(v)
  if (a >= 1000) sprintf("%.1f", v) else if (a >= 10) sprintf("%.2f", v) else sprintf("%.3f", v)
}
dp_page <- function(v) { a <- abs(v); if (a >= 1000) 1 else if (a >= 10) 2 else 3 }
num_js <- function(x) {            # JavaScript String(number) for the small labels used in model details
  if (x == round(x)) return(format(x, scientific = FALSE))
  format(x, digits = 15)
}
MODEL_LABELS <- c(emax = "Emax", hill = "Sigmoid Emax", log_linear = "Log-linear", rcs = "RCS spline", fp = "Fractional poly")

wmean <- function(y, w) { s <- sum(w); if (s != 0) sum(w * y) / s else 0 }

weighted_stats <- function(y, w, pred, k) {   # computeWeightedStats()
  n <- length(y); m <- wmean(y, w)
  sse <- sum(w * (y - pred)^2); sst <- sum(w * (y - m)^2)
  # A saturated fit (n <= k) that interpolates the data has SSE 0 in exact arithmetic, which the page's AIC
  # rule treats as "no AIC" (sse <= 0), so the fit cannot be chosen. An optimiser ends such a fit near, not at,
  # 0 (the page's own sigmoid Emax search ends it at exactly 0 on some runs and at about 1e-32 on others);
  # an SSE below 1e-12 of the total weighted sum of squares of a saturated fit is read here as that exact 0.
  if (!is.na(k) && n <= k && is.finite(sse) && sse > 0 && sse <= 1e-12 * sum(w * y^2)) sse <- 0
  rmse <- sqrt(sse / max(n, 1))
  r2 <- if (sst != 0) 1 - sse / sst else NaN
  aic <- if (is.finite(sse) && sse > 0 && n > 0) n * log(sse / n) + 2 * k else NaN
  aicc <- if (!is.finite(aic)) NaN else if (n <= k + 1) aic else aic + 2 * k * (k + 1) / (n - k - 1)
  bic <- if (is.finite(sse) && sse > 0 && n > 0) n * log(sse / n) + k * log(n) else NaN
  list(sse = sse, rmse = rmse, r2 = r2, aic = aic, aicc = aicc, bic = bic, df = n - k)
}

dose_shift <- function(d) {        # half the smallest positive dose (else max(1, 0.1 x max dose))
  pos <- d[d > 0]
  if (length(pos)) min(pos) * 0.5 else max(1, max(d) * 0.1)
}

predict_fit <- function(f, d) {
  if (is.null(f)) return(rep(0, length(d)))
  switch(f$model,
    emax = f$e0 + f$emax * d / (f$ed50 + d),
    hill = ifelse(d > 0, f$e0 + f$emax / (1 + (f$ed50 / d)^f$hill), f$e0),   # overflow-safe form of e0 + emax d^h / (ed50^h + d^h), as fit_hill searches it
    log_linear = f$e0 + f$slope * log(d + f$shift),
    rcs = as.vector(rcs_basis(d, f$knots, f$includeIntercept) %*% f$betas),
    fp = as.vector(fp_design(d + f$shift, f$powers, f$includeIntercept) %*% f$betas))
}

# weighted least squares by QR (lm.wfit); NULL when the design is singular. tol = 1e-6 on the
# relative column norm left after projection mirrors the page's rule (scaled normal-equation pivot < 1e-12).
wls <- function(X, y, w) {
  X <- as.matrix(X)
  if (!nrow(X) || !ncol(X)) return(NULL)
  f <- lm.wfit(X, y, w, tol = 1e-6)
  if (f$rank < ncol(X) || any(!is.finite(f$coefficients))) return(NULL)
  list(betas = unname(f$coefficients), sse = sum(w * (y - X %*% f$coefficients)^2))
}

finalize <- function(f, y, w, d, k) {
  f$k <- k
  s <- weighted_stats(y, w, predict_fit(f, d), k)
  if (!is.finite(s$sse)) return(NULL)
  f$n <- length(y)
  modifyList(f, s)
}

fit_loglinear <- function(d, y, w, fb) {
  sh <- dose_shift(d); x <- log(d + sh)
  X <- if (fb) cbind(1, x) else cbind(x)
  r <- wls(X, y, w)
  if (is.null(r)) { b <- if (fb) c(wmean(y, w), 0) else 0 } else b <- r$betas
  f <- list(model = "log_linear", e0 = if (fb) b[1] else 0, slope = if (fb) b[2] else b[1], shift = sh)
  finalize(f, y, w, d, if (fb) 2 else 1)
}

select_knots <- function(d, count) {        # the page's percentile rule
  s <- sort(d); u <- unique(s)
  if (length(u) < 3) return(numeric(0))
  k <- min(count, length(u))
  probs <- if (k == 3) c(0.1, 0.5, 0.9) else c(0.05, 0.35, 0.65, 0.95)
  sort(unique(s[floor(probs * (length(s) - 1)) + 1]))
}
rcs_basis <- function(d, knots, intercept) {   # unnormalised restricted cubic spline (Harrell; Hmisc::rcspline.eval norm = 0)
  K <- length(knots); last <- knots[K]; lm1 <- knots[K - 1]
  den <- if (last - lm1 != 0) last - lm1 else 1
  cols <- list()
  if (intercept) cols[[length(cols) + 1]] <- rep(1, length(d))
  cols[[length(cols) + 1]] <- d
  for (j in seq_len(K - 2)) {
    kj <- knots[j]
    cols[[length(cols) + 1]] <- pmax(d - kj, 0)^3 - pmax(d - lm1, 0)^3 * ((last - kj) / den) + pmax(d - last, 0)^3 * ((lm1 - kj) / den)
  }
  do.call(cbind, cols)
}
fit_rcs <- function(d, y, w, fb) {
  knots <- select_knots(d, min(4, length(unique(d))))
  if (length(knots) < 3) return(NULL)
  r <- wls(rcs_basis(d, knots, fb), y, w)
  if (is.null(r)) return(NULL)
  f <- list(model = "rcs", betas = r$betas, knots = knots, includeIntercept = fb,
            detail = paste0("RCS k=", length(knots), " [", paste(vapply(knots, fmt_page, ""), collapse = "/"), "]"))
  finalize(f, y, w, d, length(r$betas))
}

fp_term <- function(x, p) if (p == 0) log(x) else x^p
fp_design <- function(x, powers, intercept) {
  cols <- list()
  if (intercept) cols[[1]] <- rep(1, length(x))
  t1 <- fp_term(x, powers[1]); cols[[length(cols) + 1]] <- t1
  if (length(powers) > 1) cols[[length(cols) + 1]] <- if (powers[2] == powers[1]) t1 * log(x) else fp_term(x, powers[2])
  do.call(cbind, cols)
}
fit_fp <- function(d, y, w, fb) {
  sh <- dose_shift(d); x <- d + sh
  P <- c(-2, -1, -0.5, 0, 0.5, 1, 2, 3)
  cands <- c(lapply(P, function(p) p), unlist(lapply(P, function(p1) lapply(P[P >= p1], function(p2) c(p1, p2))), recursive = FALSE))
  best <- NULL
  for (pw in cands) {
    r <- wls(fp_design(x, pw, fb), y, w)
    if (is.null(r)) next
    f <- list(model = "fp", betas = r$betas, powers = pw, shift = sh, includeIntercept = fb,
              detail = paste0("FP(", paste(vapply(pw, num_js, ""), collapse = ","), ")"))
    f <- finalize(f, y, w, d, length(r$betas))
    if (is.null(f)) next
    if (is.null(best) || (is.finite(f$aicc) && is.finite(best$aicc) && f$aicc < best$aicc)) best <- f   # the page's first-wins rule
  }
  best
}

# Emax: e0 + emax d / (ed50 + d), least squares inside the page's box
# (e0 in [min - range, max + range] or fixed at 0, emax in [-2 range, 3 range], ed50 in [0.01 x smallest positive dose, 5 x largest dose]).
# A treatment with no positive dose identifies E0 only: emax is then set to 0 (the minimum-norm solution, as
# lm.wfit gives an aliased column); the page's optimiser leaves an arbitrary emax that changes no fitted value.
unidentified <- function(model, d, y, w, fb, ed50, hill) {
  e0 <- if (fb) wmean(y, w) else 0
  f <- list(model = model, e0 = e0, emax = 0, ed50 = ed50, unidentified = TRUE)
  if (model == "hill") f$hill <- hill
  finalize(f, y, w, d, if (model == "hill") (if (fb) 4 else 3) else (if (fb) 3 else 2))
}
fit_emax <- function(d, y, w, fb) {
  n <- length(y); rng <- max(y) - min(y); if (rng == 0) rng <- 1
  pos <- d[d > 0]; mp <- if (length(pos)) min(pos) else max(max(d), 1)
  if (!length(pos)) return(unidentified("emax", d, y, w, fb, mp * 0.01, NA))
  lo <- c(if (fb) min(y) - rng, -2 * rng, log(mp * 0.01)); hi <- c(if (fb) max(y) + rng, 3 * rng, log(max(d) * 5))
  unpack <- function(p) if (fb) list(e0 = p[1], em = p[2], ed = exp(p[3])) else list(e0 = 0, em = p[1], ed = exp(p[2]))
  sse <- function(p) { u <- unpack(p); sum(w * (y - u$e0 - u$em * d / (u$ed + d))^2) }
  grad <- function(p) {
    u <- unpack(p); g <- d / (u$ed + d); r <- y - u$e0 - u$em * g
    gl <- 2 * sum(w * r * u$em * d * u$ed / (u$ed + d)^2)
    c(if (fb) -2 * sum(w * r), -2 * sum(w * r * g), gl)
  }
  starts <- lapply(seq(lo[length(lo)], hi[length(hi)], length.out = 41), function(le) {
    g <- d / (exp(le) + d)
    b <- if (fb) { r <- wls(cbind(1, g), y, w); if (is.null(r)) c(wmean(y, w), 0) else r$betas } else { s <- sum(w * g * g); if (s > 0) sum(w * g * y) / s else 0 }
    p <- c(b, le); pmin(hi, pmax(lo, p))
  })
  starts <- starts[order(vapply(starts, sse, 0))][1:8]
  best <- NULL
  for (p0 in starts) {
    p <- p0
    for (round in 1:20) {
      o <- tryCatch(optim(p, sse, grad, method = "L-BFGS-B", lower = lo, upper = hi,
                          control = list(factr = 1, pgtol = 0, maxit = 5000)), error = function(e) NULL)
      if (is.null(o) || !(o$value < sse(p) * (1 - 1e-15))) break
      p <- o$par
    }
    if (is.null(best) || sse(p) < sse(best)) best <- p
  }
  u <- unpack(best)
  finalize(list(model = "emax", e0 = u$e0, emax = u$em, ed50 = max(1e-4, u$ed)), y, w, d, if (fb) 3 else 2)
}

# sigmoid Emax: e0 + emax d^h / (ed50^h + d^h), unconstrained least squares on (e0, emax, log ed50, log h).
fit_hill <- function(d, y, w, fb) {
  pos <- d[d > 0]; mp <- if (length(pos)) min(pos) else max(max(d), 1)
  lmin <- log10(max(mp * 0.2, 0.001)); lmax <- log10(max(max(d) * 2, mp * 0.6))
  if (!length(pos)) return(unidentified("hill", d, y, w, fb, 10^((lmin + lmax) / 2), 1))
  unpack <- function(p) if (fb) list(e0 = p[1], em = p[2], ed = exp(p[3]), h = exp(p[4])) else list(e0 = 0, em = p[1], ed = exp(p[2]), h = exp(p[3]))
  gfun <- function(ed, h) ifelse(d > 0, 1 / (1 + (ed / d)^h), 0)
  sse <- function(p) { u <- unpack(p); v <- sum(w * (y - u$e0 - u$em * gfun(u$ed, u$h))^2); if (is.finite(v)) v else 1e300 }
  grad <- function(p) {
    u <- unpack(p); g <- gfun(u$ed, u$h); r <- y - u$e0 - u$em * g
    lr <- ifelse(d > 0, log(d / u$ed), 0); dg <- g * (1 - g)
    c(if (fb) -2 * sum(w * r), -2 * sum(w * r * g), 2 * sum(w * r * u$em * u$h * dg), -2 * sum(w * r * u$em * u$h * lr * dg))
  }
  # variable projection: for fixed (ed50, h) the linear part (e0, emax) is weighted least squares, so the search
  # is over (log ed50, log h) only, then polished jointly with analytic gradients.
  # A wide box keeps the search finite: ed50 within 1e-6 x smallest .. 1e8 x largest dose, h within 0.01 .. 100;
  # a fit that ends on it is a run-off (the curve tends to a power or a step function).
  lin <- function(g) if (fb) { r <- wls(cbind(1, g), y, w); if (is.null(r)) c(wmean(y, w), 0) else r$betas } else { s <- sum(w * g * g); if (s > 0) sum(w * g * y) / s else 0 }
  blo <- c(log(mp * 1e-6), log(0.01)); bhi <- c(log(max(d) * 1e8), log(100))
  full <- function(q) { q <- pmin(bhi, pmax(blo, q)); c(lin(gfun(exp(q[1]), exp(q[2]))), q) }
  prof <- function(q) sse(full(q))
  starts <- list()
  for (le in seq(lmin, lmax, length.out = 25)) for (h in seq(0.4, 5.5, length.out = 25)) starts[[length(starts) + 1]] <- c(le * log(10), log(h))
  starts <- starts[order(vapply(starts, prof, 0))][1:6]
  nl <- if (fb) 2 else 1
  lo <- c(rep(-Inf, nl), blo); hi <- c(rep(Inf, nl), bhi)
  best <- NULL
  for (q0 in starts) {
    q <- q0
    for (round in 1:4) {
      o <- optim(q, prof, method = "Nelder-Mead", control = list(reltol = 1e-15, maxit = 4000))
      if (!(o$value < prof(q) * (1 - 1e-15))) break
      q <- pmin(bhi, pmax(blo, o$par))
    }
    p <- full(q)
    o <- tryCatch(optim(p, sse, grad, method = "L-BFGS-B", lower = lo, upper = hi, control = list(factr = 1, pgtol = 0, maxit = 3000)), error = function(e) NULL)
    if (!is.null(o) && o$value < sse(p)) p <- o$par
    if (is.null(best) || sse(p) < sse(best)) best <- p
  }
  edge <- any(abs(best[nl + 1:2] - blo) < 1e-6 | abs(best[nl + 1:2] - bhi) < 1e-6)
  u <- unpack(best)
  finalize(list(model = "hill", e0 = u$e0, emax = u$em, ed50 = u$ed, hill = u$h, runoff = edge), y, w, d, if (fb) 4 else 3)
}

fit_model <- function(d, y, w, model, fb) switch(model,
  emax = fit_emax(d, y, w, fb), hill = fit_hill(d, y, w, fb), log_linear = fit_loglinear(d, y, w, fb),
  rcs = fit_rcs(d, y, w, fb), fp = fit_fp(d, y, w, fb))

pick_aicc <- function(fl) {        # the page's AICc choice (first candidate kept on ties and non-finite AICc)
  best <- NULL
  for (f in fl) {
    if (is.null(best)) { best <- f; next }
    if (!is.finite(f$aicc)) next
    if (!is.finite(best$aicc) || f$aicc < best$aicc) best <- f
  }
  best
}

fit_all <- function(rows, choice, fb) {
  trts <- unique(rows$treatment); fits <- list(); cands <- list()
  models <- if (choice == "auto") c("emax", "hill", "log_linear", "rcs", "fp") else choice
  for (t in trts) {
    r <- rows[rows$treatment == t, ]
    if (nrow(r) < 2) next
    fl <- Filter(Negate(is.null), lapply(models, function(m) fit_model(r$dose, r$value, r$weight, m, fb)))
    if (!length(fl)) next
    fits[[t]] <- if (choice == "auto") pick_aicc(fl) else fl[[1]]
    cands[[t]] <- fl
  }
  list(fits = fits, treatments = trts, candidates = cands)
}

linear_design <- function(f, d, fb) {
  if (f$model == "log_linear") { x <- log(d + f$shift); return(if (fb) cbind(1, x) else cbind(x)) }
  if (f$model == "rcs") return(rcs_basis(d, f$knots, f$includeIntercept))
  if (f$model == "fp") return(fp_design(d + f$shift, f$powers, f$includeIntercept))
  NULL
}

# residual heterogeneity of y = X b + u + e, var(e) = v (the page's residualTau2; textbook DL, REML, PM/EB, SJ)
residual_tau2 <- function(y, v, X, method) {
  k <- length(y)
  q <- qr(X, tol = 1e-7); p <- q$rank
  if (k <= p) return(0)
  X <- X[, q$pivot[seq_len(p)], drop = FALSE]
  Pm <- function(t2) { W <- diag(1 / (v + t2), k); if (p == 0) return(W); WX <- W %*% X; W - WX %*% solve(crossprod(X, WX), t(WX)) }
  rss <- function(t2) { P <- Pm(t2); drop(t(y) %*% P %*% y) }
  bracket <- function(f) { hi <- 1; while (f(hi) > 0 && hi < 1e300) hi <- hi * 2; if (f(hi) > 0) NA else hi }
  root <- function(f) { hi <- bracket(f); if (is.na(hi)) return(0); uniroot(f, c(0, hi), tol = 1e-15 * max(1, hi), maxiter = 2000)$root }
  if (method == "dl") { P <- Pm(0); return(max(0, (drop(t(y) %*% P %*% y) - (k - p)) / sum(diag(P)))) }
  if (method %in% c("pm", "eb")) { if (rss(0) <= k - p) return(0); return(root(function(t) rss(t) - (k - p))) }
  if (method == "sj") { t0 <- sum((y - mean(y))^2) / k; if (!(t0 > 0)) return(0); return(max(0, t0 * rss(t0) / (k - p))) }
  if (method == "reml") {
    score <- function(t2) { P <- Pm(t2); Py <- P %*% y; sum(Py^2) - sum(diag(P)) }
    if (score(0) <= 0) return(0)
    return(root(score))
  }
  residual_tau2(y, v, X, "dl")
}
pm_moments <- function(v, r, df) {   # the page's Paule-Mandel on residuals (nonlinear models), search capped at 2^20
  if (df <= 0 || !length(v)) return(0)
  qa <- function(t2) sum(r^2 / (v + t2))
  if (!is.finite(qa(0)) || qa(0) <= df) return(0)
  hi <- 1; while (qa(hi) > df && hi < 1e6) hi <- hi * 2
  if (qa(hi) > df) return(hi)
  uniroot(function(t) qa(t) - df, c(0, hi), tol = 1e-14)$root
}

cov_adj <- function(rows, beta, mean, use) if (use && is.finite(beta)) ifelse(is.finite(rows$covariate), beta * (rows$covariate - mean), 0) else rep(0, nrow(rows))

study_offsets <- function(base, fits, beta, mean, use) {
  ok <- base$treatment %in% names(fits)
  pred <- rep(NA_real_, nrow(base))
  for (t in names(fits)) { i <- base$treatment == t; pred[i] <- predict_fit(fits[[t]], base$dose[i]) }
  ca <- cov_adj(base, beta, mean, use)
  off <- c()
  for (s in unique(base$study)) {
    i <- ok & base$study == s
    if (any(i) && sum(base$bw[i]) > 0) off[s] <- sum(base$bw[i] * (base$effect[i] - ca[i] - pred[i])) / sum(base$bw[i])
  }
  off
}
off_of <- function(off, studies) { o <- unname(off[studies]); o[is.na(o)] <- 0; o }

tau2_by_treatment <- function(base, fits, off, beta, mean, use, method, fb) {
  out <- c()
  ca <- cov_adj(base, beta, mean, use)
  for (t in unique(base$treatment)) {
    if (is.null(fits[[t]])) next
    i <- base$treatment == t & is.finite(base$bw) & base$bw > 0
    if (!any(i)) next
    f <- fits[[t]]; ys <- base$effect[i] - off_of(off, base$study[i]) - ca[i]
    v <- 1 / base$bw[i]; r <- ys - predict_fit(f, base$dose[i])
    df <- if (is.finite(f$df)) f$df else max(sum(i) - 1, 0)
    X <- linear_design(f, base$dose[i], fb)
    if (!is.null(X)) { tt <- residual_tau2(ys, v, X, method); if (!is.finite(tt)) tt <- 0 }
    else if (method == "pm") tt <- pm_moments(v, r, df)
    else { wv <- base$bw[i]; cc <- sum(wv) - sum(wv^2) / (if (sum(wv) != 0) sum(wv) else 1); q <- sum(wv * r^2); tt <- if (cc > 0) max(0, (q - df) / cc) else 0 }
    out[t] <- tt
  }
  out
}

apply_offsets <- function(base, off, re, tau2, beta, mean, use) {
  a <- base
  a$value <- base$effect - off_of(off, base$study) - cov_adj(base, beta, mean, use)
  tt <- if (re) { x <- unname(tau2[base$treatment]); x[is.na(x)] <- 0; x } else 0
  bv <- ifelse(base$bw > 0, 1 / base$bw, 1)
  a$weight <- if (re) ifelse(bv + tt > 0, 1 / (bv + tt), base$bw) else base$bw
  a
}

joint_solve <- function(base, fits, fb) {    # exact joint weighted least squares (fixed-effect linear models)
  keep <- base$treatment %in% names(fits)
  rows <- base[keep, ]
  if (!nrow(rows)) return(NULL)
  st <- unique(rows$study); tr <- unique(rows$treatment)
  S <- outer(rows$study, st, "==") * 1
  blocks <- lapply(tr, function(t) { B <- linear_design(fits[[t]], rows$dose, fb); B[rows$treatment != t, ] <- 0; B })
  X <- cbind(S, do.call(cbind, blocks))
  f <- lm.wfit(X, rows$effect, rows$bw, tol = 1e-10)
  b <- f$coefficients; b[is.na(b)] <- 0; b <- unname(b)
  off <- setNames(b[seq_along(st)], st)
  pos <- length(st); nf <- fits
  for (j in seq_along(tr)) {
    t <- tr[j]; wdt <- ncol(blocks[[j]]); cf <- b[pos + seq_len(wdt)]; pos <- pos + wdt
    g <- fits[[t]]
    if (g$model == "log_linear") { if (fb) { g$e0 <- cf[1]; g$slope <- cf[2] } else g$slope <- cf[1] } else g$betas <- cf
    nf[[t]] <- g
  }
  list(offsets = off, fits = nf)
}

fit_network <- function(base, cfg) {
  fb <- cfg$freeBaseline; use <- cfg$useCovariate
  adj <- base; adj$value <- base$effect; adj$weight <- base$bw
  beta <- NaN; cmean <- NaN; tau2 <- c(); off <- c()
  for (iter in 1:3) {
    fr <- fit_all(adj, cfg$model, fb)
    off <- study_offsets(base, fr$fits, beta, cmean, use)
    if (use) {
      i <- is.finite(base$covariate) & base$treatment %in% names(fr$fits)
      if (sum(i) < 3) { beta <- NaN; cmean <- NaN } else {
        wv <- base$bw[i]; cmean <- sum(wv * base$covariate[i]) / sum(wv)
        pr <- rep(NA_real_, nrow(base)); for (t in names(fr$fits)) { j <- base$treatment == t; pr[j] <- predict_fit(fr$fits[[t]], base$dose[j]) }
        res <- base$effect[i] - off_of(off, base$study[i]) - pr[i]; x <- base$covariate[i] - cmean
        den <- sum(wv * x * x); beta <- if (den != 0) sum(wv * x * res) / den else 0
      }
    } else { beta <- NaN; cmean <- NaN }
    tau2 <- tau2_by_treatment(base, fr$fits, off, beta, cmean, use, cfg$tau2Method, fb)
    adj <- apply_offsets(base, off, cfg$randomEffects, tau2, beta, cmean, use)
  }
  fits <- fr$fits
  if (!cfg$randomEffects && !use && cfg$model %in% c("log_linear", "rcs", "fp")) {
    js <- joint_solve(base, fits, fb)
    if (!is.null(js)) {
      off <- js$offsets
      adj <- apply_offsets(base, off, FALSE, tau2, beta, cmean, use)
      for (t in names(js$fits)) {
        g <- js$fits[[t]]; i <- adj$treatment == t
        # statistics recomputed on the jointly solved fit with its number of parameters k
        fits[[t]] <- modifyList(g, weighted_stats(adj$value[i], adj$weight[i], predict_fit(g, adj$dose[i]), if (is.null(g$k)) NA else g$k))
      }
    }
  }
  list(fits = fits, treatments = fr$treatments, candidates = fr$candidates, data = adj, tau2 = tau2)
}

ma_predict <- function(cands, d) {   # AICc-weighted model average (computeModelAveragePrediction)
  if (is.null(cands) || !length(cands)) return(NaN)
  a <- vapply(cands, function(f) f$aicc, 0); ok <- is.finite(a)
  if (!any(ok)) return(NaN)
  wt <- exp(-0.5 * (a[ok] - min(a[ok]))); wt <- wt / sum(wt)
  sum(wt * vapply(cands[ok], function(f) predict_fit(f, d), 0)) / sum(wt)
}
copas_target <- function(rows, f, level, target, fb) {
  if (is.null(f) || level == "none") return(NaN)
  ab <- switch(level, mild = c(-0.8, 0.6), moderate = c(-1.4, 1.0), strong = c(-2.0, 1.5), c(0, 0))
  sw <- ifelse(is.finite(rows$se) & rows$se > 0, 1 / (1 + exp(-(ab[1] + ab[2] / rows$se))), 1)
  g <- fit_model(rows$dose, rows$value, rows$weight * sw, f$model, fb)
  if (is.null(g)) NaN else predict_fit(g, target)
}

model_summary <- function(dat, cfg) {
  dat$bw0 <- ifelse(is.finite(dat$baseWeight), dat$baseWeight, ifelse(is.finite(dat$se) & dat$se > 0, 1 / dat$se^2, 1))
  arms <- tapply(dat$treatment, dat$study, function(x) max(1, length(unique(x))))
  base <- dat[dat$dose >= 0, ]
  base$bw <- if (cfg$multiArm) base$bw0 / arms[base$study] else base$bw0
  base$bw <- as.numeric(base$bw)
  net <- fit_network(base, cfg)
  fits <- net$fits; fb <- cfg$freeBaseline
  minD <- min(net$data$dose); maxD <- max(net$data$dose); if (maxD == minD) maxD <- minD + 1
  td <- min(cfg$targetDose, max(net$data$dose))
  ref <- if (nzchar(cfg$reference)) fits[[cfg$reference]] else NULL
  refc <- if (!is.null(ref)) net$candidates[[cfg$reference]] else NULL
  refAvg <- function(x) { a <- ma_predict(refc, x); if (is.finite(a)) a else predict_fit(ref, x) }
  refCopas <- if (!is.null(ref) && cfg$selectionBias != "none") copas_target(net$data[net$data$treatment == cfg$reference, ], ref, cfg$selectionBias, td, fb) else NaN
  out <- list()
  grid <- minD + (maxD - minD) * (0:80) / 80
  for (t in net$treatments) {
    f <- fits[[t]]; if (is.null(f)) next
    cur <- function(x) predict_fit(f, x) - (if (!is.null(ref)) predict_fit(ref, x) else 0)
    avg <- function(x) { a <- ma_predict(net$candidates[[t]], x); (if (is.finite(a)) a else predict_fit(f, x)) - (if (!is.null(ref)) refAvg(x) else 0) }
    v <- cur(grid); va <- vapply(grid, avg, 0); dx <- diff(grid)
    target <- cur(td); tc <- copas_target(net$data[net$data$treatment == t, ], f, cfg$selectionBias, td, fb)
    if (!is.null(ref) && is.finite(tc) && is.finite(refCopas)) tc <- tc - refCopas
    tau2 <- if (!is.na(net$tau2[t]) && is.finite(net$tau2[t])) unname(net$tau2[t]) else 0
    rv <- if (is.finite(f$df) && f$df > 0) f$sse / f$df else f$rmse^2
    rad <- if (is.finite(rv)) 1.959964 * sqrt(max(0, rv + tau2)) else NaN   # the page's critical value (getCriticalZ(0.95))
    nz <- function(x) if (is.null(x)) NaN else x
    out[[t]] <- list(model = unname(MODEL_LABELS[f$model]), detail = if (is.null(f$detail)) "-" else f$detail, n = f$n,
      e0 = nz(f$e0), emax = if (!is.null(f$emax) && is.finite(f$emax)) f$emax else nz(f$slope), ed50 = nz(f$ed50), hill = nz(f$hill),
      aic = f$aic, aicc = f$aicc, bic = f$bic, q = f$sse, df = f$df, qdf = if (is.finite(f$df) && f$df != 0) f$sse / f$df else NaN,
      tau2 = tau2, pi_low = target - rad, pi_high = target + rad, rmse = f$rmse, r2 = f$r2,
      auc = sum((v[-1] + v[-length(v)]) * 0.5 * dx), auc_ma = sum((va[-1] + va[-length(va)]) * 0.5 * dx),
      target = target, target_ma = avg(td), target_copas = tc, unidentified = isTRUE(f$unidentified))
  }
  out
}

# ------------------------------- comparison ---------------------------------
compare_summary <- function(r, page) {
  n_ok <- 0; n_bad <- 0; n_nc <- 0
  cat(sprintf("%-10s %-16s %-16s %-16s %-11s %s\n", "treatment", "quantity", "page (shown)", "R", "|diff|", "verdict"))
  for (i in seq_len(nrow(page))) {
    t <- page$treatment[i]; qn <- page$quantity[i]; shown <- page$shown[i]; pv <- page$value[i]
    if (page$kind[i] == "nc") {
      cat(sprintf("%-10s %-16s %-16s %-16s %-11s %s\n", t, qn, shown, "-", "-", paste0("NOT CHECKED (", page$why[i], ")"))); n_nc <- n_nc + 1; next
    }
    rr <- r[[t]]
    if (is.null(rr)) { cat(sprintf("%-10s %-16s %-16s %-16s %-11s %s\n", t, qn, shown, "(no R fit)", "-", "MISMATCH")); n_bad <- n_bad + 1; next }
    if (isTRUE(rr$unidentified) && qn %in% c("emax", "ed50", "hill") && shown != "-") {
      # no positive dose: these parameters change no fitted value, so any value is a least-squares solution
      cat(sprintf("%-10s %-16s %-16s %-16s %-11s %s
", t, qn, shown, "-", "-", "NOT CHECKED (not identified: no positive dose)")); n_nc <- n_nc + 1; next
    }
    rv <- rr[[qn]]
    if (page$kind[i] == "text") {
      rs <- as.character(rv); ok <- identical(rs, shown); d <- "-"
    } else {
      rs <- fmt_page(rv)
      if (shown == "-" || !is.finite(pv)) { ok <- (rs == "-") && (shown == "-"); d <- "-" }
      else if (!is.finite(rv)) { ok <- FALSE; d <- "-" }
      else { tol <- 0.5 * 10^(-dp_page(pv)); dd <- abs(rv - pv); ok <- dd <= tol; d <- sprintf("%.2e", dd) }
      rs <- if (is.finite(rv)) sprintf("%.10g", rv) else "-"
    }
    if (ok) n_ok <- n_ok + 1 else n_bad <- n_bad + 1
    cat(sprintf("%-10s %-16s %-16s %-16s %-11s %s\n", t, qn, shown, rs, d, if (ok) "MATCH" else "MISMATCH"))
  }
  n <- n_ok + n_bad
  cat(sprintf("\nchecked %d displayed quantities (tolerance: half a unit in the last digit the page shows); %d NOT CHECKED\n", n, n_nc))
  if (n > 0 && n_bad == 0) cat(sprintf("MATCH %d/%d\n", n_ok, n)) else cat(sprintf("MISMATCH %d of %d quantities differ\n", n_bad, n))
  invisible(n_bad == 0 && n > 0)
}
`;

  // Model Summary columns, in table order (index.html #summaryBody; app.js updateSummary)
  var COLS = ['treatment', 'model', 'detail', 'n', 'e0', 'emax', 'ed50', 'hill', 'aic', 'aicc', 'bic', 'q', 'df', 'qdf',
    'tau2', 'pi', 'rmse', 'r2', 'auc', 'auc_ma', 'target', 'target_ma', 'target_copas', 'target_ci', 'sucra', 'pbest'];
  var STAT_KEY = { e0: 'e0', emax: 'emax', ed50: 'ed50', hill: 'hill', aic: 'aic', aicc: 'aicc', bic: 'bic', q: 'q', df: 'df',
    qdf: 'dispersion', tau2: 'tau2', rmse: 'rmse', r2: 'r2', auc: 'auc', auc_ma: 'aucAvg', target: 'target',
    target_ma: 'targetAvg', target_copas: 'targetCopas' };
  var NOT_CHECKED = { target_ci: 'Target 95% CI', sucra: 'SUCRA', pbest: 'P(best)' };

  function rNum(v) {
    if (typeof v !== 'number' || !isFinite(v)) return 'NA';
    return String(v);                       // shortest round-trip decimal: R reads back the same double
  }
  function rStr(s) { return JSON.stringify(String(s == null ? '' : s)); }
  function rVec(arr, f) { return 'c(' + arr.map(f).join(', ') + ')'; }

  // The text of each cell of a Model Summary row, read from the row's HTML (app.js updateSummary writes it
  // with innerHTML), so the same reader works in a browser and in the Node test harness.
  function cellTexts(tr) {
    var html = String(tr.innerHTML || '');
    var out = [];
    var re = /<td\b[^>]*>([\s\S]*?)<\/td>/gi, m;
    while ((m = re.exec(html))) {
      out.push(m[1].replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim());
    }
    return out;
  }

  // Reads the page as it is now. Returns { script } or { refusal }.
  function buildScript() {
    var st = window._nmaState;
    if (!st || !Array.isArray(st.rawData) || !st.rawData.length) return { refusal: 'No data loaded: load or paste data and run the analysis first.' };
    var stats = Array.isArray(st.lastStats) ? st.lastStats : [];
    var body = document.getElementById('summaryBody');
    var trs = body ? Array.prototype.slice.call(body.children) : [];
    if (!stats.length || trs.length !== stats.length || trs.some(function (tr) { return cellTexts(tr).length !== COLS.length; })) return { refusal: 'The Model Summary is empty or out of date: run the analysis first.' };

    var rows = [];   // treatment, quantity, kind, value, shown, why
    stats.forEach(function (s, i) {
      var cells = cellTexts(trs[i]);
      COLS.forEach(function (c, j) {
        if (c === 'treatment') return;
        var shown = cells[j] == null ? '' : cells[j];
        if (NOT_CHECKED[c]) {
          rows.push([s.treatment, NOT_CHECKED[c], 'nc', NaN, shown, shown === '-' ? 'bootstrap not run; page shows -' : 'bootstrap resampling, not refitted in R']);
        } else if (c === 'model' || c === 'detail' || c === 'n') {
          rows.push([s.treatment, c, 'text', NaN, shown, '']);
        } else if (c === 'pi') {
          var parts = shown === '-' ? ['-', '-'] : shown.split(' to ');
          rows.push([s.treatment, 'pi_low', 'num', s.piLow, parts[0] || '-', '']);
          rows.push([s.treatment, 'pi_high', 'num', s.piHigh, parts[1] || '-', '']);
        } else {
          rows.push([s.treatment, c, 'num', s[STAT_KEY[c]], shown, '']);
        }
      });
    });

    var raw = st.rawData;
    var L = [];
    L.push('# NMA Dose Response Studio: Model Summary checked in R');
    L.push('# Generated by the page on ' + new Date().toISOString() + ' from the data and settings it is analysing now.');
    L.push('# Run in a fresh R session:  Rscript nma-dose-model-check.R   (base R only; no package is needed)');
    L.push('# The validation pack for this page uses netmeta and metafor for special cases only (dose-split networks,');
    L.push('# residual heterogeneity); neither fits this model, so it is written below in base R from the page formulas.');
    L.push('');
    L.push('cfg <- list(model = ' + rStr(st.modelChoice) + ', freeBaseline = ' + (st.freeBaseline ? 'TRUE' : 'FALSE') +
      ', randomEffects = ' + (st.randomEffects ? 'TRUE' : 'FALSE') + ', tau2Method = ' + rStr(st.tau2Method || 'dl') +
      ', multiArm = ' + (st.multiArmAdjust ? 'TRUE' : 'FALSE') + ', useCovariate = ' + (st.useCovariate ? 'TRUE' : 'FALSE') +
      ', reference = ' + rStr(st.relativeMode ? (st.reference || '') : '') + ', targetDose = ' + rNum(st.targetDose) +
      ', selectionBias = ' + rStr(st.selectionBias || 'none') + ')');
    L.push('dat <- data.frame(');
    L.push('  study = ' + rVec(raw, function (r) { return rStr(r.study); }) + ',');
    L.push('  treatment = ' + rVec(raw, function (r) { return rStr(r.treatment); }) + ',');
    L.push('  dose = ' + rVec(raw, function (r) { return rNum(r.dose); }) + ',');
    L.push('  effect = ' + rVec(raw, function (r) { return rNum(r.effect); }) + ',');
    L.push('  se = ' + rVec(raw, function (r) { return rNum(r.se); }) + ',');
    L.push('  covariate = ' + rVec(raw, function (r) { return rNum(r.covariate); }) + ',');
    L.push('  baseWeight = ' + rVec(raw, function (r) { return rNum(r.baseWeight); }) + ',');
    L.push('  stringsAsFactors = FALSE)');
    L.push('# the Model Summary as the page shows it: full-precision value and the displayed text');
    L.push('page <- data.frame(');
    L.push('  treatment = ' + rVec(rows, function (r) { return rStr(r[0]); }) + ',');
    L.push('  quantity = ' + rVec(rows, function (r) { return rStr(r[1]); }) + ',');
    L.push('  kind = ' + rVec(rows, function (r) { return rStr(r[2]); }) + ',');
    L.push('  value = ' + rVec(rows, function (r) { return rNum(r[3]); }) + ',');
    L.push('  shown = ' + rVec(rows, function (r) { return rStr(r[4]); }) + ',');
    L.push('  why = ' + rVec(rows, function (r) { return rStr(r[5]); }) + ',');
    L.push('  stringsAsFactors = FALSE)');
    L.push('');
    L.push(R_ENGINE.trim());
    L.push('');
    L.push('cat("R:", R.version.string, "\\n")');
    L.push('cat("settings: model =", cfg$model, "| free baseline =", cfg$freeBaseline, "| random effects =", cfg$randomEffects,');
    L.push('    "| tau2 =", cfg$tau2Method, "| multi-arm adjust =", cfg$multiArm, "| reference =", if (nzchar(cfg$reference)) cfg$reference else "(none)",');
    L.push('    "| target dose =", cfg$targetDose, "| rows =", nrow(dat), "\\n\\n")');
    L.push('res <- model_summary(dat, cfg)');
    L.push('compare_summary(res, page)');
    return { script: L.join('\n') + '\n' };
  }

  var _runnerPromise = null;
  function loadRunner() {
    if (window.AlmWebR && typeof window.AlmWebR.runR === 'function') return Promise.resolve(window.AlmWebR);
    if (!_runnerPromise) _runnerPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '../shared/webr-runner.js';
      s.onload = function () {
        if (window.AlmWebR && typeof window.AlmWebR.runR === 'function') resolve(window.AlmWebR);
        else reject(new Error('shared/webr-runner.js loaded but AlmWebR is missing'));
      };
      s.onerror = function () { reject(new Error('Could not load ../shared/webr-runner.js')); };
      document.head.appendChild(s);
    }).catch(function (e) { _runnerPromise = null; throw e; });
    return _runnerPromise;
  }

  function el(id) { return document.getElementById(id); }
  function setStatus(text) { var s = el('rModelCheckStatus'); if (s) s.textContent = text; }
  function showOutput(text) { var o = el('rModelCheckOutput'); if (o) { o.textContent = text; o.hidden = !text; } }
  function verdictLine(stdout) {
    var lines = String(stdout || '').split(/\r?\n/).filter(function (l) { return /^(MATCH \d+\/\d+|MISMATCH )/.test(l); });
    return lines.length ? lines[lines.length - 1] : '';
  }

  function download() {
    var b = buildScript();
    if (b.refusal) { setStatus(b.refusal); return; }
    var blob = new Blob([b.script], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'nma-dose-model-check.R';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setStatus('Script downloaded (nma-dose-model-check.R). Run it with Rscript; it prints MATCH or MISMATCH.');
  }

  var busy = false;
  async function verify() {
    if (busy) return;
    var b = buildScript();
    if (b.refusal) { setStatus(b.refusal); return; }
    var btn = el('rModelCheckRun');
    busy = true; if (btn) btn.disabled = true;
    showOutput('');
    try {
      setStatus('Loading the pinned same-origin WebR runner...');
      var runner = await loadRunner();
      var res = await runner.runR({ script: b.script, packages: [], onStatus: setStatus });
      if (!res.ok) throw new Error(res.error);
      var v = verdictLine(res.stdout);
      window.__nmaRModelCheckLast = { stdout: res.stdout, verdict: v, versions: res.versions };
      showOutput(res.stdout);
      setStatus(v ? ('R (' + res.versions.R + ', webR ' + res.versions.webR + '): ' + v) : 'R ran but printed no MATCH/MISMATCH line; see the output.');
    } catch (e) {
      window.__nmaRModelCheckLast = { error: String(e && e.message || e) };
      setStatus('R could not run in the browser: ' + (e && e.message || e) + '. The downloadable script is the check.');
    } finally {
      busy = false; if (btn) btn.disabled = false;
    }
  }

  function wire() {
    var d = el('rModelCheckDownload'); if (d) d.addEventListener('click', download);
    var r = el('rModelCheckRun'); if (r) r.addEventListener('click', verify);
  }
  window.NmaRModelCheck = { buildScript: buildScript };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
