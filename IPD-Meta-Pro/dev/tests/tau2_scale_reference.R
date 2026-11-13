# Reference for tau2_scale.test.cjs: metafor rma(yi, vi, method = REML / ML / PM) on example sets of
# studies_examples.json rescaled by c (yi * c, vi * c^2), with control threshold = 1e-14 c^2, tol = 1e-15 c^2,
# maxiter = 10000, tau2.max = 1e3 c^2 -- i.e. the estimate itself, free of metafor's default stopping rule
# (absolute threshold 1e-5 / uniroot tol 1.2e-4, which is not scale-equivariant; its values are recorded
# as metafor_default for comparison only).  R 4.6.0, metafor 5.2.1.
# Run: Rscript tau2_scale_reference.R  (writes tau2_scale_reference.json next to it)
suppressMessages({library(metafor); library(jsonlite)})
ex <- fromJSON("studies_examples.json")
cases <- list()
for (nm in c("survival", "binary", "ovarian_survival", "statin_cvd")) for (m in c("REML", "ML", "PM")) for (cc in c(1e-4, 1, 1e4)) {
  y <- ex[[nm]]$yi * cc; v <- ex[[nm]]$vi * cc^2
  f <- rma(y, v, method = m, control = list(threshold = 1e-14 * cc^2, tol = 1e-15 * cc^2, maxiter = 10000, tau2.max = 1e3 * cc^2))
  fd <- tryCatch(rma(y, v, method = m), error = function(e) NULL)
  cases[[length(cases) + 1]] <- list(name = nm, method = m, c = cc, tau2 = f$tau2, z = f$zval, p = f$pval,
    metafor_default_tau2 = if (is.null(fd)) NA else fd$tau2, metafor_default_p = if (is.null(fd)) NA else fd$pval)
}
jsonlite::write_json(cases, "tau2_scale_reference.json", digits = NA, auto_unbox = TRUE, pretty = TRUE)
for (r in cases) cat(sprintf("%-17s %-4s c=%-6g tau2/c^2 %.10g p %.6g\n", r$name, r$method, r$c, r$tau2 / r$c^2, r$p))
