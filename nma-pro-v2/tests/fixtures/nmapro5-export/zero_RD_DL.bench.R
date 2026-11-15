# NMA Pro v8.1 - External Benchmark Script (R netmeta + parity bridge)
if (!require("netmeta")) install.packages("netmeta")
if (!require("jsonlite")) install.packages("jsonlite")
library(jsonlite)
# NMA Pro v8.1 - R netmeta script reproducing the page's analysis
# effect measure RD, estimator DL, zero-cell haldane, correction none, level 0.95
library(netmeta)

# arm-level data: one row per study and arm (a k-arm study is ONE study with k arms)
arms <- data.frame(
  study = c("1", "1", "1", "2", "2", "2", "3", "3", "4", "4", "5", "5", "6", "6", "7", "7", "8", "8", "9", "9", "10", "10", "11", "11", "12", "12", "13", "13", "14", "14", "15", "15", "16", "16", "17", "17", "18", "18", "19", "19", "20", "20", "21", "21", "22", "22", "23", "23", "24", "24", "25", "25", "25"),
  treat = c("A", "C", "D", "B", "C", "D", "A", "C", "A", "C", "A", "C", "A", "C", "A", "C", "A", "C", "A", "C", "A", "B", "A", "B", "A", "C", "A", "C", "A", "C", "A", "D", "A", "B", "A", "C", "A", "C", "A", "C", "A", "C", "B", "C", "B", "D", "C", "D", "C", "D", "A", "B", "C"),
  event = c(9, 23, 10, 11, 12, 29, 75, 363, 2, 9, 58, 237, 0, 9, 3, 31, 1, 26, 6, 17, 79, 77, 18, 21, 64, 107, 5, 8, 20, 34, 0, 9, 8, 19, 95, 143, 15, 36, 78, 73, 69, 54, 20, 16, 7, 32, 12, 20, 9, 3, 5, 8, 0),
  n = c(140, 140, 138, 78, 85, 170, 731, 714, 106, 205, 549, 1561, 33, 48, 100, 98, 31, 95, 39, 77, 702, 694, 671, 535, 642, 761, 62, 90, 234, 237, 20, 20, 116, 149, 1107, 1031, 187, 504, 584, 675, 1177, 888, 49, 43, 66, 127, 76, 74, 55, 26, 50, 60, 40)
)
sp <- split(arms, factor(arms$study, levels = unique(arms$study)))
k <- max(sapply(sp, nrow))
wide <- function(v) lapply(seq_len(k), function(j) unname(sapply(sp, function(x) if (nrow(x) >= j) x[[v]][j] else NA)))
p1 <- pairwise(treat = wide("treat"), event = wide("event"), n = wide("n"),
               studlab = names(sp), sm = "RD")

net <- netmeta(TE, seTE, treat1, treat2, studlab, data = p1, sm = "RD",
               reference.group = "A", common = FALSE, random = TRUE, method.tau = "DL",
               level = 0.95, level.ma = 0.95)

sm <- "RD"

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
  metadata = list(sm=sm, reference="A", method_tau="DL", reproducible=TRUE, crossnma_top=parity_top, mtrank_nclusters=NA, mid_rank_best=NA, nmaoutlier_flagged=NA, parity_note="Optionally fill parity fields from crossnma/mtrank/mid.nma.rank/NMAoutlier outputs")
)
write_json(out, "nma_external_benchmark.json", auto_unbox=TRUE, pretty=TRUE)
cat("Wrote benchmark file: nma_external_benchmark.json\n")
print(toJSON(out, auto_unbox=TRUE, pretty=TRUE))
