# Profile-likelihood confidence limits for one variance component of an rma.mv fit, with
# metafor's own upper search bound made explicit so that a bound can never be pinned as a limit.
#
# metafor:::confint.rma.mv searches sigma^2 in [vc.min, vc.max] with vc.min = 0 and
# vc.max = max(10, 100 * sigma2hat). When the likelihood-ratio cutoff is not crossed inside that
# interval it returns the bound itself as the limit and records that only in ub.sign (">") of the
# returned object: there is no warning, no message and no printed output, and $random[1, ] alone
# cannot be distinguished from a genuine profile root. Reading the limit without the sign
# therefore pins a truncated search bound as a reference value.
#
# profile_limit() passes vc.max explicitly (control is merged after the defaults, so a supplied
# vc.max is honoured), and widens it by `factor` until ub.sign is empty, i.e. until the limit is
# interior to the searched interval. If the profile is still above the cutoff after `widenings`
# widenings, the upper limit is reported as NA_real_ (serialised as null, "not estimable"),
# never as a number. A NA limit with an empty sign is a convergence failure, not a bound, and is
# returned with ok = FALSE so the caller can retry with another optimiser.
#
# Loaded by generate-plus.R and generate-regimes-plus.R; those callers print libraries and
# versions. Requires metafor to be attached.
profile_limit <- function(fp, j, widenings = 12, factor = 10) {
  est <- unname(fp$sigma2[j])
  vc.max <- max(10, est * 100)
  default.max <- vc.max
  trace <- list()
  msgs <- character()
  ci <- c(NA_real_, NA_real_, NA_real_)
  for (step in 0:widenings) {
    cf <- withCallingHandlers(
      confint(fp, sigma2 = j, control = list(tol = 1e-8, maxiter = 1000, vc.max = vc.max)),
      warning = function(w) { msgs <<- c(msgs, conditionMessage(w)); invokeRestart('muffleWarning') })
    ci <- cf$random[1, ]
    trace[[length(trace) + 1L]] <- list(vc.max = vc.max, upper = unname(ci[3]),
      ub.sign = cf$ub.sign, lb.sign = cf$lb.sign)
    out <- list(estimate = est, lower = unname(ci[2]), upper = unname(ci[3]),
      vc.max = vc.max, default.max = default.max, widenings = step, bounded = TRUE, ok = TRUE,
      trace = trace, warnings = as.list(unique(msgs)))
    # vc.min is 0 here, so a lower limit at the bound would be the parameter boundary itself;
    # a non-empty lower sign would mean the search interval, not the data, set the limit.
    if (!identical(cf$lb.sign, "")) stop("confint returned the lower search bound as a limit")
    if (!is.finite(ci[2]) || !is.finite(ci[3])) { out$ok <- FALSE; return(out) }
    if (identical(cf$ub.sign, "")) return(out)
    # ub.sign ">" means the returned upper limit is exactly the bound that was searched.
    stopifnot(abs(ci[3] - vc.max) <= 1e-10 * vc.max)
    vc.max <- vc.max * factor
  }
  list(estimate = est, lower = unname(ci[2]), upper = NA_real_,
    vc.max = vc.max / factor, default.max = default.max, widenings = widenings,
    bounded = FALSE, ok = TRUE, trace = trace, warnings = as.list(unique(msgs)))
}

# The nine plotted profile marks. Mirrors the browser engine: the grid ends at the upper limit
# when there is one, and at 1.5 times the estimate when the limit is not estimable, so that both
# sides evaluate the same abscissae in either case.
profile_grid <- function(est, upper) {
  seq(0, max(if (is.na(upper)) 0 else upper, est * 1.5, 1e-8), length.out = 9)
}

# The profile restricted log-likelihood at one value of component j, with the other component
# re-estimated: an rma.mv fit with that component held fixed, which is what profile.rma.mv does
# internally. Two reasons to call it directly rather than through profile():
#   * profile.rma.mv treats a steps vector of length one as a step *count*, not as a value, so a
#     single abscissa cannot be requested through it at all;
#   * when the inner fit does not converge, profile.rma.mv returns NA for that mark silently. Here
#     a non-finite value is retried with the fallback optimiser and reported, never left as NA.
# Returns a list(ll, control) so the caller can record which optimiser produced each mark.
profile_ll <- function(data, j, x, control, fallback) {
  sigma2 <- c(NA_real_, NA_real_)
  sigma2[j] <- x
  one <- function(ctrl) suppressWarnings(tryCatch(as.numeric(logLik(
    rma.mv(y, v, random = ~ 1 | cluster/id, data = data, method = 'REML', sparse = TRUE,
           sigma2 = sigma2, control = ctrl))), error = function(e) NA_real_))
  ll <- one(control)
  if (is.finite(ll)) return(list(ll = ll, control = control))
  ll <- one(fallback)
  if (is.finite(ll)) return(list(ll = ll, control = fallback))
  stop(sprintf('profile log-likelihood at component %d = %.17g did not converge with either optimiser', j, x))
}
