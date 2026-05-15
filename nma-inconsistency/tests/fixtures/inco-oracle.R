## inco-oracle.R — authoritative FE reference for nma-inconsistency.
## The app uses fixed-effect contrast NMA + Dias node-splitting + a Higgins
## design-by-treatment dQ test, so the parity target is netmeta(common=TRUE)
## + netsplit() + decomp.design() on the COMMON (fixed-effect) model.
suppressPackageStartupMessages({library(netmeta); library(jsonlite)})
d <- read.csv("C:/Projects/allmeta/nma-inconsistency/tests/fixtures/inco-tiny.csv")

nm <- netmeta(TE = d$TE, seTE = d$seTE, treat1 = d$treat1, treat2 = d$treat2,
              studlab = d$studlab, sm = "MD", common = TRUE, random = FALSE,
              reference.group = "A")

## Network FE treatment estimates vs reference A.
trts <- nm$trts
teA  <- setNames(nm$TE.common[, "A"], rownames(nm$TE.common))
seA  <- setNames(nm$seTE.common[, "A"], rownames(nm$seTE.common))

ns  <- netsplit(nm, common = TRUE, random = FALSE)
dir <- ns$direct.common      # comparison, TE, seTE, ...
ind <- ns$indirect.common    # comparison, TE, seTE, ...
cmp <- ns$compare.common     # comparison, TE(=direct-indirect), seTE, z, p

dc <- decomp.design(nm)
qd <- dc$Q.decomp  # rows: Total / Within designs / Between designs

oracle <- list(
  trts = trts,
  Q_total = as.numeric(nm$Q), df_total = as.numeric(nm$df.Q),
  TE = as.list(round(teA, 8)), seTE = as.list(round(seA, 8)),
  netsplit = lapply(seq_len(nrow(cmp)), function(i) list(
    comparison = as.character(cmp$comparison[i]),
    direct_TE  = round(dir$TE[i], 8),
    direct_se  = round(dir$seTE[i], 8),
    indir_TE   = round(ind$TE[i], 8),
    indir_se   = round(ind$seTE[i], 8),
    diff       = round(cmp$TE[i], 8),
    z          = round(cmp$z[i], 8),
    p          = round(cmp$p[i], 8))),
  decomp = list(
    Q_total   = round(qd["Total", "Q"], 8),
    df_total  = qd["Total", "df"],
    Q_within  = round(qd["Within designs", "Q"], 8),
    df_within = qd["Within designs", "df"],
    Q_between = round(qd["Between designs", "Q"], 8),
    df_between= qd["Between designs", "df"],
    p_between = round(qd["Between designs", "pval"], 8))
)
writeLines(toJSON(oracle, auto_unbox = TRUE, digits = 10),
  "C:/Projects/allmeta/nma-inconsistency/tests/fixtures/inco-oracle.json")
cat("wrote inco-oracle.json\n")
cat("Q.total=", nm$Q, " df=", nm$df.Q, "\n")
print(round(teA, 6)); print(round(seA, 6))
cat("--- netsplit$compare.common ---\n"); print(cmp)
cat("--- decomp.design Q.decomp ---\n"); print(qd)
