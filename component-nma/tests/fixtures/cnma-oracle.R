## cnma-oracle.R — authoritative reference for component-nma.
## App = additive contrast CNMA (Welton 2009) with control->empty reference
## and DL random effects, so the target is netmeta::discomb(inactive=
## "control"). On cnma-tiny tau2=0 so common==random (clean closed-form).
suppressPackageStartupMessages({library(netmeta); library(jsonlite)})
d <- read.csv("C:/Projects/allmeta/component-nma/tests/fixtures/cnma-tiny.csv")
dc <- discomb(TE=d$TE, seTE=d$seTE, treat1=d$treat1, treat2=d$treat2,
               studlab=d$studlab, inactive="control", sep.comps="+",
               common=TRUE, random=TRUE)

cn <- if (!is.null(names(dc$Comp.common))) names(dc$Comp.common) else dc$comps
bn <- if (!is.null(names(dc$Comb.common))) names(dc$Comb.common) else
        rownames(as.matrix(dc$Comb.common))
comp <- setNames(lapply(seq_along(cn), function(i) list(
          est=round(as.numeric(dc$Comp.common)[i], 8),
          se =round(as.numeric(dc$seComp.common)[i], 8))), cn)
comb <- setNames(lapply(seq_along(bn), function(i) list(
          est=round(as.numeric(dc$Comb.common)[i], 8),
          se =round(as.numeric(dc$seComb.common)[i], 8))), bn)

oracle <- list(
  components = comp, combinations = comb,
  tau2 = round(dc$tau^2, 10),
  Q_additive = round(dc$Q.additive, 8),
  df_additive = dc$df.Q.additive)
writeLines(toJSON(oracle, auto_unbox=TRUE, digits=10),
  "C:/Projects/allmeta/component-nma/tests/fixtures/cnma-oracle.json")
cat("wrote cnma-oracle.json\n")
cat("comp names:", paste(cn, collapse=","), "\n")
cat("comb names:", paste(bn, collapse=","), "\n")
cat("tau2=", dc$tau^2, " Q.additive=", dc$Q.additive,
    " df=", dc$df.Q.additive, "\n")
