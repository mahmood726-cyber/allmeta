# Reference values for quantiles.test.cjs (R 4.6.0, base stats + jsonlite).
#   Rscript --no-environ quantiles_reference.R      (from this folder; writes quantiles_reference.json)
# MathUtils.normQuantile and the fallback jStat.normal.inv are compared with qnorm, MathUtils.chi2Quantile
# and jStat.chisquare.inv with qchisq. (Stats.tQuantile is compared with qt on the grid of
# student_t_beta_reference.R.) Grid: both tails down to 1e-300, both sides of the AS 241 branch points
# |p - 0.5| = 0.425 and sqrt(-log(min(p, 1 - p))) = 5, p next to the median, non-unit mean / sd,
# chi-square df below 1, fractional, small integer (k - 1 of a small meta-analysis) and large df.
# digits = I(17): every p and every quantile round-trips exactly, so the page can be compared bit for bit.
suppressMessages(library(jsonlite))
stopifnot(getRversion() == "4.6.0")
out <- list(R = as.character(getRversion()))
pn <- c(1e-300, 1e-200, 1e-100, 1e-50, 1e-20, exp(-25) * c(0.999, 1, 1.001), 1e-10, 1e-6, 1e-4, 1e-3, 0.0125,
        0.025, 0.05, 0.0749, 0.075, 0.0751, 0.1, 0.16, 0.3, 0.5 - 1e-8, 0.5, 0.5 + 1e-8, 0.7, 0.84, 0.9, 0.9249, 0.925,
        0.9251, 0.95, 0.975, 0.99, 0.995, 0.999, 1 - 1e-4, 1 - 1e-6, 1 - 1e-10, 1 - 1e-15, 0, 1)
out$qnorm <- lapply(pn, function(p) list(p = p, q = qnorm(p)))
gm <- expand.grid(p = c(0.025, 0.5, 0.8, 0.975), mean = c(-3, 0.4), sd = c(0.25, 2))
out$qnorm_ms <- lapply(seq_len(nrow(gm)), function(i) with(gm[i, ], list(p = p, mean = mean, sd = sd, q = qnorm(p, mean, sd))))
pc <- c(1e-300, 1e-100, 1e-20, 1e-10, 1e-6, 0.001, 0.005, 0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95,
        0.975, 0.995, 0.999, 1 - 1e-6, 1 - 1e-10, 0, 1)
gc <- expand.grid(p = pc, df = c(0.1, 0.5, 1, 1.5, 2, 3, 4, 4.5, 5, 7, 9, 10, 19, 30, 50, 100, 1000, exp(1)))
out$qchisq <- lapply(seq_len(nrow(gc)), function(i) with(gc[i, ], list(p = p, df = df, q = qchisq(p, df))))
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE), "quantiles_reference.json")
cat("qnorm", length(out$qnorm), "qnorm_ms", length(out$qnorm_ms), "qchisq", length(out$qchisq),
    "| qnorm(0.975) =", format(qnorm(0.975), digits = 17), "qchisq(0.95, 1) =", format(qchisq(0.95, 1), digits = 17), "\n")
