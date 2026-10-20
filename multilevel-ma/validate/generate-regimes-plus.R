# Native R references for the few-cluster regime corpus (#alm-plus).
#
# Run from multilevel-ma/, after validate/regime-corpus-plus.R. Writes
#   validate/plus-corpus/regime-reference-plus.json  - one reference per configuration, in the
#     same shape as reference-plus.json (CR2 values conditional on score-refined R variance
#     estimates, REML log-likelihood, and both profile-likelihood intervals and marks);
#   validate/plus-corpus/divergences-plus.json       - every limit for which metafor's own
#     default upper search bound truncated the interval, with the adjudication that decides
#     which value satisfies the defining criterion.
#
# Upper profile limits come from profile_limit() (validate/profile-limit-plus.R), which widens
# metafor's vc.max until confint.rma.mv reports an interior limit (ub.sign == ""), so a search
# bound can never be pinned as a reference. Where the default bound would have truncated,
# divergences-plus.json records metafor's default-bound value, the widened value, and the profile
# restricted log-likelihood of each minus the likelihood-ratio target ll_max - qchisq(.95, 1)/2.
# A limit that satisfies the criterion has a gap of about zero; a truncated bound sits above the
# target, i.e. the search stopped early. Everything in that file is computed by metafor.
#
# The nine plotted marks are evaluated one abscissa at a time (profile_ll) instead of through
# profile.rma.mv, because profile.rma.mv silently returns NA for a mark whose inner fit does not
# converge - which happens on rv036_Bfew. Each run also recomputes the marks through
# profile.rma.mv and prints the largest difference over the marks that it does return, so the two
# routes are shown to agree.
extra <- Sys.getenv('ALM_EXISTING_R_LIB', '')
if (nzchar(extra) && dir.exists(extra)) .libPaths(c(.libPaths(), extra))
print(.libPaths())
for (p in c('metafor', 'clubSandwich', 'jsonlite')) cat(p, as.character(packageVersion(p)), '\n')
library(metafor)
library(clubSandwich)
source('validate/profile-limit-plus.R')
source('validate/refine-plus.R')
options(warn = 1)

corpus <- jsonlite::fromJSON('validate/plus-corpus/regime-corpus-plus.json', simplifyVector = FALSE)
cat('configurations:', length(corpus), '\n')
save <- function(x, path) {
  text <- jsonlite::toJSON(x, auto_unbox = TRUE, digits = 22, null = 'null', na = 'null', pretty = FALSE)
  con <- file(path, 'wb'); writeBin(charToRaw(paste0(text, '\n')), con); close(con)
}
CUT <- qchisq(.95, df = 1) / 2
DEFAULT <- list(rel.tol = 1e-10)
FALLBACK <- list(optimizer = 'optim', optmethod = 'Nelder-Mead', reltol = 1e-12, maxit = 10000)

result <- list()
divergences <- list()
agreement <- 0
missing_marks <- 0
for (name in names(corpus)) {
  cat('START', name, '\n'); flush.console()
  d <- do.call(rbind, lapply(corpus[[name]], as.data.frame))
  warnings <- character()
  answer <- tryCatch(withCallingHandlers({
    # metafor's default nlminb optimiser refuses some double-boundary designs outright
    # (rv112_Fzz: "Optimizer (nlminb) did not achieve convergence"). Record the refusal and the
    # optimiser that does converge rather than dropping the configuration.
    refused <- NULL
    f <- tryCatch(rma.mv(y, v, random = ~ 1 | cluster/id, data = d, method = 'REML', sparse = TRUE,
                         control = DEFAULT), error = function(e) e)
    control <- DEFAULT
    if (inherits(f, 'error')) {
      refused <- conditionMessage(f)
      control <- FALLBACK
      f <- rma.mv(y, v, random = ~ 1 | cluster/id, data = d, method = 'REML', sparse = TRUE,
                  control = control)
    }
    target <- as.numeric(logLik(f)) - CUT
    profiles <- lapply(1:2, function(j) {
      lim <- profile_limit(f, j)
      if (!lim$ok) {
        fp <- f; fp$control <- FALLBACK
        lim <- profile_limit(fp, j)
      }
      stopifnot(lim$ok, is.finite(lim$lower), lim$bounded || is.na(lim$upper))
      est <- unname(f$sigma2[j])
      if (lim$widenings > 0L || !lim$bounded) {
        truncated <- lim$trace[[1]]$upper
        gap <- function(x) if (is.na(x)) NA_real_ else profile_ll(d, j, x, control, FALLBACK)$ll - target
        divergences[[length(divergences) + 1L]] <<- list(
          id = name, component = j, clusters = length(unique(d$cluster)), rows = nrow(d),
          estimate = est, default_vc_max = lim$default.max, widened_vc_max = lim$vc.max,
          widenings = lim$widenings, bounded = lim$bounded,
          metafor_default_upper = truncated, metafor_default_ub_sign = lim$trace[[1]]$ub.sign,
          reference_upper = lim$upper, target = target,
          gap_default = gap(truncated), gap_reference = gap(lim$upper))
      }
      grid <- profile_grid(est, lim$upper)
      marks <- lapply(grid, function(x) profile_ll(d, j, x, control, FALLBACK))
      ll <- vapply(marks, function(m) m$ll, 0)
      stopifnot(all(is.finite(ll)))
      # Cross-check against profile.rma.mv on the marks it does return.
      pr <- suppressWarnings(profile(f, sigma2 = j, steps = grid, plot = FALSE, progbar = FALSE)$ll)
      ok <- is.finite(pr)
      missing_marks <<- missing_marks + sum(!ok)
      if (any(ok)) agreement <<- max(agreement, max(abs(ll[ok] - pr[ok])))
      used <- unique(lapply(marks, function(m) m$control))
      c(list(estimate = est, lower = lim$lower, upper = lim$upper,
             x = as.list(grid), ll = as.list(ll)),
        if (length(used) > 1L || !identical(used[[1]], DEFAULT)) list(control = used) else list())
    })
    # CR2 reference conditional on R-refined variance estimates, exactly as refine-reference-plus.R.
    theta <- refine_variances(d, vapply(profiles, function(p) p$estimate, 0))
    fr <- rma.mv(y, v, random = ~ 1 | cluster/id, data = d, sigma2 = theta, method = 'REML', sparse = TRUE)
    cr <- coef_test(fr, vcov = 'CR2', cluster = d$cluster, test = 'Satterthwaite')
    ci <- conf_int(fr, vcov = 'CR2', cluster = d$cluster, test = 'Satterthwaite', level = .95)
    list(status = 'ok', rows = nrow(d), clusters = length(unique(d$cluster)),
      robust = list(estimate = unname(cr$beta[1]), se = cr$SE[1], df = cr$df_Satt[1],
        t = cr$tstat[1], p = cr$p_Satt[1], lower = ci$CI_L[1], upper = ci$CI_U[1]),
      logLik = as.numeric(logLik(f)), profiles = profiles, cr2Sigma2 = as.list(theta),
      source = list(generator = 'validate/regime-corpus-plus.R', seed = 20261019,
        reason = 'Few-cluster regime configuration from the independent review of PR #151; the 44 metadat configurations all have at least four clusters.',
        fit_control = control, default_optimizer_error = refused))
  }, warning = function(w) { warnings <<- c(warnings, conditionMessage(w)); invokeRestart('muffleWarning') }),
    error = function(e) list(status = 'reference error', reason = conditionMessage(e)))
  result[[name]] <- c(answer, list(warnings = as.list(unique(warnings))))
  save(result, 'validate/plus-corpus/regime-reference-plus.json')
  save(divergences, 'validate/plus-corpus/divergences-plus.json')
  cat('DONE', name, answer$status, '\n'); flush.console()
}
cat('configurations:', length(result), ' ok:', sum(vapply(result, function(r) identical(r$status, 'ok'), TRUE)), '\n')
cat('profile marks: largest difference to profile.rma.mv', sprintf('%.3g', agreement),
    '; marks profile.rma.mv returned as NA:', missing_marks, '\n')
cat('truncated limits recorded:', length(divergences), '\n')
for (x in divergences) cat(sprintf('  %-12s comp %d clusters %d  default %-14.10g (sign %s) widened %-14.10g  gap default %+.6g  gap reference %+.3g\n',
  x$id, x$component, x$clusters, x$metafor_default_upper, x$metafor_default_ub_sign,
  x$reference_upper, x$gap_default, x$gap_reference))
