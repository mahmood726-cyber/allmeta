# Reference values for tests/playwright/pairwise-truthcert1-i2ci.spec.mjs (lane pwrest3): the 95% CI of I2 as
# metafor confint() gives it -- the Q-profile CI of tau2 mapped to I2 = 100 tau2 / (tau2 + s2), s2 the typical
# within-study variance -- for each tau2 estimator the page offers, on the page's demo yi / vi
# (engine_input.json) and on metadat dat.bcg (13 trials, log RR).
# Run from Truthcert1/tests:  Rscript --no-environ i2ci_reference.R  ->  i2ci_r460.json
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
    ci <- confint(r, control = list(tol = 1e-12))$random
    f[[m]] <- list(tau2 = r$tau2, I2 = r$I2, I2_ci = c(ci["I^2(%)", "ci.lb"], ci["I^2(%)", "ci.ub"]),
                   tau2_ci = c(ci["tau^2", "ci.lb"], ci["tau^2", "ci.ub"]))
  }
  out$fits[[nm]] <- f
}
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE), "i2ci_r460.json")
