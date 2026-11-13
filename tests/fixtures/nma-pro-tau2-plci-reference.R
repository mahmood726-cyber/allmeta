# Reference values for the nma-pro tau2 profile-likelihood CI test (lane adjud, 2026-11-13).
# metafor 5.2.1: confint(rma(method = M), type = "PL") at tight tolerances. For REML the profile is the
# RESTRICTED log-likelihood, for ML the ML log-likelihood; both cross max - qchisq(.95, 1) / 2.
# Usage: Rscript tests/fixtures/nma-pro-tau2-plci-reference.R  (writes the oracle JSON next to it)
suppressMessages({library(metafor); library(jsonlite)})
O <- fromJSON(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))), "tau2-audit-remlB-oracle.json"))
ctl <- list(threshold = 1e-14, tol = 1e-14, maxiter = 10000, stepadj = 0.5)
out <- list()
for (nm in c("normand", "bcg", "molloy", "bangertdrowns")) { u <- O$uni[[nm]]; out[[nm]] <- list()
  for (m in c("REML", "ML")) { f <- rma(u$yi, u$vi, method = m, control = ctl)
    ci <- confint(f, type = "PL", control = list(tol = 1e-12))$random[1, ]
    out[[nm]][[m]] <- list(tau2 = f$tau2, lower = ci[[2]], upper = ci[[3]]) } }
res <- list(generated = format(Sys.time(), "%Y-%m-%d"), metafor = as.character(packageVersion("metafor")), R = R.version.string, plci = out)
writeLines(toJSON(res, digits = NA, auto_unbox = TRUE, pretty = TRUE), file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))), "nma-pro-tau2-plci-oracle.json"))
