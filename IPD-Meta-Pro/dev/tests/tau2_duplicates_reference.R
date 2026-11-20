# Reference for tau2_duplicates.test.cjs: metafor rma(yi, vi, method = DL / REML / PM / SJ / HE) on the data sets the
# page's duplicate tau^2 estimators are reached with -- the clustered-IPD panel (runTwoStageIPD: estimateTau2DL /
# estimateTau2REML / estimateTau2PM) and automatic model selection (fitModelToStudies: DL / REML / PM / SJ;
# HE is recorded because the page's "SJ" there computed HE).
# Sets: example sets of studies_examples.json, a k = 2 set (survival studies 3 and 5, the most discrepant
# pair: Q = 5.85 > k - 1), a tau^2 = 0 boundary set (statin_cvd shrunk towards its mean so Q < k - 1),
# and survival in large (x 1e4) and small (x 1e-4) units.
# Control as tau2_scale_reference.R: threshold = 1e-14 c^2, tol = 1e-15 c^2, maxiter = 10000, tau2.max = 1e3 c^2,
# i.e. the estimate itself, free of metafor's default stopping rule.  R 4.6.0, metafor 5.2.1.
# Run: Rscript tau2_duplicates_reference.R  (writes tau2_duplicates_reference.json next to it)
suppressMessages({library(metafor); library(jsonlite)})
ex <- fromJSON("studies_examples.json")
sets <- list()
for (nm in c("survival", "binary", "continuous", "ovarian_survival", "statin_cvd", "hiv_survival"))
  sets[[nm]] <- list(yi = ex[[nm]]$yi, vi = ex[[nm]]$vi, c = 1)
sets[["survival_k2"]] <- list(yi = ex$survival$yi[c(3, 5)], vi = ex$survival$vi[c(3, 5)], c = 1)
s <- ex$statin_cvd; m <- mean(s$yi)
sets[["boundary_tau2_0"]] <- list(yi = m + 0.05 * (s$yi - m), vi = s$vi, c = 1)
sets[["survival_x1e4"]] <- list(yi = ex$survival$yi * 1e4, vi = ex$survival$vi * 1e8, c = 1e4)
sets[["survival_x1e-4"]] <- list(yi = ex$survival$yi * 1e-4, vi = ex$survival$vi * 1e-8, c = 1e-4)
cases <- list()
for (nm in names(sets)) {
  d <- sets[[nm]]; cc <- d$c
  ref <- list(name = nm, yi = d$yi, vi = d$vi, k = length(d$yi))
  for (meth in c("DL", "REML", "PM", "SJ", "HE")) {
    f <- rma(d$yi, d$vi, method = meth, control = list(threshold = 1e-14 * cc^2, tol = 1e-15 * cc^2, maxiter = 10000, tau2.max = 1e3 * cc^2))
    ref[[meth]] <- list(tau2 = f$tau2, mu = as.numeric(f$beta), se = f$se, Q = f$QE)
  }
  cases[[length(cases) + 1]] <- ref
}
# End-to-end set for the clustered-IPD panel: individual rows (study, treat, y) with between-study heterogeneity;
# stage 1 as runTwoStageIPD (mean difference, var = sT^2/nT + sC^2/nC with n - 1 denominators), stage 2 rma.
set.seed(60)
ns <- c(14, 20, 9, 30, 12, 18, 25); th <- 0.4 + rnorm(length(ns), 0, 0.5)
rows <- do.call(rbind, lapply(seq_along(ns), function(j) {
  tr <- rep(c(1, 0), each = ns[j])
  data.frame(study = paste0("S", j), treat = tr, y = round(10 + th[j] * tr + rnorm(2 * ns[j], 0, 1.2), 6))
}))
st <- do.call(rbind, lapply(split(rows, factor(rows$study, levels = unique(rows$study))), function(d) {
  a <- d$y[d$treat == 1]; b <- d$y[d$treat == 0]
  data.frame(yi = mean(a) - mean(b), vi = var(a) / length(a) + var(b) / length(b))
}))
ipd <- list(rows = rows, yi = st$yi, vi = st$vi)
for (meth in c("DL", "REML", "PM")) {
  f <- rma(st$yi, st$vi, method = meth, control = list(threshold = 1e-14, tol = 1e-15, maxiter = 10000))
  ipd[[meth]] <- list(tau2 = f$tau2, mu = as.numeric(f$beta), se = f$se, Q = f$QE)
}
cat(sprintf("clustered IPD k=%d rows=%d DL %.10g REML %.10g PM %.10g mu(REML) %.10g
", nrow(st), nrow(rows), ipd$DL$tau2, ipd$REML$tau2, ipd$PM$tau2, ipd$REML$mu))
cases <- list(sets = cases, ipd = ipd)
jsonlite::write_json(cases, "tau2_duplicates_reference.json", digits = NA, auto_unbox = TRUE, pretty = TRUE)
for (r in cases$sets) cat(sprintf("%-17s k=%-2d DL %.10g REML %.10g PM %.10g SJ %.10g HE %.10g  Q %.6g\n", r$name, r$k, r$DL$tau2, r$REML$tau2, r$PM$tau2, r$SJ$tau2, r$HE$tau2, r$DL$Q))
cat(sprintf("metafor %s, %s\n", packageVersion("metafor"), R.version.string))
