# Page-produced values only; never read validate corpora or substitute reference output.
suppressPackageStartupMessages(library(metafor))
args <- commandArgs(trailingOnly=FALSE)
script <- sub('^--file=', '', args[grepl('^--file=', args)])
stopifnot(length(script) == 1L)
out <- file.path(dirname(normalizePath(script)), '..', 'rchecks-out', 'p0gosh_cum')
close_enough <- function(actual, expected) {
  is.numeric(actual) && length(actual) > 0L && all(is.finite(actual)) &&
    is.finite(expected) && all(abs(actual - expected) <= 1e-6)
}
load_csv <- function(name, columns) {
  d <- read.csv(file.path(out, name), check.names=FALSE, stringsAsFactors=FALSE,
                fileEncoding='UTF-8', na.strings='NA')
  stopifnot(identical(names(d), columns), nrow(d) == 3L,
            all(is.finite(d$yi)), all(is.finite(d$sei)), all(d$sei > 0))
  d
}
for (id in c('heterogeneous','unequal','identical')) {
  for (model in c('FE','DL')) {
    d <- load_csv(paste0('gosh-',id,'-',model,'.csv'), c('yi','sei','full_i2','full_label','median_label'))
    fit <- rma(yi=d$yi, sei=d$sei, method='FE')
    stopifnot(close_enough(d$full_i2, fit$I2),
      all(d$full_label == 'Full-data I²'),
      all(d$median_label == 'median I² across subsets (not the full-data I²)'))
  }
  d <- load_csv(paste0('cum-',id,'.csv'), c('yi','sei','q_fe','q_re','q_definition'))
  fe <- rma(yi=d$yi, sei=d$sei, method='FE')
  pm <- rma(yi=d$yi, sei=d$sei, method='PM', control=list(threshold=1e-12, tol=1e-12, maxiter=1000))
  w <- 1 / (d$sei^2 + pm$tau2)
  residual_q <- sum(w * (d$yi - as.numeric(coef(pm)))^2)
  stopifnot(close_enough(d$q_fe, fe$QE), close_enough(d$q_re, residual_q),
    all(d$q_definition == "Q_final: residual Q under random-effects (PM) weights, not Cochran's Q."))
  if (id == 'heterogeneous') {
    # Planted wrong row: claim the page's RE-weighted residual is Cochran's Q.
    planted <- d[1, , drop=FALSE]
    planted$q_fe <- planted$q_re
    detected <- !close_enough(planted$q_fe, fe$QE)
    stopifnot(detected)
  }
}
order <- read.csv(file.path(out, 'ordering.csv'), check.names=FALSE, stringsAsFactors=FALSE,
                  fileEncoding='UTF-8', na.strings='NA', colClasses='character')
stopifnot(nrow(order) == 1L,
  identical(names(order), c('missing_note','input_order','complete_note','complete_order','subgroup_note')),
  identical(order$missing_note, 'Missing year for: Missing <year>. Cumulative analysis uses input order for all studies. Add a year for every study to order chronologically.'),
  identical(order$input_order, 'Late|Missing <year>|Early'),
  identical(order$complete_order, 'Early|Missing <year>|Late'),
  identical(order$complete_note, ''), identical(order$subgroup_note, ''), detected)
cat('PLANT_DETECTED\n')
cat('R_CHECK_PASS\n')
