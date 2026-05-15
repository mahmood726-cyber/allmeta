## nma-oracle.R — authoritative reference for the nma app.
## Consistent fixture => DL tau2=0 => common==random, so the app's FE and
## (simplified contrast-DL) RE both collapse to netmeta — clean parity with
## no tau2-convention ambiguity. Target = netmeta(); P-score (both
## small.values orientations) for the MC-SUCRA sanity band.
suppressPackageStartupMessages({library(netmeta); library(jsonlite)})
d <- read.csv("C:/Projects/allmeta/nma/tests/fixtures/nma-tiny.csv")
nm <- netmeta(TE=d$TE, seTE=d$seTE, treat1=d$treat1, treat2=d$treat2,
               studlab=d$studlab, sm="MD", common=TRUE, random=TRUE,
               reference.group="A")
teA <- setNames(nm$TE.common[, "A"], rownames(nm$TE.common))
seA <- setNames(nm$seTE.common[, "A"], rownames(nm$seTE.common))
pg  <- setNames(netrank(nm, small.values="desirable")$ranking.common,
                nm$trts)
pb  <- setNames(netrank(nm, small.values="undesirable")$ranking.common,
                nm$trts)
oracle <- list(
  trts = nm$trts,
  TE = as.list(round(teA, 8)), seTE = as.list(round(seA, 8)),
  tau2 = round(nm$tau^2, 10),
  pscore_desirable = as.list(round(pg, 6)),
  pscore_undesirable = as.list(round(pb, 6)))
writeLines(toJSON(oracle, auto_unbox=TRUE, digits=10),
  "C:/Projects/allmeta/nma/tests/fixtures/nma-oracle.json")
cat("wrote nma-oracle.json\n")
cat("tau2(random)=", nm$tau^2, "\n"); print(round(teA,6)); print(round(seA,6))
cat("P-score desirable:\n"); print(round(pg,4))
cat("P-score undesirable:\n"); print(round(pb,4))
