# Reference values for tests/test_variance_floor.py: netmeta on tests/nma-tiny.csv with every SE multiplied by 1 and by
# 0.01 (variances 3e-6 to 6e-6, below the page's old 1e-4 VARIANCE_FLOOR), REML and DL, random effects, reference A:
# tau2, Q, TE.random / seTE.random vs A, and P-scores (netrank, small.values = "desirable").
# Regenerate from nma-pro-v2/tests (R 4.6.0, netmeta 3.7.0):
#   Rscript --no-environ floor_reference.R floor_r460.json
suppressPackageStartupMessages({library(netmeta); library(jsonlite)})
a <- commandArgs(trailingOnly = TRUE)
d <- read.csv("nma-tiny.csv")
out <- list(cases = list())
for (sc in c(1, 0.01)) for (m in c("REML", "DL")) {
  r <- netmeta(TE = d$yi, seTE = d$sei * sc, treat1 = d$treat1, treat2 = d$treat2, studlab = d$study, sm = "MD",
               random = TRUE, common = TRUE, method.tau = m, reference.group = "A")
  tr <- c("B", "C", "D")
  out$cases[[sprintf("s%s_%s", sc, m)]] <- list(tau2 = r$tau2, Q = r$Q,
    TE = as.list(setNames(r$TE.random[tr, "A"], tr)), seTE = as.list(setNames(r$seTE.random[tr, "A"], tr)),
    pscores = as.list(netrank(r, small.values = "desirable")$ranking.random))
}
out$R <- R.version.string; out$netmeta <- as.character(packageVersion("netmeta"))
writeLines(toJSON(out, auto_unbox = TRUE, digits = I(17)), a[1])
