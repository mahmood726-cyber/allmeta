# Independent oracle for the CI-267 header-convention diagnosis.
# Run from the tree root: Rscript hub/shared/tests/unit/fixtures/nma-header-convention.R
# JSON is emitted to stdout; retain it as nma-header-convention.json after a real run.
# No validation corpus or existing reference is regenerated.
suppressPackageStartupMessages({ library(netmeta); library(jsonlite) })

page <- readLines('nma/index.html', encoding = 'UTF-8', warn = FALSE)
start <- grep('const EXAMPLE = \\[', page)
stopifnot(length(start) == 1L)
finish <- start + which(grepl('].join', page[(start + 1L):length(page)], fixed = TRUE))[1L]
rows <- trimws(page[(start + 1L):(finish - 1L)])
rows <- vapply(sub(',$', '', rows), fromJSON, '')
native <- read.csv(text = paste(rows, collapse = '\n'), header = FALSE,
                   comment.char = '#', strip.white = TRUE,
                   col.names = c('study', 'treat1', 'treat2', 'est', 'se'))

fit <- function(te) {
  f <- netmeta(TE = te, seTE = native$se, treat1 = native$treat1,
               treat2 = native$treat2, studlab = native$study, sm = 'OR',
               common = TRUE, random = TRUE, method.tau = 'DL',
               method.random.ci = 'classic', reference.group = 'DrugA')
  treatments <- setdiff(f$trts, 'DrugA')
  lapply(treatments, function(t) list(treatment = t,
    estimate = unname(f$TE.common[t, 'DrugA']),
    se = unname(f$seTE.common[t, 'DrugA']),
    lower = unname(f$lower.common[t, 'DrugA']),
    upper = unname(f$upper.common[t, 'DrugA']),
    p = unname(f$pval.common[t, 'DrugA']),
    display = sprintf('%s | %.3f (%.3f to %.3f) | %.4f', t,
      f$TE.common[t, 'DrugA'], f$lower.common[t, 'DrugA'],
      f$upper.common[t, 'DrugA'], f$pval.common[t, 'DrugA'])))
}

result <- list(generator = 'nma-header-convention.R',
  R = R.version.string,
  packages = lapply(c('netmeta', 'meta', 'jsonlite'), function(p)
    list(name = p, version = as.character(packageVersion(p)))),
  native_rows = native,
  native_as_netmeta = fit(-native$est),
  unchanged_rows_under_netmeta_header = fit(native$est))
cat('BEGIN_NMA_HEADER_REFERENCE\n')
cat(toJSON(result, auto_unbox = TRUE, digits = 17, pretty = TRUE))
cat('\nEND_NMA_HEADER_REFERENCE\n')
