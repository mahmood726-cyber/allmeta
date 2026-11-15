# NMA Pro v8.1 - External Benchmark Script (R netmeta + parity bridge)
if (!require("netmeta")) install.packages("netmeta")
if (!require("jsonlite")) install.packages("jsonlite")
library(jsonlite)
# NMA Pro v8.1 - R netmeta script reproducing the page's analysis
# effect measure MD, estimator FE, zero-cell haldane, correction none, level 0.95
library(netmeta)

studies <- data.frame(
  studlab = c("DeFronzo1995", "Lewin2007", "Willms1999", "Davidson2007", "Wolffenbuttel1999", "Kipnes2001", "Kerenyi2004", "Hanefeld2004", "Derosa2004", "Baksi2004", "Rosenstock2008", "Zhu2003", "Yang2003", "Vongthavaravat2002", "Oyama2008", "Costa1997", "Hermansen2007", "Garber2008", "Alex1998", "Johnston1994", "Johnston1998a", "Kim2007", "Johnston1998b", "Gonzalez-Ortiz2004", "Stucci1996", "Moulin2006", "Willms1999", "Willms1999"),
  treat1 = c("metf", "metf", "metf", "rosi", "rosi", "piog", "rosi", "piog", "piog", "rosi", "rosi", "rosi", "rosi", "rosi", "acar", "acar", "sita", "vild", "metf", "migl", "migl", "rosi", "migl", "metf", "benf", "benf", "metf", "acar"),
  treat2 = c("plac", "plac", "acar", "plac", "plac", "plac", "plac", "metf", "rosi", "plac", "plac", "plac", "metf", "sulf", "sulf", "plac", "plac", "plac", "sulf", "plac", "plac", "metf", "plac", "plac", "plac", "plac", "plac", "plac"),
  TE = c(-1.9, -0.82, -0.2, -1.34, -1.1, -1.3, -0.77, 0.16, 0.1, -1.3, -1.09, -1.5, -0.14, -1.2, -0.4, -0.8, -0.57, -0.7, -0.37, -0.74, -1.41, 0, -0.68, -0.4, -0.23, -1.01, -1.2, -1),
  seTE = c(0.1414, 0.0992, 0.3579, 0.1435, 0.1141, 0.1268, 0.1078, 0.0849, 0.1831, 0.1014, 0.2263, 0.1624, 0.2239, 0.1436, 0.1549, 0.1432, 0.1291, 0.1273, 0.1184, 0.1839, 0.2235, 0.2339, 0.2828, 0.4356, 0.3467, 0.1366, 0.3758, 0.4669)
)
p1 <- studies

net <- netmeta(TE, seTE, treat1, treat2, studlab, data = p1, sm = "MD",
               reference.group = "plac", common = TRUE, random = FALSE,
               level = 0.95, level.ma = 0.95)

sm <- "MD"

rank_obj <- tryCatch(netrank(net, small.values="desirable"), error=function(e) NULL)
p_scores <- if (!is.null(rank_obj)) { ps <- if (isTRUE(net$random)) rank_obj$ranking.random else rank_obj$ranking.common; setNames(as.numeric(ps), names(ps)) } else c()
parity_top <- if (length(p_scores)>0) names(sort(p_scores, decreasing=TRUE))[1] else NA
out <- list(
  source = "R-netmeta",
  timestamp = as.character(Sys.time()),
  tau2 = if (isTRUE(net$random)) as.numeric(net$tau^2) else 0,
  I2 = as.numeric(net$I2),
  Q = as.numeric(net$Q),
  pscores = as.list(p_scores),
  metadata = list(sm=sm, reference="plac", method_tau="FE", reproducible=TRUE, crossnma_top=parity_top, mtrank_nclusters=NA, mid_rank_best=NA, nmaoutlier_flagged=NA, parity_note="Optionally fill parity fields from crossnma/mtrank/mid.nma.rank/NMAoutlier outputs")
)
write_json(out, "nma_external_benchmark.json", auto_unbox=TRUE, pretty=TRUE)
cat("Wrote benchmark file: nma_external_benchmark.json\n")
print(toJSON(out, auto_unbox=TRUE, pretty=TRUE))
