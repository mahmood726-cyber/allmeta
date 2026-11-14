# Reference values for tests/test_engine_vs_r.py (lane pwrest): R 4.6 + metafor on the page's demo yi / vi
# (engine_input.json, captured from the production page) and on metadat dat.bcg (13 trials, log RR).
#   - tau2 for every estimator the page offers (rma method = REML, DL, PM, ML, HS, SJ, HE, EB; tight control)
#   - I2 (metafor: 100 tau2 / (tau2 + s2), s2 the typical within-study variance) for each estimator
#   - Cochran Q and its p value (QEp, upper tail)
#   - the Q-profile 95% CI of tau2 (confint, REML fit)
#   - qchisq on the grid used by the page's tau2 / I2 confidence intervals
# Run from Truthcert1/tests:  Rscript --no-environ engine_reference.R
library(jsonlite); library(metafor); library(metadat)
inp <- fromJSON("engine_input.json", simplifyVector = TRUE)
bcg <- escalc("RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = dat.bcg)
inp$BCG13 <- list(measure = "RR", yi = as.numeric(bcg$yi), vi = as.numeric(bcg$vi))
methods <- c("REML", "DL", "PM", "ML", "HS", "SJ", "HE", "EB")
ctl <- list(threshold = 1e-12, tol = 1e-13, maxiter = 10000, stepadj = 0.5)
out <- list(R = R.version.string, metafor = as.character(packageVersion("metafor")), data = inp, fits = list())
for (nm in names(inp)) {
  d <- inp[[nm]]; f <- list()
  for (m in methods) {
    r <- rma(d$yi, d$vi, method = m, control = ctl)
    f[[m]] <- list(tau2 = r$tau2, I2 = r$I2, QE = r$QE, QEp = r$QEp, b = as.numeric(r$b), se = r$se)
  }
  ci <- confint(rma(d$yi, d$vi, method = "REML", control = ctl), control = list(tol = 1e-12))$random
  f$REML$tau2_ci <- c(ci["tau^2", "ci.lb"], ci["tau^2", "ci.ub"])
  out$fits[[nm]] <- f
}
out$chi_p <- c(0.005, 0.025, 0.05, 0.1, 0.5, 0.9, 0.95, 0.975, 0.995)
out$chi_df <- c(1, 2, 4, 5, 12, 30)
out$qchisq <- lapply(out$chi_df, function(d) qchisq(out$chi_p, d))
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE), "engine_r460.json")
