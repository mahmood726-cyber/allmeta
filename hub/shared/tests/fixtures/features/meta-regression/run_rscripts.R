# Runs every exported meta-regression R script (unmodified) and records the fitted model.
# Usage: Rscript run_rscripts.R <dir-with-.R-files> out.json [tight]
# With 'tight', the script text is still unmodified but rma() resolves to a wrapper that adds
# control=list(tol=1e-12, threshold=1e-12, maxiter=1000) (metafor's default PM root-finding tolerance is
# .Machine$double.eps^0.25), to separate solver tolerance from method differences.
suppressPackageStartupMessages({library(metafor); library(jsonlite)})
cat(R.version.string, '\n'); cat('libPaths:', .libPaths(), '\n')
cat('metafor', as.character(packageVersion('metafor')), '\n')
args <- commandArgs(TRUE)
files <- sort(list.files(args[1], pattern = '\\.R$', full.names = TRUE))
out <- list()
for (f in files) {
  e <- new.env(parent = globalenv())
  if (isTRUE(args[3] == 'tight')) e$rma <- function(...) { cl <- match.call(); cl[[1]] <- quote(metafor::rma); cl$control <- list(tol = 1e-12, threshold = 1e-12, maxiter = 1000); eval(cl, parent.frame()) }
  printed <- capture.output(sys.source(f, envir = e, keep.source = FALSE, toplevel.env = e))
  res <- get('res', envir = e)
  out[[basename(f)]] <- list(
    intercept = unname(coef(res)[1]), slope = unname(coef(res)[2]),
    intercept_se = unname(res$se[1]), slope_se = unname(res$se[2]),
    intercept_ci_lb = unname(res$ci.lb[1]), intercept_ci_ub = unname(res$ci.ub[1]),
    slope_ci_lb = unname(res$ci.lb[2]), slope_ci_ub = unname(res$ci.ub[2]),
    slope_t = unname(res$zval[2]), slope_p = unname(res$pval[2]), slope_df = res$ddf[[1]],
    tau2 = res$tau2, QE = res$QE, QE_p = res$QEp, QE_df = res$k - res$p, R2 = res$R2, k = res$k,
    control_tol = if (is.null(res$control$tol)) NA else res$control$tol,
    printed = paste(printed, collapse = '\n'))
  cat(basename(f), 'tau2', format(res$tau2, digits = 17), '\n')
}
writeLines(toJSON(list(R = R.version.string, metafor = as.character(packageVersion('metafor')), tight = isTRUE(args[3] == 'tight'), results = out),
                  auto_unbox = TRUE, digits = NA, na = 'null'), args[2])
cat(length(out), 'scripts run\n')
