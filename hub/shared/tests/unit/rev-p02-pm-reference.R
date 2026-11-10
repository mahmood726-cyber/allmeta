# Rscript hub/shared/tests/unit/rev-p02-pm-reference.R
# Emit a reference fixture to stdout; the task runner captures output outside wt.
# The one-non-reference-dose study slope and variance have exact GLS forms.
suppressPackageStartupMessages(library(metafor))
options(digits = 17)
num <- function(x) sprintf('%.17g', as.numeric(x))
vec <- function(x) paste0('[', paste(num(x), collapse = ','), ']')
record <- function(id, yi, vi, dose_scale) {
  fit <- rma(yi = yi, vi = vi, method = 'PM')
  w <- 1 / (vi + fit$tau2)
  mu <- sum(w * yi) / sum(w)
  q <- sum(w * (yi - mu)^2)
  paste0('{"id":"', id, '","doseScale":', num(dose_scale),
    ',"yi":', vec(yi), ',"vi":', vec(vi), ',"tau2":', num(fit$tau2),
    ',"mu":', num(coef(fit)), ',"se":', num(fit$se),
    ',"predictionSE":', num(dose_scale * fit$se), ',"generalisedQ":', num(q), '}')
}
cases <- vapply(c(1, 1e-5), function(scale) {
  record(paste0('dose-', format(scale, scientific = TRUE)),
    c(-1, 0, 1) / scale, rep((0.1 / scale)^2, 3), scale)
}, character(1))
cases <- c(cases, record('unequal-variance',
  c(.10, .30, .50, .20, .90, .40, 1.10, .05),
  c(.20, .25, .18, .30, .22, .28, .35, .15)^2, 1))
cat('{"generator":"rev-p02-pm-reference.R","R":"', R.version.string,
  '","metafor":"', as.character(packageVersion('metafor')),
  '","method":"rma(yi, vi, method = PM); default controls","cases":[',
  paste(cases, collapse = ','), ']}\n', sep = '')
