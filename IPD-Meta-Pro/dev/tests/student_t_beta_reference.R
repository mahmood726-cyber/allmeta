# Reference values for student_t_beta.test.cjs (R 4.6.0, base stats + jsonlite).
#   Rscript --no-environ student_t_beta_reference.R      (from this folder; writes student_t_beta_reference.json)
# The page's fallback jStat.studentt.{cdf,inv} are MathUtils.tCDF / MathUtils.tQuantile, built on
# MathUtils.betaInc (the regularized incomplete beta I_x(a, b)); EnhancedPredictionInterval carries
# its own copy. Grid: small and fractional shape parameters, both sides of the continued-fraction
# switch x = (a + 1) / (a + b + 2), small df, the tails, and a df (e) whose half is not exact to 6 decimals
# (MathUtils.logGamma caches by z.toFixed(6), so it must not be used for the beta normalising constant).
suppressMessages(library(jsonlite))
stopifnot(getRversion() == "4.6.0")
out <- list(R = as.character(getRversion()))
g <- expand.grid(x = c(1e-8, 0.001, 0.05, 0.3, 0.5, 0.7, 0.95, 0.999, 1 - 1e-8),
                 a = c(0.5, 1, 2.5, 10, 50), b = c(0.5, 1, 3, 10, 50))
out$pbeta <- lapply(seq_len(nrow(g)), function(i) with(g[i, ], list(x = x, a = a, b = b, p = pbeta(x, a, b))))
gt <- expand.grid(t = c(-40, -6, -2.5, -1, -0.1, 0, 0.3, 1, 2, 2.5706, 4, 12, 40),
                  df = c(1, 2, 3, 4.5, 5, 7, 12, 30, 100, 1000, exp(1)))
out$pt <- lapply(seq_len(nrow(gt)), function(i) with(gt[i, ], list(t = t, df = df, p = pt(t, df))))
gq <- expand.grid(p = c(1e-10, 1e-6, 0.001, 0.005, 0.025, 0.05, 0.2, 0.5, 0.8, 0.95, 0.975, 0.995, 0.999, 1 - 1e-6),
                  df = c(1, 2, 3, 4, 4.5, 5, 7, 10, 12, 30, 100, 1000, exp(1)))
out$qt <- lapply(seq_len(nrow(gq)), function(i) with(gq[i, ], list(p = p, df = df, q = qt(p, df))))
gf <- expand.grid(f = c(0.01, 0.5, 1, 2.5, 4, 10, 100), df1 = c(1, 2, 5, 10), df2 = c(1, 3, 10, 50))
out$pf <- lapply(seq_len(nrow(gf)), function(i) with(gf[i, ], list(f = f, df1 = df1, df2 = df2, p = pf(f, df1, df2), pu = pf(f, df1, df2, lower.tail = FALSE))))
writeLines(toJSON(out, digits = NA, auto_unbox = TRUE, pretty = TRUE), "student_t_beta_reference.json")
cat("pbeta", length(out$pbeta), "pt", length(out$pt), "qt", length(out$qt), "pf", length(out$pf),
    "| qt(0.975,5) =", qt(0.975, 5), "pt(2,5) =", pt(2, 5), "\n")
