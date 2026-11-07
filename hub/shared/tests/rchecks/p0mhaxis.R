# Run from any cwd. Only base R and metafor; inputs and outputs come from the page.
args <- commandArgs(trailingOnly = FALSE)
script <- sub('^--file=', '', args[grep('^--file=', args)][1])
out <- file.path(dirname(normalizePath(script)), '..', 'rchecks-out', 'p0mhaxis')
suppressPackageStartupMessages(library(metafor))
near <- function(a, b) length(a) == length(b) && all(is.finite(a)) &&
  all(is.finite(b)) && all(abs(a - b) <= 1e-6)
position <- function(row, value) {
  tx <- if (row$measure == 'RD') identity else log
  lo <- tx(row$xmin); hi <- tx(row$xmax)
  pad <- (hi - lo) * 0.1
  row$left + (tx(value) - (lo - pad)) / (hi - lo + 2 * pad) * (row$right - row$left)
}
geometry_ok <- function(row, values) {
  near(c(row$x_est, row$x_lo, row$x_hi), position(row, values)) &&
    near(row$ref_x, position(row, if (row$measure == 'RD') 0 else 1))
}
for (measure in c('OR', 'RR', 'RD')) {
  dat <- read.csv(file.path(out, paste0(measure, '-input.csv')))
  rows <- read.csv(file.path(out, paste0(measure, '.csv')))
  methods <- if (measure == 'OR') c('mh', 'peto') else 'mh'
  stopifnot(nrow(dat) == 3, identical(as.character(rows$method), methods),
            all(rows$measure == measure))
  for (i in seq_len(nrow(rows))) {
    row <- rows[i, ]
    fit <- if (row$method == 'mh') {
      rma.mh(ai = ai, bi = n1i - ai, ci = ci, di = n2i - ci, data = dat,
        measure = measure, add = c(0.5, 0), to = c('only0', 'none'),
        drop00 = c(FALSE, FALSE), correct = FALSE)
    } else {
      rma.peto(ai = ai, bi = n1i - ai, ci = ci, di = n2i - ci, data = dat,
        add = 0, to = 'none', drop00 = TRUE)
    }
    values <- c(as.numeric(fit$b), fit$ci.lb, fit$ci.ub)
    if (measure != 'RD') values <- exp(values)
    label <- switch(measure, OR = 'Odds ratio (log scale)',
                    RR = 'Risk ratio (log scale)', RD = 'Risk difference')
    stopifnot(near(c(row$est, row$lo, row$hi), values), geometry_ok(row, values),
      identical(row$label, paste0(label, '; dashed line: no difference')),
      row$log_checked == as.integer(measure != 'RD'),
      row$xmin == if (measure == 'RD') -1 else 0.1,
      row$xmax == if (measure == 'RD') 1 else 10,
      row$left == 130, row$right == 570)
    if (measure == 'OR' && row$method == 'mh') {
      control <- row
      control_values <- values
    }
  }
}
plant <- read.csv(file.path(out, 'planted-linear.csv'))
stopifnot(nrow(plant) == 1, plant$measure == 'OR', plant$method == 'mh')
# Same geometry comparator accepts the real row and must reject the planted linear CI end.
stopifnot(geometry_ok(control, control_values), !geometry_ok(plant, control_values))
cat('PLANT_DETECTED\n')
cat('R_CHECK_PASS\n')
