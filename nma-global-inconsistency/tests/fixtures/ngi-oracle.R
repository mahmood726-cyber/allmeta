## ngi-oracle.R — authoritative reference for nma-global-inconsistency.
## App = FE consistency vs full-design model, ΔQ ~ χ²(nDesigns-nBasic)
## (Higgins design-by-treatment LR). Target = netmeta(common=TRUE) +
## decomp.design(): cons.Q=Total, full.Q="Within designs",
## ΔQ="Between designs" (the global inconsistency Q) with exact pchisq.
suppressPackageStartupMessages({library(netmeta); library(jsonlite)})
d <- read.csv("C:/Projects/allmeta/nma-global-inconsistency/tests/fixtures/ngi-tiny.csv")
nm <- netmeta(TE=d$TE, seTE=d$seTE, treat1=d$treat1, treat2=d$treat2,
               studlab=d$studlab, sm="MD", common=TRUE, random=FALSE,
               reference.group="A")
qd <- decomp.design(nm)$Q.decomp   # rows: Total / Within designs / Between designs
teA <- setNames(nm$TE.common[, "A"], rownames(nm$TE.common))

oracle <- list(
  trts = nm$trts,
  TE = as.list(round(teA, 8)),
  cons = list(Q = round(qd["Total","Q"], 8), df = qd["Total","df"]),
  full = list(Q = round(qd["Within designs","Q"], 8),
              df = qd["Within designs","df"]),
  between = list(Q = round(qd["Between designs","Q"], 8),
                 df = qd["Between designs","df"],
                 p  = round(qd["Between designs","pval"], 8)))
writeLines(toJSON(oracle, auto_unbox=TRUE, digits=10),
  "C:/Projects/allmeta/nma-global-inconsistency/tests/fixtures/ngi-oracle.json")
cat("wrote ngi-oracle.json\n"); print(qd)
