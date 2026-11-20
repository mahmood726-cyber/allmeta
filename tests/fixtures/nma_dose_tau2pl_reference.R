# Reference values for nma-dose-response-app/tests/nmaexp_honesty.test.cjs (lane nmaexp, 2026-11-14):
# REML tau2 and its profile-likelihood 95% CI (metafor confint(type = "PL")) on two datasets.
#   Rscript tests/fixtures/nma_dose_tau2pl_reference.R > tests/fixtures/nma_dose_tau2pl_metafor.json
# Roots solved to 1e-12 (metafor's default confint() tolerance leaves the bounds ~3e-5 off the root).
suppressPackageStartupMessages({ library(metafor); library(jsonlite) })
one <- function(yi, vi, label) {
  re <- rma(yi, vi, method = "REML", control = list(threshold = 1e-12, maxiter = 1000))
  pl <- confint(re, type = "PL", control = list(tol = 1e-12))$random
  list(data = label, yi = as.numeric(yi), vi = as.numeric(vi), tau2 = re$tau2, tau2PL = as.numeric(pl[1, 2:3]))
}
bcg <- escalc(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = dat.bcg)
nor <- escalc(measure = "MD", m1i = m1i, sd1i = sd1i, n1i = n1i, m2i = m2i, sd2i = sd2i, n2i = n2i, data = dat.normand1999)
out <- list(
  provenance = list(R = as.character(getRversion()), metafor = as.character(packageVersion("metafor")),
                    script = "tests/fixtures/nma_dose_tau2pl_reference.R", chi2_crit = qchisq(0.95, 1)),
  bcg = one(bcg$yi, bcg$vi, "metafor::dat.bcg, escalc(measure = 'RR')"),
  normand = one(nor$yi, nor$vi, "metafor::dat.normand1999, escalc(measure = 'MD')")
)
cat(toJSON(out, auto_unbox = TRUE, digits = NA, pretty = TRUE), "\n")
