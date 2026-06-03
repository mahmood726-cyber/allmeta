## inco-re-oracle.R — random-effects reference for nma-inconsistency (V12).
## The app's RE option fits contrast NMA with shared τ² (method DL or PM) and
## inflated weights w_i = 1/(SE² + τ²). The parity target is therefore
## netmeta(common=FALSE, random=TRUE, method.tau=...) for τ², the network
## RE treatment estimates, and netsplit()/decomp.design() on the RANDOM model.
## Uses an OVER-dispersed fixture (inco-het.csv, Q≫df) so τ²>0 actually
## exercises the DL/PM estimators — inco-tiny is under-dispersed (τ²=0).
## 2-arm contrasts only.
suppressPackageStartupMessages({library(netmeta); library(jsonlite)})
d <- read.csv("C:/Projects/allmeta/nma-inconsistency/tests/fixtures/inco-het.csv")

one <- function(tau.method) {
  nm <- netmeta(TE = d$TE, seTE = d$seTE, treat1 = d$treat1, treat2 = d$treat2,
                studlab = d$studlab, sm = "MD", common = FALSE, random = TRUE,
                method.tau = tau.method, reference.group = "A")
  trts <- nm$trts
  teA  <- setNames(nm$TE.random[, "A"],  rownames(nm$TE.random))
  seA  <- setNames(nm$seTE.random[, "A"], rownames(nm$seTE.random))
  ns  <- netsplit(nm, common = FALSE, random = TRUE)
  dir <- ns$direct.random; ind <- ns$indirect.random; cmp <- ns$compare.random
  list(
    tau2 = round(nm$tau2, 10),
    Q_total = as.numeric(nm$Q), df_total = as.numeric(nm$df.Q),
    TE = as.list(round(teA, 8)), seTE = as.list(round(seA, 8)),
    netsplit = lapply(seq_len(nrow(cmp)), function(i) list(
      comparison = as.character(cmp$comparison[i]),
      direct_TE  = round(dir$TE[i], 8),   direct_se = round(dir$seTE[i], 8),
      indir_TE   = round(ind$TE[i], 8),   indir_se  = round(ind$seTE[i], 8),
      diff       = round(cmp$TE[i], 8),
      z          = round(cmp$z[i], 8),    p         = round(cmp$p[i], 8))))
}

## netmeta's network model offers method.tau in {DL, ML, REML} only — there is
## no Paule-Mandel option for networks. So the DL oracle validates the app's
## generalized-DL denominator fix directly; the app's PM path is validated by
## its defining moment condition Q(τ²)=df inside the JS spec (no R counterpart).
oracle <- list(DL = one("DL"))
writeLines(toJSON(oracle, auto_unbox = TRUE, digits = 10),
  "C:/Projects/allmeta/nma-inconsistency/tests/fixtures/inco-re-oracle.json")
cat("wrote inco-re-oracle.json\n")
cat("DL tau2 =", oracle$DL$tau2, "\n")
