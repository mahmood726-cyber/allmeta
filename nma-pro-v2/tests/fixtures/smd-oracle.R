# R oracle for nma-pro-v2 continuous effect sizes (lane nmasmd, 2026-11-15).
# Run from this folder: Rscript smd-oracle.R  ->  smd-oracle.json
# (R 4.6.0, metafor 5.0.1, meta 8.5-0, netmeta 3.7-0).
#
# normand: dat.normand1999 (metadat), 9 two-arm trials with arm-level mean / SD / n.
#   Hedges g: metafor escalc("SMD") yi == meta::metacont(sm = "SMD") TE (exact Gamma-ratio J).
#   Variance: meta::metacont 8.5 seTE^2 == escalc(vtype = "UB") vi, the unbiased estimate of the exact variance
#   of g; escalc's default vtype = "LS" (1/n1 + 1/n2 + g^2 / (2 (n1 + n2))) is recorded for comparison.
#   MD: metacont(sm = "MD").
# franchini: netmeta Franchini2012 (Parkinson, 7 studies; Guttman 1997 has 3 arms). Every pairwise contrast of every
#   study from the ORIGINAL arm data.
#   * two-arm studies: metacont(sm = "SMD") Hedges g and variance, as above.
#   * the 3-arm study: an EXPLICIT R IMPLEMENTATION OF THE PAGE'S CONVENTION, not an R package result (no package
#     computes J at df N - k on an all-arm pooled SD; meta::pairwise pools the SD over the arms but hard-codes
#     method.smd = "Cohen", i.e. no J). SD pooled over ALL its arms (the pooling step meta::pairwise uses for
#     sm = "SMD" with > 2 arms), d from metacont(method.smd = "Cohen") on that common SD, one J for the study at the
#     pooled SD's df m = N - k (R lgamma), g = J d, var = 1/n_a + 1/n_b + (1 - (m - 2) / (m J^2)) g^2 (the UB
#     formula at df m). It checks the page's arithmetic of that rule, not the rule itself.
#   * per_pair_hedges_netmeta: netmeta's verdict on per-pair metacont Hedges g from each pair's own SDs.
#   * netmeta on those contrasts (TE / seTE), common and random (REML).
#   * pairwise_netmeta: the netmeta pipeline pairwise(sm = "SMD") -> netmeta (Cohen d), for reference only.
suppressPackageStartupMessages({library(metafor); library(meta); library(netmeta); library(jsonlite)})
Jx <- function(m) exp(lgamma(m/2) - log(sqrt(m/2)) - lgamma((m-1)/2))
d <- dat.normand1999
e_ls <- escalc("SMD", m1i=m1i, sd1i=sd1i, n1i=n1i, m2i=m2i, sd2i=sd2i, n2i=n2i, data=d)
e_ub <- escalc("SMD", m1i=m1i, sd1i=sd1i, n1i=n1i, m2i=m2i, sd2i=sd2i, n2i=n2i, data=d, vtype="UB")
mc <- metacont(n1i, m1i, sd1i, n2i, m2i, sd2i, data=d, sm="SMD")
md <- metacont(n1i, m1i, sd1i, n2i, m2i, sd2i, data=d, sm="MD")
stopifnot(max(abs(mc$TE - e_ub$yi)) < 1e-12, max(abs(mc$seTE^2 - e_ub$vi)) < 1e-12)
normand <- data.frame(study=d$source, n1=d$n1i, m1=d$m1i, s1=d$sd1i, n2=d$n2i, m2=d$m2i, s2=d$sd2i,
  g=mc$TE, vi_UB=mc$seTE^2, vi_LS=as.numeric(e_ls$vi), md=md$TE, vi_md=md$seTE^2)
data(Franchini2012); F <- Franchini2012
rows <- list()
for (i in seq_len(nrow(F))) {
  arms <- data.frame(t=c(F$Treatment1[i], F$Treatment2[i], F$Treatment3[i]), m=c(F$y1[i], F$y2[i], F$y3[i]),
                     s=c(F$sd1[i], F$sd2[i], F$sd3[i]), n=c(F$n1[i], F$n2[i], F$n3[i]))
  arms <- arms[!is.na(arms$t), ]; k <- nrow(arms)
  for (a in 1:(k-1)) for (b in (a+1):k) {
    A <- arms[a, ]; B <- arms[b, ]
    if (k == 2) {
      mm <- metacont(A$n, A$m, A$s, B$n, B$m, B$s, sm="SMD"); g <- mm$TE; vi <- mm$seTE^2
    } else {
      sp <- sqrt(sum((arms$n - 1) * arms$s^2) / sum(arms$n - 1)); m <- sum(arms$n) - k
      dd <- metacont(A$n, A$m, sp, B$n, B$m, sp, sm="SMD", method.smd="Cohen")$TE
      J <- Jx(m); g <- J * dd; vi <- 1/A$n + 1/B$n + (1 - (m - 2) / (m * J^2)) * g^2
    }
    rows[[length(rows)+1]] <- data.frame(study=F$Study[i], t1=A$t, t2=B$t, m1=A$m, s1=A$s, n1=A$n, m2=B$m, s2=B$s, n2=B$n, g=g, vi=vi)
  }
}
fr <- do.call(rbind, rows)
pp <- metacont(fr$n1, fr$m1, fr$s1, fr$n2, fr$m2, fr$s2, sm="SMD")
per_pair <- tryCatch({netmeta(pp$TE, pp$seTE, fr$t1, fr$t2, fr$study, sm="SMD"); "accepted"},
                     error=function(e) strsplit(conditionMessage(e), "\n")[[1]][1])
net <- netmeta(fr$g, sqrt(fr$vi), fr$t1, fr$t2, fr$study, sm="SMD", reference.group="Placebo", common=TRUE, random=TRUE, method.tau="REML")
p <- pairwise(list(Treatment1,Treatment2,Treatment3), n=list(n1,n2,n3), mean=list(y1,y2,y3), sd=list(sd1,sd2,sd3), data=F, studlab=Study, sm="SMD")
np <- netmeta(p, sm="SMD", reference.group="Placebo", common=TRUE, random=FALSE)
L <- function(x) as.list(x[, "Placebo"])
out <- list(versions=list(R=R.version.string, metafor=as.character(packageVersion("metafor")), meta=as.character(packageVersion("meta")), netmeta=as.character(packageVersion("netmeta"))),
  normand=normand, franchini=fr, per_pair_hedges_netmeta=per_pair,
  franchini_net=list(TE_common=L(net$TE.common), se_common=L(net$seTE.common), TE_random=L(net$TE.random), se_random=L(net$seTE.random), tau2=net$tau2, Q=net$Q, df_Q=net$df.Q),
  pairwise_netmeta=list(TE_common=L(np$TE.common), se_common=L(np$seTE.common), Q=np$Q))
write(toJSON(out, digits=NA, auto_unbox=TRUE, pretty=TRUE), "smd-oracle.json")
