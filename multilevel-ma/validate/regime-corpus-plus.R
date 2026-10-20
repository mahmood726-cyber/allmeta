# Few-cluster regime corpus for the extras (#alm-plus).
#
# Run from multilevel-ma/. Writes validate/plus-corpus/regime-corpus-plus.json.
#
# The 44 metadat configurations in corpus-plus.json have a minimum of four clusters, so the
# two- and three-cluster regime - where CR2 has one or two degrees of freedom and where
# metafor's confint.rma.mv search bound actually bites - was not covered by the pinned corpus.
# These configurations are the synthetic few-cluster designs used by the independent review of
# PR #151 (its scratch/synth.R, seed 20261019, R 4.6.0 Mersenne-Twister): group B, twenty
# designs with two or three clusters, plus the last group F design, a 21-row six-cluster design
# generated with both variance components truly zero that metafor's default nlminb optimiser
# refuses to fit. The whole stream is replayed so the selected draws are the reviewer's own.
#
# Two deliberate differences from the review's scratch corpus. Each sampling variance is stored
# as the exact square of its double standard error (v <- sqrt(v)^2): the browser replay types
# standard errors into the page and the parser squares them again, so storing v this way makes
# the browser and the Node check read bit-identical variances instead of values that differ by
# one double rounding. And the file is written with digits = 22, which round-trips every double
# exactly; jsonlite's digits = NA keeps only 15 significant digits (about 5e-15 relative), which
# would defeat the exact square.
suppressMessages(library(jsonlite))
print(.libPaths())
cat('R:', R.version.string, '\n')
cat('jsonlite', as.character(packageVersion('jsonlite')), '\n')
stopifnot(RNGkind()[1] == 'Mersenne-Twister', RNGkind()[3] == 'Rejection')

set.seed(20261019)
configs <- list()
add <- function(name, y, v, cl) {
  stopifnot(length(y) == length(v), length(y) == length(cl))
  stopifnot(all(is.finite(y)), all(is.finite(v)), all(v > 0))
  nc <- length(unique(cl))
  if (length(y) < 3 || nc < 2 || nc == length(y)) return(invisible(NULL))
  configs[[name]] <<- list(y = as.numeric(y), v = as.numeric(v), cluster = as.character(cl))
  invisible(NULL)
}
gen <- function(sizes, tb, tw, vlo, vhi, mu = 0) {
  nc <- length(sizes); n <- sum(sizes)
  cl <- rep(paste0('c', seq_len(nc)), times = sizes)
  u <- rnorm(nc, 0, tb)[rep(seq_len(nc), times = sizes)]
  e <- rnorm(n, 0, tw)
  v <- exp(runif(n, log(vlo), log(vhi)))
  y <- mu + u + e + rnorm(n, 0, sqrt(v))
  list(y = y, v = v, cl = cl)
}
i <- 0
nxt <- function(tag) { i <<- i + 1; sprintf('rv%03d_%s', i, tag) }

## Group A (30): ordinary three-level designs, both components > 0
for (r in 1:30) {
  nc <- sample(3:12, 1); sizes <- sample(2:5, nc, replace = TRUE)
  g <- gen(sizes, tb = runif(1, .1, .8), tw = runif(1, .05, .5), vlo = .005, vhi = .3)
  add(nxt('A'), g$y, g$v, g$cl)
}
## Group B (20): FEW clusters (2 or 3) - the small-cluster CR2/Satterthwaite regime
for (r in 1:20) {
  nc <- sample(2:3, 1); sizes <- sample(2:6, nc, replace = TRUE)
  g <- gen(sizes, tb = runif(1, .05, .9), tw = runif(1, .05, .6), vlo = .01, vhi = .4)
  add(nxt('Bfew'), g$y, g$v, g$cl)
}
## Group C (20): SINGLETON clusters mixed with repeated ones
for (r in 1:20) {
  nrep <- sample(2:5, 1); nsing <- sample(1:6, 1)
  sizes <- c(sample(2:4, nrep, replace = TRUE), rep(1, nsing))
  g <- gen(sizes, tb = runif(1, .1, .7), tw = runif(1, .05, .5), vlo = .01, vhi = .3)
  add(nxt('Csingle'), g$y, g$v, g$cl)
}
## Group D (15): true BETWEEN component = 0
for (r in 1:15) {
  nc <- sample(3:10, 1); sizes <- sample(2:4, nc, replace = TRUE)
  g <- gen(sizes, tb = 0, tw = runif(1, .1, .6), vlo = .01, vhi = .3)
  add(nxt('Dzb'), g$y, g$v, g$cl)
}
## Group E (15): true WITHIN component = 0
for (r in 1:15) {
  nc <- sample(3:10, 1); sizes <- sample(2:4, nc, replace = TRUE)
  g <- gen(sizes, tb = runif(1, .2, .8), tw = 0, vlo = .01, vhi = .3)
  add(nxt('Ezw'), g$y, g$v, g$cl)
}
## Group F (12): BOTH components 0 - pure sampling variation, both at the boundary
for (r in 1:12) {
  nc <- sample(3:9, 1); sizes <- sample(2:4, nc, replace = TRUE)
  g <- gen(sizes, tb = 0, tw = 0, vlo = .02, vhi = .5)
  add(nxt('Fzz'), g$y, g$v, g$cl)
}
cat('generated:', length(configs), 'configurations\n')

used <- c(sprintf('rv%03d_Bfew', 31:50), 'rv112_Fzz')
stopifnot(all(used %in% names(configs)))
out <- lapply(configs[used], function(c) {
  se <- sqrt(c$v)
  rows <- lapply(seq_along(c$y), function(k) list(cluster = c$cluster[k], id = k,
    y = c$y[k], v = se[k]^2))
  rows
})
names(out) <- used
sizes <- vapply(out, length, 0L)
clusters <- vapply(configs[used], function(c) length(unique(c$cluster)), 0L)
cat('selected:', length(out), ' rows', min(sizes), '-', max(sizes),
    ' clusters', min(clusters), '-', max(clusters), '\n')
dir.create('validate/plus-corpus', showWarnings = FALSE)
text <- toJSON(out, auto_unbox = TRUE, digits = 22, null = 'null', na = 'null', pretty = FALSE)
stopifnot(identical(fromJSON(text, simplifyVector = FALSE)[[used[1]]][[1]]$v, out[[used[1]]][[1]]$v))
con <- file('validate/plus-corpus/regime-corpus-plus.json', 'wb')
writeBin(charToRaw(paste0(text, '\n')), con); close(con)
cat('wrote validate/plus-corpus/regime-corpus-plus.json\n')
