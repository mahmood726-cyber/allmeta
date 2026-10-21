# Generates as-character.json: R's as.character(<double>) and the factor
# partition it induces, for numeric cluster IDs in the regimes where a
# 15-significant-digit rule and R disagree (review of PR #210, round 2, N1).
# Rscript rve-meta/tests/fixtures/p15/as-character.R  (R 4.6.0, robumeta 2.1,
# clubSandwich 0.7.0, Windows x64, LC_COLLATE=C)
#
# Each vector records, per value, as.character(x) and as.integer(as.factor(x)),
# plus levels(as.factor(x)) and nlevels(). Values are written with %.17g, which
# round-trips every finite double (and keeps the sign of -0).
# The fits are robumeta CORR, intercept only, with 16-digit numeric study IDs:
# six and four that R keeps as distinct levels, and seven of which two share one.
suppressMessages({library(robumeta); library(clubSandwich)})
invisible(Sys.setlocale('LC_COLLATE', 'C'))
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[[1]] else 'as-character.json'
num <- function(a) if (is.finite(a)) sprintf('%.17g', a) else 'null'
str <- function(s) encodeString(s, quote = '"')
arr <- function(z) paste0('[', paste(z, collapse = ','), ']')
obj <- function(...) {
  v <- list(...)
  paste0('{', paste0(vapply(names(v), str, ''), ':', unlist(v), collapse = ','), '}')
}
# The double k units in the last place away from x (k may be negative), by
# stepping the IEEE-754 bit pattern; x is positive and finite.
ulps <- function(x, k) {
  b <- as.integer(writeBin(x, raw(), size = 8, endian = 'little'))
  lo <- sum(b[1:4] * 256^(0:3)) + k; hi <- sum(b[5:8] * 256^(0:3))
  hi <- hi + floor(lo / 2^32); lo <- lo %% 2^32
  bytes <- c(lo %/% 256^(0:3) %% 256, hi %/% 256^(0:3) %% 256)
  readBin(as.raw(bytes), 'double', size = 8, endian = 'little')
}
vec <- function(name, x) {
  f <- as.factor(x)
  obj(name = str(name), values = arr(vapply(x, num, '')),
      as_character = arr(vapply(as.character(x), str, '')),
      codes = arr(as.integer(f)), levels = arr(vapply(levels(f), str, '')),
      nlevels = nlevels(f))
}
vectors <- character()
add <- function(name, x) vectors[[length(vectors) + 1]] <<- vec(name, x)
for (p in 12:17) add(sprintf('10^%d + 0..99', p), 10^p + 0:99)
add('-(10^15 + 0..99)', -(10^15 + 0:99))
add('10^15 + 0..99 + 0.5', 10^15 + 0:99 + 0.5)
set.seed(20261021)
for (b in c(1e-9, 1e-3, 1, 1e3, 1e9)) {
  add(sprintf('ULP neighbours (-3..3) of %g', b), vapply(-3:3, function(k) ulps(b, k), 0))
  # Random 15-17 significant-digit bases at this magnitude and their +-3 ULPs.
  for (i in 1:40) {
    base <- signif(b * runif(1, 1, 10), sample(15:17, 1))
    add(sprintf('ULP neighbours of %s', sprintf('%.17g', base)),
        vapply(-3:3, function(k) ulps(base, k), 0))
  }
}
# snprintf ties: t / 2^j has exactly 16 significant digits, so the 16th digit
# is an exact 5 ("%.0f" for j = 1 above 1e14, "%.Nf" and "%e" otherwise).
for (j in 0:22) {
  lo <- ceiling(1e15 / 5^j); hi <- min(floor((1e16 - 1) / 5^j), 2^53 - 1)
  if (lo > hi) next
  t <- unique(c(lo, hi, round(runif(12, lo, hi))))
  t <- t[t %% 2 == 1]
  if (length(t)) add(sprintf('16-digit ties t / 2^%d', j), c(t, -t) / 2^j)
}
# Long-double scaling by powl (|kp| > 27) and by the inexact 1e23..1e27 table entries.
for (p in c(-300, -200, -100, -40, -20, -14, -10, 20, 24, 30, 36, 42, 50, 100, 200, 300))
  add(sprintf('random 15-17 digit values near 1e%d', p),
      vapply(1:20, function(i) signif(runif(1, 1, 10), sample(15:17, 1)) * 10^p, 0))
add('0 and -0', c(0, -0))
add('1e5 vs 100000.0000000001', c(1e5, 100000.0000000001))
add('0.3 vs 0.1+0.2', c(0.3, 0.1 + 0.2))
add('990.318601019681 vs 990.31860101968', c(990.318601019681, 990.31860101968))
ids6 <- c(1000000000000006, 1000000000000008, 1000000000000026,
          1000000000000028, 1000000000000046, 1000000000000048)
add('review N1 six IDs', ids6)
add('miscellaneous', c(1/3, 2/3, 0.1, 100, 1e15, 1e-5, 1e-4, 123456.7, 0.5, 1.5, 2.5,
                       123456789012345678, 9999999999999998, 999999999999999.9,
                       99999.99999999999, 1e21, 1e22, 1e100, 1e300, 1e-300, 5e-324,
                       .Machine$double.xmax, .Machine$double.xmin, -1/3, -1e-20, -123.456,
                       10000, -10000, 0.0001234, -0.0001234, -1e5, 1e-99, 1e-100, 1e99,
                       1e15 + 0.5, 1e15 + 1.5, 4503599627370497, 2^53, 2^53 + 2, 2^60))

reference <- function(d, rho) {
  rr <- robu(yi ~ 1, data = d, studynum = cl, var.eff.size = vi,
             modelweights = 'CORR', rho = rho, small = TRUE)
  ord <- order(as.factor(d$cl))
  stopifnot(identical(rr$data.full$effect.size, d$yi[ord]))
  w <- numeric(nrow(d)); w[ord] <- rr$data.full$r.weights
  tab <- rr$reg_table
  cb <- as.data.frame(coef_test(rr, vcov = 'CR2', test = 'Satterthwaite'))
  tbl <- vapply(c('b.r', 'SE', 't', 'dfs', 'prob', 'CI.L', 'CI.U'),
                function(k) num(as.numeric(tab[1, k])), '')
  obj(table = arr(paste0('{', paste0(vapply(names(tbl), str, ''), ':', tbl, collapse = ','), '}')),
      tau2 = num(as.numeric(rr$mod_info$tau.sq)),
      club = obj(beta = arr(num(cb$beta)), SE = arr(num(cb$SE)), tstat = arr(num(cb$tstat)),
                 df_Satt = arr(num(cb$df_Satt)), p_Satt = arr(num(cb$p_Satt))),
      weights = arr(vapply(w, num, '')), m = rr$N,
      levels = arr(vapply(levels(as.factor(d$cl)), str, '')))
}
fit <- function(name, ids, rho) {
  set.seed(7)
  cl <- rep(ids, each = 2)[sample(2 * length(ids))]
  d <- data.frame(cl = cl, yi = round(rnorm(length(cl), 0.3, 0.3), 3),
                  vi = round(runif(length(cl), 0.01, 0.1), 4))
  rows <- vapply(seq_len(nrow(d)), function(i)
    obj(cluster = num(d$cl[i]), yi = num(d$yi[i]), vi = num(d$vi[i]), X = '[1]'), '')
  obj(name = str(name), rho = num(rho), rows = arr(rows), R = reference(d, rho))
}
fits <- c(fit('review N1 six IDs, 12 rows', ids6, 0.8),
          fit('four 16-digit IDs, 8 rows', ids6[1:4], 0.8),
          fit('1e15 + 4 and 1e15 + 5 share the level 1e+15, 14 rows',
              1e15 + c(4, 5, 6, 8, 26, 28, 46), 0.8))

info <- obj(R = str(R.version.string), robumeta = str(as.character(packageVersion('robumeta'))),
            clubSandwich = str(as.character(packageVersion('clubSandwich'))),
            platform = str(R.version$platform), LC_COLLATE = str(Sys.getlocale('LC_COLLATE')))
writeLines(obj(generated_by = str('rve-meta/tests/fixtures/p15/as-character.R'), session = info,
               vectors = arr(vectors), fits = arr(fits)), out, useBytes = TRUE)
cat('wrote', out, length(vectors), 'vectors', sum(lengths(regmatches(vectors, gregexpr('"codes"', vectors)))), '\n')
