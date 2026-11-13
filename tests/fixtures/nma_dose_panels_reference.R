# Reference values for tests/playwright/nma-dose-tau2-panel.spec.mjs (lane nmaparsed, 2026-11-13):
# metafor on dat.bcg (log risk ratios) for the pairwise panels of nma-dose-response-app.
#   Rscript tests/fixtures/nma_dose_panels_reference.R > tests/fixtures/nma_dose_panels_metafor.json
suppressPackageStartupMessages({ library(metafor); library(jsonlite) })
dat <- escalc(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = dat.bcg)
yi <- as.numeric(dat$yi); vi <- as.numeric(dat$vi)
# Iterative estimators and the profile-likelihood CI are solved to 1e-12: metafor's default
# confint() root tolerance (.Machine$double.eps^0.25) leaves the PL bounds about 3e-5 off the root.
fit <- function(m) rma(yi, vi, method = m, control = list(threshold = 1e-12, maxiter = 1000))
est <- lapply(c(REML = "REML", SJ = "SJ", DL = "DL", PM = "PM", EB = "EB"), function(m) {
  f <- fit(m); list(tau2 = f$tau2, I2 = f$I2, H2 = f$H2)
})
re <- fit("REML")
pl <- confint(re, type = "PL", control = list(tol = 1e-12))$random
l1 <- leave1out(re)
o <- order(vi)               # most precise first (the page's "precision" ordering)
cu <- cumul(re, order = vi)  # metafor >= 4: 'order' is the variable to sort by, not a permutation
inf <- influence(re)
out <- list(
  provenance = list(R = as.character(getRversion()), metafor = as.character(packageVersion("metafor")),
                    data = "metafor::dat.bcg, escalc(measure = 'RR')", script = "tests/fixtures/nma_dose_panels_reference.R"),
  yi = yi, vi = vi,
  estimators = est,
  reml = list(mu = as.numeric(re$b), ci = c(re$ci.lb, re$ci.ub), QE = re$QE, tau2PL = as.numeric(pl[1, 2:3])),
  leave1out = list(estimate = as.numeric(l1$estimate), ci.lb = as.numeric(l1$ci.lb), ci.ub = as.numeric(l1$ci.ub), I2 = as.numeric(l1$I2)),
  cumul_precision = list(order = o, estimate = as.numeric(cu$estimate), ci.lb = as.numeric(cu$ci.lb), ci.ub = as.numeric(cu$ci.ub)),
  influence = list(rstudent = as.numeric(inf$inf$rstudent), dfbetas = as.numeric(inf$dfbs$intrcpt),
                   cook = as.numeric(inf$inf$cook.d), hat = as.numeric(inf$inf$hat))
)
cat(toJSON(out, auto_unbox = TRUE, digits = NA, pretty = TRUE), "\n")
