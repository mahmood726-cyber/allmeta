# Reference for pcurve_binomial.test.cjs: the p-curve right-skew test is P(X >= nLow), X ~ Binomial(nSig, 0.5),
# i.e. 1 - pbinom(nLow - 1, nSig, 0.5); plus the full right-skew p of one study set.
#   Rscript --no-environ dev/tests/pcurve_binomial_reference.R
suppressPackageStartupMessages(library(jsonlite))
grid <- expand.grid(x = 0:40, n = c(3, 4, 5, 7, 10, 15, 25, 40)); grid <- grid[grid$x <= grid$n, ]
grid$upper <- 1 - pbinom(grid$x - 1, grid$n, 0.5)
yi <- c(0.80, 0.62, 0.45, 0.51, 0.30, 0.95, 0.12, 0.70); vi <- c(0.04, 0.05, 0.03, 0.06, 0.02, 0.09, 0.05, 0.08)
p <- 2 * pnorm(-abs(yi / sqrt(vi))); sig <- p[p < 0.05]
out <- list(grid = grid, studies = data.frame(yi = yi, vi = vi), nSig = length(sig), nLow = sum(sig < 0.025),
            rightSkewP = 1 - pbinom(sum(sig < 0.025) - 1, length(sig), 0.5), R = R.version.string)
args <- commandArgs(trailingOnly = FALSE); me <- sub("^--file=", "", args[grep("^--file=", args)])
writeLines(toJSON(out, digits = NA, auto_unbox = TRUE, dataframe = "rows"), file.path(dirname(me), "pcurve_binomial_reference.json"))
cat("nSig", out$nSig, "nLow", out$nLow, "rightSkewP", out$rightSkewP, "\n")
