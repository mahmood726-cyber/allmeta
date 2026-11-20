# Reference for qprofile_all.test.cjs: metafor confint(rma(yi, vi, method = "REML"))$random with metafor's own
# search range rule (tau2.max = max(100, 10 tau2)) and uniroot tol 1e-12; s^2 = metafor's typical within-study
# variance (k - 1) sum w / ((sum w)^2 - sum w^2), w = 1/v; I2 = rma()$I2.  R 4.6.0, metafor 5.2.1.
# Run: Rscript qprofile_all_reference.R  (writes qprofile_all_reference.json next to it)
suppressMessages(library(metafor))
mk <- function(name, yi, vi) {
  yi <- as.numeric(yi); vi <- as.numeric(vi)
  r  <- rma(yi, vi, method = "REML")
  ci <- confint(r, control = list(tol = 1e-12))$random
  w  <- 1 / vi; k <- length(yi)
  list(name = name, yi = yi, vi = vi, Q = r$QE, df = k - 1, tau2 = r$tau2, I2 = r$I2,
       s2 = (k - 1) * sum(w) / (sum(w)^2 - sum(w^2)),
       tau2_lb = ci["tau^2", "ci.lb"], tau2_ub = ci["tau^2", "ci.ub"],
       I2_lb = ci["I^2(%)", "ci.lb"], I2_ub = ci["I^2(%)", "ci.ub"])
}
bcg <- escalc(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = dat.bcg)
nor <- escalc(measure = "MD", m1i = m1i, sd1i = sd1i, n1i = n1i, m2i = m2i, sd2i = sd2i, n2i = n2i, data = dat.normand1999)
mol <- escalc(measure = "ZCOR", ri = ri, ni = ni, data = dat.molloy2014)
cases <- list(
  mk("dat.bcg logRR", bcg$yi, bcg$vi),
  mk("dat.normand1999 MD", nor$yi, nor$vi),
  mk("dat.molloy2014 ZCOR", mol$yi, mol$vi),
  mk("k=3 homogeneous (Q(0) below both quantiles)", c(0.10, 0.11, 0.09), c(0.2, 0.3, 0.25)),
  mk("k=5 upper bound above 100", c(-30, -5, 0, 12, 40), c(1, 2, 1.5, 3, 2))
)
jsonlite::write_json(cases, "qprofile_all_reference.json", digits = NA, auto_unbox = TRUE, pretty = TRUE)
for (c in cases) cat(sprintf("%-45s tau2 %.6g [%.6g, %.6g]  I2 %.4f [%.4f, %.4f]  s2 %.6g\n", c$name, c$tau2, c$tau2_lb, c$tau2_ub, c$I2, c$I2_lb, c$I2_ub, c$s2))
