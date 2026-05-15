## bnma-oracle.R — authoritative reference for bayesian-nma (WLS + MVN
## posterior approx). Consistent fixture => DL tau2=0 => WLS point
## estimate == netmeta common==random. SUCRA (MVN-sampled) compared
## loosely to netrank P-score (both small.values orientations).
suppressPackageStartupMessages({library(netmeta); library(jsonlite)})
d <- read.csv("C:/Projects/allmeta/bayesian-nma/tests/fixtures/bnma-tiny.csv")
nm <- netmeta(TE=d$TE, seTE=d$seTE, treat1=d$treat1, treat2=d$treat2,
               studlab=d$studlab, sm="MD", common=TRUE, random=TRUE,
               reference.group="A")
teA <- setNames(nm$TE.common[, "A"], rownames(nm$TE.common))
seA <- setNames(nm$seTE.common[, "A"], rownames(nm$seTE.common))
pg  <- setNames(netrank(nm, small.values="desirable")$ranking.common, nm$trts)
pb  <- setNames(netrank(nm, small.values="undesirable")$ranking.common, nm$trts)
oracle <- list(
  trts = nm$trts,
  TE = as.list(round(teA, 8)), seTE = as.list(round(seA, 8)),
  tau2 = round(nm$tau^2, 10),
  pscore_desirable = as.list(round(pg, 6)),
  pscore_undesirable = as.list(round(pb, 6)))
writeLines(toJSON(oracle, auto_unbox=TRUE, digits=10),
  "C:/Projects/allmeta/bayesian-nma/tests/fixtures/bnma-oracle.json")
cat("wrote bnma-oracle.json; tau2=", nm$tau^2, "\n"); print(round(teA,6))
