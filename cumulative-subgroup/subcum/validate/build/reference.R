# Independent R composite reference for the within-subgroup cumulative meta-analysis.
# Neither metafor::cumul (no subgroup argument) nor meta::metacum (no subgroup argument; returns the
# pooled path for a subgrouped object) does this in one call, so R composes it: per subgroup,
# rma(yi, vi, method = "PM") on that subgroup's rows, then cumul(..., order = year) under the page's
# ordering rule. Per step: residual Q at the PM weights and the t_{k-1} prediction interval.
#
# Usage: Rscript reference.R <corpus.json> <outdir> <worker> <workers>
# Checkpointed: one JSON file per configuration in <outdir>; existing files are skipped (resume).
# Requires metafor 5.2.1 (asserted) and jsonlite. On the laptop node .libPaths starts with C:/p121314/Rlib.
if (dir.exists('C:/p121314/Rlib')) .libPaths(c('C:/p121314/Rlib', .libPaths()))
stopifnot(as.character(packageVersion('metafor')) == '5.2.1')
suppressPackageStartupMessages({ library(metafor); library(jsonlite) })
args <- commandArgs(TRUE)
src <- dirname(normalizePath(sub('^--file=', '', grep('^--file=', commandArgs(FALSE), value = TRUE)[1])))
source(file.path(src, 'json17.R'))
corpus_file <- args[1]; outdir <- args[2]; worker <- as.integer(args[3]); workers <- as.integer(args[4])
dir.create(outdir, showWarnings = FALSE, recursive = TRUE)
cfg <- fromJSON(corpus_file, simplifyVector = FALSE)
get <- function(x, n) x[[n, exact = TRUE]]
num <- function(x) vapply(x, function(z) if (is.null(z)) NA_real_ else as.numeric(z), 0.0)
chr <- function(x) vapply(x, function(z) if (is.null(z) || identical(z, '')) NA_character_ else as.character(z), '')
# Same PM fit (estimator, z test, convergence controls) as the existing archived reference (bench/reference.R).
# The subgroup rows are passed as data so that cumul(order = yr) resolves the year column in them.
fit <- function(y, v, yr) rma(yi = y, vi = v, data = data.frame(y = y, v = v, yr = yr), method = 'PM', test = 'z',
  control = list(threshold = 1e-12, maxiter = 1000, tau2.max = if (length(y) > 1) max(1, var(y) * 100) else 1,
                 tol = .Machine[['double.eps', exact = TRUE]]^0.75))
versions <- list(R = as.character(getRversion()), metafor = as.character(packageVersion('metafor')),
                 jsonlite = as.character(packageVersion('jsonlite')))
for (i in seq_along(cfg)) {
  if ((i - 1) %% workers != worker) next
  f <- file.path(outdir, sprintf('%05d.json', i))
  if (file.exists(f)) next
  c <- cfg[[i]]; key <- get(c, 'key'); warnings <- character()
  out <- tryCatch(withCallingHandlers({
    y <- num(get(c, 'te')); v <- num(get(c, 'se'))^2; yrs <- num(get(c, 'year')); g0 <- chr(get(c, 'group'))
    if (all(is.na(g0))) {
      list(key = key, status = 'refused', reason = 'Page-policy refusal: no group column detected')
    } else {
      grp <- ifelse(is.na(g0), '(ungrouped)', g0)
      groups <- lapply(unique(grp), function(g) {
        ix <- which(grp == g); yy <- y[ix]; vv <- v[ix]; yr <- yrs[ix]
        by_year <- all(is.finite(yr))
        m <- fit(yy, vv, yr)
        cm <- if (by_year) cumul(m, order = yr) else cumul(m)
        ord <- if (by_year) order(yr, seq_along(ix)) else seq_along(ix)
        # Guard: cumul's own accrual order must equal the declared stable rule (ties keep row order).
        if (!identical(as.integer(get(cm, 'ids')), as.integer(ord))) stop('cumul order differs from the declared rule in group ', g)
        steps <- lapply(seq_along(ix), function(j) {
          mem <- ord[seq_len(j)]; mu <- get(cm, 'estimate')[j]; tau <- get(cm, 'tau2')[j]; se <- get(cm, 'se')[j]
          delta <- if (j >= 2) qt(.975, j - 1) * sqrt(tau + se^2) else NA_real_
          list(step = j, members = as.list(ix[mem]), label = as.character(ix[ord[j]]), year = yr[ord[j]], k = j,
               tau2 = tau, mu = mu, se = se, lo = get(cm, 'ci.lb')[j], hi = get(cm, 'ci.ub')[j],
               Q = sum((yy[mem] - mu)^2 / (vv[mem] + tau)), piLo = mu - delta, piHi = mu + delta)
        })
        list(name = g, k = length(ix), by_year = by_year, steps = steps)
      })
      list(key = key, status = 'ok', groups = groups)
    }
  }, warning = function(w) { warnings <<- c(warnings, conditionMessage(w)); invokeRestart('muffleWarning') }),
  error = function(e) list(key = key, status = 'error', reason = conditionMessage(e)))
  out[['warnings']] <- as.list(unique(warnings))
  out[['versions']] <- versions
  tmp <- paste0(f, '.tmp'); write_json17(out, tmp); file.rename(tmp, f)
  if (i %% 100 == 0) { cat(i, '/', length(cfg), key, get(out, 'status'), '\n'); flush.console() }
}
cat('WORKER_DONE', worker, '\n')
