# Run from wt/: Rscript hub/shared/tests/fixtures/p18-extreme-z-reference.R
# Emits the fixture to stdout; preserve the JSON between the markers verbatim.
# No validation corpus, test log, or cache is written into the source tree.
suppressPackageStartupMessages(library(metafor))

# Only base R is needed to serialize this finite, ASCII-only reference fixture.
# Seventeen significant digits preserve each double on the JSON round trip.
json <- function(x) {
  if (is.null(x)) return('null')
  if (is.list(x)) {
    values <- vapply(x, json, character(1))
    if (is.null(names(x))) return(paste0('[', paste(values, collapse = ','), ']'))
    keys <- vapply(names(x), function(k) encodeString(k, quote = '"'), character(1))
    return(paste0('{', paste(paste0(keys, ':', values), collapse = ','), '}'))
  }
  if (length(x) != 1L) return(json(as.list(x)))
  if (is.character(x)) return(encodeString(x, quote = '"'))
  if (is.logical(x)) return(if (x) 'true' else 'false')
  stopifnot(is.numeric(x), is.finite(x))
  sprintf('%.17g', x)
}

z <- c(0, 0.1, -0.1, 0.5, -0.5, 1, -1, 1.96, -1.96, 3, -3, 5, -5,
       8, -8, 10, -10, 20, -20, 37, -37, 40, -40, 1e154, -1e154,
       sqrt(.Machine$double.xmax), -sqrt(.Machine$double.xmax),
       1e155, -1e155, .Machine$double.xmax, -.Machine$double.xmax)
tails <- lapply(z, function(x) list(mu = x, se = 1, z = x, p = 2 * pnorm(-abs(x))))
for (mu in c(1e154, -1e154)) {
  zz <- mu / 0.1
  tails[[length(tails) + 1L]] <- list(mu = mu, se = 0.1, z = zz, p = 2 * pnorm(-abs(zz)))
}
chi_square <- lapply(c(0, 1, 40^2, 1e154^2, sqrt(.Machine$double.xmax)^2), function(x) {
  list(x = x, df = 1, p = pchisq(x, df = 1, lower.tail = FALSE))
})

# Independent ordinary-scale control from the package's Berkey dataset.
data('dat.berkey1998', package = 'metadat')
dat <- dat.berkey1998
dat$outcome <- factor(dat$outcome, levels = c('AL', 'PD'))
V <- bldiag(lapply(split(dat, dat$trial), function(d) as.matrix(d[, c('v1i', 'v2i')])))
controls <- list(rel.tol = 1e-10, x.tol = 1e-10, iter.max = 10000, eval.max = 20000)
fit <- rma.mv(yi, V, mods = ~ outcome - 1, random = ~ outcome | trial,
              struct = 'UN', method = 'REML', test = 'z', data = dat, control = controls)
studies <- lapply(split(seq_len(nrow(dat)), dat$trial), function(ii) {
  jj <- ii[order(dat$outcome[ii])]
  list(y = as.numeric(dat$yi[jj]), S = lapply(seq_along(jj), function(j) as.numeric(V[jj[j], jj])))
})
fixture <- list(
  schema = 'p18-extreme-z-reference-v1',
  provenance = list(R = R.version.string,
    packages = setNames(lapply(c('stats', 'metafor', 'metadat'), function(p) as.character(packageVersion(p))),
                        c('stats', 'metafor', 'metadat')),
    tail = '2 * stats::pnorm(-abs(mu / se))',
    chi_square = 'stats::pchisq(x, df = 1, lower.tail = FALSE)',
    berkey = 'metafor::rma.mv, REML, UN, test=z, outcome order AL/PD', controls = controls),
  tails = tails,
  chi_square = chi_square,
  berkey = list(studies = unname(studies), mu = as.numeric(coef(fit)), se = as.numeric(fit$se),
                z = as.numeric(fit$zval), p = as.numeric(fit$pval), logLik = as.numeric(logLik(fit))))
cat('P18_REFERENCE_JSON_BEGIN\n')
cat(json(fixture))
cat('\nP18_REFERENCE_JSON_END\n')
