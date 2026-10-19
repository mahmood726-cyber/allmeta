source('allmeta/dta-sroc/validate/preflight-plus.R')
# Raw-scale covariate configurations (REVIEW_133 P1-3). The pinned corpus standardises every covariate; users may
# enter raw calendar years. For each configuration two mada references are stored:
#   raw: reitsma() on the covariate exactly as supplied (what a user would run in R);
#   std: reitsma() on (x - mean)/SD, coefficients and vcov back-transformed to the supplied scale (the same model).
# Sets: the two reference datasets with their raw year columns; a shift scan (the same data at mean/SD 0..200);
# 60 synthetic raw-year datasets (k = 4..40, 1985-2022, a third with small cells). Regions are stored for the
# reference datasets only; elsewhere they are a function of the checked mu and C and are covered by the pinned corpus.
library(mada)
ctl <- list(maxiter = 1000, reltol = 1e-12)
back <- function(b, V, c, s) {
  A1 <- matrix(c(1, 0, -c / s, 1 / s), 2); A <- rbind(cbind(A1, 0 * A1), cbind(0 * A1, A1))
  list(b = as.vector(A %*% b), V = A %*% V %*% t(A))
}
entry_of <- function(b, V, Psi, x, regions) {
  se <- sqrt(diag(V)); z <- b / se
  e <- list(coef = b, vcov = unname(V), Psi = unname(Psi), z = z, p = 2 * pnorm(-abs(z)), se = se, lo = b - qnorm(.975) * se, hi = b + qnorm(.975) * se)
  e$predictions <- lapply(unique(c(min(x), mean(x), max(x))), function(at) {
    L <- rbind(c(1, at, 0, 0), c(0, 0, 1, at)); mu <- as.vector(L %*% b); C <- L %*% V %*% t(L)
    sens <- plogis(mu[1]); fp <- plogis(mu[2])
    q <- list(at = at, sens = sens, spec = 1 - fp, mu = mu, C = unname(C),
      post = lapply(c(0, .01, .1, .5, 1), function(prev) list(prevalence = prev, positive = prev * sens / (prev * sens + (1 - prev) * fp), negative = prev * (1 - sens) / (prev * (1 - sens) + (1 - prev) * (1 - fp)))))
    if (regions) q$regions <- lapply(list(confidence = C, prediction = C + Psi), function(S) {
      rho <- S[1, 2] / sqrt(S[1, 1] * S[2, 2]); theta <- seq(0, 2 * pi, length.out = 101)[-101]
      a <- sqrt(1 + rho) * cos(theta); bb <- sqrt(1 - rho) * sin(theta)
      cbind(sens = plogis(mu[1] + sqrt(qchisq(.95, 2) * S[1, 1] / 2) * (a + bb)), fpr = plogis(mu[2] + sqrt(qchisq(.95, 2) * S[2, 2] / 2) * (a - bb)))
    })
    q
  })
  e
}
one <- function(id, set, d, method, cc, regions = FALSE) {
  x <- d$x; c0 <- mean(x); s0 <- sd(x)
  fr <- tryCatch(reitsma(d, formula = cbind(tsens, tfpr) ~ x, method = method, correction.control = cc, control = ctl), error = function(e) e)
  du <- d; du$x <- (x - c0) / s0
  fs <- tryCatch(reitsma(du, formula = cbind(tsens, tfpr) ~ x, method = method, correction.control = cc, control = ctl), error = function(e) e)
  ref <- function(f, std) {
    if (inherits(f, 'error')) { stopifnot(cc == 'none', any(as.matrix(d[, 1:4]) == 0)); return(list(ok = FALSE, error = conditionMessage(f), refusal = 'Uncorrected zero cell')) }
    Psi <- if (is.null(f$Psi)) matrix(0, 2, 2) else f$Psi
    b <- as.numeric(coef(f)); V <- unname(vcov(f))
    if (std) { bt <- back(b, V, c0, s0); b <- bt$b; V <- bt$V }
    c(list(ok = TRUE), entry_of(b, V, Psi, x, regions))
  }
  list(id = id, set = set, rows = d, method = method, correction = cc, meanOverSD = abs(c0) / s0, raw = ref(fr, FALSE), std = ref(fs, TRUE))
}
cases <- list(); add <- function(z) cases[[length(cases) + 1]] <<- z
data(dat.kearon1998, package = 'metadat'); data(dat.rivera2025, package = 'metadat')
k98 <- dat.kearon1998
real <- list(`dat.kearon1998/year-raw` = data.frame(TP = k98$tp, FN = k98$np - k98$tp, FP = k98$nn - k98$tn, TN = k98$tn, x = k98$year),
  `dat.rivera2025/Year-raw` = data.frame(dat.rivera2025[, c('TP', 'FN', 'FP', 'TN')], x = dat.rivera2025$Year))
for (n in names(real)) {
  d <- real[[n]]; d <- d[complete.cases(d), ]; rownames(d) <- NULL
  for (m in c('reml', 'ml', 'fixed')) for (cc in c('all', 'single', 'none')) add(one(paste(n, m, cc, sep = '/'), 'reference-raw-year', d, m, cc, TRUE))
}
set.seed(4242)
for (i in 1:30) {
  k <- c(4, 5, 6, 8, 10, 15, 20, 30, 40, 12)[(i - 1) %% 10 + 1]
  u <- rnorm(k); u <- (u - mean(u)) / sd(u)
  n1 <- sample(20:300, k, TRUE); n0 <- sample(40:600, k, TRUE)
  tp <- rbinom(k, n1, plogis(qlogis(.8) + .3 * u + rnorm(k, 0, .4))); fp <- rbinom(k, n0, plogis(qlogis(.15) - .2 * u + rnorm(k, 0, .4)))
  if (any(c(tp, n1 - tp, fp, n0 - fp) == 0)) next
  for (r in c(0, 0.5, 1, 2, 3, 5, 10, 20, 50, 100, 200)) for (m in c('reml', 'ml'))
    add(one(sprintf('scan%02d/r%g/%s/all', i, r, m), 'shift-scan', data.frame(TP = tp, FN = n1 - tp, FP = fp, TN = n0 - fp, x = 10 * (u + r)), m, 'all'))
}
set.seed(20261019)
for (i in 1:60) {
  k <- c(4, 5, 6, 8, 10, 15, 20, 30, 40, 12)[(i - 1) %% 10 + 1]
  yr <- sort(sample(1985:2022, k, TRUE)); if (length(unique(yr)) < 2) yr[1] <- yr[1] - 1
  small <- i %% 3 == 0
  n1 <- sample(if (small) 5:40 else 20:300, k, TRUE); n0 <- sample(if (small) 10:80 else 40:600, k, TRUE)
  ls <- qlogis(if (small) .93 else .8) + .02 * (yr - 2000) + rnorm(k, 0, .4); lf <- qlogis(if (small) .05 else .15) - .01 * (yr - 2000) + rnorm(k, 0, .4)
  tp <- rbinom(k, n1, plogis(ls)); fp <- rbinom(k, n0, plogis(lf))
  d <- data.frame(TP = tp, FN = n1 - tp, FP = fp, TN = n0 - fp, x = yr)
  for (m in c('reml', 'ml', 'fixed')) for (cc in c('all', 'single', 'none')) add(one(sprintf('syn%02d/raw-year/%s/%s', i, m, cc), 'synthetic-raw-year', d, m, cc))
}
out <- list(R = as.character(getRversion()), mada = as.character(packageVersion('mada')), mvmeta = as.character(packageVersion('mvmeta')),
  metadat = as.character(packageVersion('metadat')), control = ctl, cases = cases)
jsonlite::write_json(out, 'allmeta/dta-sroc/validate/corpus/plus-raw-scale.json', auto_unbox = TRUE, digits = NA, na = 'null')
cat('Raw-scale configurations:', length(cases), ' fitted by mada on raw input:', sum(sapply(cases, function(z) z$raw$ok)), '\n')
for (s in unique(sapply(cases, `[[`, 'set'))) cat(' ', s, sum(sapply(cases, `[[`, 'set') == s), '\n')
