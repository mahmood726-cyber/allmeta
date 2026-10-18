# Generator for the frozen metafor references in cumulative-subgroup-rexport-parity.spec.mjs.
# Run: Rscript --vanilla hub/shared/tests/_cumsub_parity_gen.R
# Captured with R 4.6.0 + metafor 5.2-1 (2026-10-16).
#
# The app pools each subgroup with its OWN Paule-Mandel tau^2 and then tests the subgroup
# means with a fixed-effect Cochran Q (meta::metagen Q.b.random construction). The matching
# metafor construction is rma(..., method="PM") per subgroup followed by
# rma(mu_g, vi = se_g^2, method="FE")$QE. The common-tau moderator model
# rma(yi, sei, mods = ~ factor(grp), method="PM") is a DIFFERENT estimand (QM), which is
# what the pre-fix R export printed.
lp <- Sys.getenv("R_LIBS_USER"); if (nzchar(lp)) .libPaths(c(strsplit(lp, .Platform$path.sep)[[1]], .libPaths()))
suppressPackageStartupMessages(library(metafor))
dat <- escalc(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = dat.bcg)
yi <- as.numeric(dat$yi); se <- sqrt(as.numeric(dat$vi)); grp <- as.character(dat$alloc)
fits <- lapply(split(seq_along(yi), grp), function(ix) rma(yi[ix], sei = se[ix], method = "PM", control = list(tol = 1e-12)))
mu <- vapply(fits, function(x) as.numeric(x$b), 0.0)
vars <- vapply(fits, function(x) x$se^2, 0.0)
between <- rma(mu, vi = vars, method = "FE")
common <- rma(yi, sei = se, mods = ~ factor(grp), method = "PM")
out <- list(
  yi = sprintf("%.17g", yi), se = sprintf("%.17g", se), grp = grp,
  Q_bw = sprintf("%.17g", between$QE), df_bw = length(fits) - 1,
  p_bw = sprintf("%.17g", between$QEp),
  QM_common_tau = sprintf("%.17g", common$QM),
  metafor = as.character(packageVersion("metafor")), R = R.version.string
)
cat(jsonlite::toJSON(out, auto_unbox = TRUE, digits = NA), "\n")
