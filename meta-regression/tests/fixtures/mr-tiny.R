suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
d <- read.csv(commandArgs(trailingOnly = TRUE)[1])
r <- rma.uni(yi = d$yi, vi = d$vi, mods = ~ d$year, method = "REML")
cat(toJSON(list(
  intercept = r$b[1,1], intercept_se = r$se[1], intercept_pval = r$pval[1],
  slope = r$b[2,1], slope_se = r$se[2], slope_pval = r$pval[2],
  R2 = r$R2, QM = r$QM, QMp = r$QMp, k = r$k
), auto_unbox = TRUE, digits = 12))
