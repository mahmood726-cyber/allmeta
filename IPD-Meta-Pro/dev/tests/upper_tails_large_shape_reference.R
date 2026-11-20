# Reference values for the large-shape group of upper_tails.test.cjs (R 4.6.0, base stats + jsonlite).
#   Rscript --no-environ upper_tails_large_shape_reference.R   (from this folder; writes upper_tails_large_shape_reference.json)
# pchisq(x, df, lower.tail = FALSE) and pgamma(x, a, lower.tail = FALSE) with df / shape 2e3 .. 2e8 at
# x = mean + c sd (c = -6 .. 6): here the gamma series / continued fraction needs O(sqrt(shape)) terms,
# beyond the old fixed 2000 (pchisq(1e8, 1e8) = 0.8886 on the page, R 0.49998).
suppressMessages(library(jsonlite))
stopifnot(getRversion() == "4.6.0")
out <- list(R = as.character(getRversion()), pchisq = list(), pgamma = list())
for (df in c(2e3, 2e4, 2e5, 2e6, 2e7, 1e8, 2e8)) for (c in c(-6, -2, -0.5, 0, 0.5, 2, 6)) {
  x <- df + c * sqrt(2 * df)
  out$pchisq[[length(out$pchisq) + 1]] <- list(x = x, df = df, p = pchisq(x, df, lower.tail = FALSE))
}
for (a in c(1e3, 1e5, 5e7)) for (c in c(-3, 0, 3)) {
  x <- a + c * sqrt(a)
  out$pgamma[[length(out$pgamma) + 1]] <- list(x = x, shape = a, p = pgamma(x, a, lower.tail = FALSE))
}
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE), "upper_tails_large_shape_reference.json")
cat("pchisq", length(out$pchisq), "pgamma", length(out$pgamma), "| pchisq(1e8, 1e8, lower = FALSE) =", format(pchisq(1e8, 1e8, lower.tail = FALSE), digits = 17), "\n")
