# Declared conditional rule: R closed forms evaluated at the page's own tau2 for the listed pools only.
# Input : adjudication_input.json = the pools whose STRICT comparison fails on the page engine (all residual Q at
#         ~1e-8 relative; page tau2 agrees with R's PM tau2 to ~1e-13), with the page tau2 as exact hex.
# Usage : Rscript adjudicate.R <corpus.json> <adjudication_input.json> <adjudicated.json>
if (dir.exists('C:/p121314/Rlib')) .libPaths(c('C:/p121314/Rlib', .libPaths()))
stopifnot(as.character(packageVersion('metafor')) == '5.2.1')
suppressPackageStartupMessages({ library(metafor); library(jsonlite) })
args <- commandArgs(TRUE)
src <- dirname(normalizePath(sub('^--file=', '', grep('^--file=', commandArgs(FALSE), value = TRUE)[1])))
source(file.path(src, 'json17.R'))
cfg <- fromJSON(args[1], simplifyVector = FALSE); keys <- vapply(cfg, function(c) c$key, '')
inp <- fromJSON(args[2], simplifyVector = FALSE)
num <- function(x) vapply(x, function(z) if (is.null(z)) NA_real_ else as.numeric(z), 0.0)
out <- lapply(inp, function(a) {
  c <- cfg[[match(a$key, keys)]]; mem <- as.integer(unlist(a$members))
  y <- num(c$te)[mem]; v <- num(c$se)[mem]^2; t <- as.numeric(a$tau2_app_hex)
  stopifnot(identical(sprintf('%a', t), sprintf('%a', as.numeric(a$tau2_app_hex))), is.finite(t))
  m <- rma(yi = y, vi = v, tau2 = t, test = 'z')                      # closed forms at the fixed tau2
  pm <- rma(yi = y, vi = v, method = 'PM', test = 'z', control = list(threshold = 1e-12, maxiter = 1000,
            tau2.max = max(1, var(y) * 100), tol = .Machine$double.eps^0.75))
  mu <- as.numeric(m$b); se <- m$se; k <- length(y); d <- if (k >= 2) qt(.975, k - 1) * sqrt(t + se^2) else NA_real_
  list(key = a$key, group = a$group, step = a$step, members = as.list(mem), tau2_app = t, tau2_app_hex = a$tau2_app_hex,
       tau2_R_PM = pm$tau2, Q_strict = sum((y - as.numeric(pm$b))^2 / (v + pm$tau2)),
       conditional = list(mu = mu, se = se, lo = m$ci.lb, hi = m$ci.ub, Q = sum((y - mu)^2 / (v + t)), piLo = mu - d, piHi = mu + d),
       versions = list(R = as.character(getRversion()), metafor = as.character(packageVersion('metafor'))))
})
write_json17(out, args[3])
cat('ADJUDICATED', length(out), '\n')
