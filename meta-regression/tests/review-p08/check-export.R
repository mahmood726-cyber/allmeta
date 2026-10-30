# Execute the generated script intact; only suppress its human-readable printout.
# Arguments: exported script, JSON result file. Both live in a temporary directory.
args <- commandArgs(trailingOnly = TRUE)
stopifnot(length(args) == 2L)
json <- function(value) {
  if (is.list(value)) {
    items <- vapply(value, json, character(1))
    if (!is.null(names(value))) {
      items <- paste0(vapply(names(value), json, character(1)), ":", items)
      return(paste0("{", paste(items, collapse = ","), "}"))
    }
    return(paste0("[", paste(items, collapse = ","), "]"))
  }
  if (length(value) != 1L) return(json(as.list(value)))
  if (is.character(value)) return(encodeString(value, quote = '"'))
  if (is.numeric(value) && is.finite(value)) return(sprintf("%.17g", value))
  stop("Non-finite or unsupported R result")
}
scope <- new.env(parent = globalenv())
result <- tryCatch({
  invisible(capture.output(sys.source(args[1], envir = scope)))
  m <- scope$res
  p <- predict(m, newmods = mean(scope$x))
  list(status = "ok", expected = list(
    intercept = unname(m$b[1]), slope = unname(m$b[2]),
    intercept_se = m$se[1], slope_se = m$se[2],
    intercept_ci_lb = m$ci.lb[1], intercept_ci_ub = m$ci.ub[1],
    slope_ci_lb = m$ci.lb[2], slope_ci_ub = m$ci.ub[2],
    tau2_pm = m$tau2, R2_tau2 = m$R2 / 100,
    QE = m$QE, QE_p = m$QEp, QE_df = m$k - m$p,
    pred = p$pred, pred_se = p$se, pi_lo = p$pi.lb, pi_hi = p$pi.ub))
}, error = function(e) list(status = "error", message = conditionMessage(e)))
result$R <- R.version.string
result$packages <- list(metafor = as.character(packageVersion("metafor")),
                       stats = as.character(packageVersion("stats")),
                       utils = as.character(packageVersion("utils")))
writeLines(json(result), args[2], useBytes = TRUE)
