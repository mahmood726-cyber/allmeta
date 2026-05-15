## nma-oracle.R — authoritative reference for the nma-pro-v2 demo AMI dataset.
## Settles whether the embedded RValidation reference (Q=1.45/I2=0 pairwise;
## network Q=7.94; the pscores) is correct or stale, using metafor (pairwise
## Cochran Q) and netmeta (graph-theoretic network Q / I2 / P-score).
ok <- requireNamespace("netmeta", quietly = TRUE)
cat("netmeta installed:", ok, "\n")
suppressPackageStartupMessages({library(metafor); if (ok) library(netmeta)})

## --- 3-study SK-vs-tPA pairwise subset (the failing Q/I2 check) ---
## events1/n1 = SK ; events2/n2 = tPA. logOR = log(a*d/(b*c)).
sk <- data.frame(
  study = c("GUSTO-1","GISSI-2","ISIS-3"),
  e.sk  = c(1135, 887, 1455), n.sk = c(13780, 10372, 13773),
  e.tpa = c(1021, 862, 1418), n.tpa= c(13746, 10396, 13746))
es <- escalc(measure="OR", ai=e.sk, bi=n.sk-e.sk, ci=e.tpa, di=n.tpa-e.tpa,
             data=sk)
fe <- rma(yi, vi, data=es, method="FE")
re <- rma(yi, vi, data=es, method="REML")
cat("\n== SK-vs-tPA pairwise (metafor, no continuity corr; cells all >0) ==\n")
cat("per-study logOR:", round(es$yi,6), "\n")
cat("per-study se   :", round(sqrt(es$vi),6), "\n")
cat(sprintf("FE: Q=%.6f df=%d I2=%.4f tau2(DL)=%.8f\n",
            fe$QE, fe$k-1, max(0,(fe$QE-(fe$k-1))/fe$QE*100), 0))
cat(sprintf("REML pooled logOR=%.6f se=%.6f tau2=%.8f\n",
            re$beta, re$se, re$tau2))

## --- full 6-trial network (netmeta, OR) ---
if (ok) {
  d <- data.frame(
    study=c("GUSTO-1","ASSENT-2","INJECT","RAPID-2","GISSI-2","ISIS-3"),
    t1=c("SK","TNK","SK","rPA","SK","SK"),
    e1=c(1135,749,270,58,887,1455), n1=c(13780,8461,3004,324,10372,13773),
    t2=c("tPA","tPA","rPA","tPA","tPA","tPA"),
    e2=c(1021,753,285,63,862,1418), n2=c(13746,8488,2992,325,10396,13746))
  pw <- pairwise(treat=list(t1,t2), event=list(e1,e2), n=list(n1,n2),
                 studlab=study, data=d, sm="OR")
  nm <- netmeta(pw, reference.group="tPA", common=FALSE, random=TRUE)
  cat("\n== full network (netmeta, random) ==\n")
  cat(sprintf("Q.total=%.6f (df=%d)  Q.het=%.6f  Q.inc=%.6f\n",
      nm$Q, nm$df.Q, nm$Q.heterogeneity, nm$Q.inconsistency))
  cat(sprintf("I2=%.4f  tau2=%.8f  tau=%.8f\n", nm$I2*100, nm$tau^2, nm$tau))
  cat("network logOR vs tPA:\n"); print(round(nm$TE.random[,"tPA"],6))
  nr <- netrank(nm, small.values="desirable")  # lower OR (fewer deaths) better
  cat("P-scores (small.values=desirable):\n")
  print(round(nr$ranking.random, 6))

  ## ---- engine-convention authoritative block (+0.5 to ALL cells, the
  ## monolith's calcEffects Haldane convention) -> JSON for the embedded ref.
  lo <- function(e1,n1,e2,n2){ a<-e1+.5;b<-n1-e1+.5;c<-e2+.5;d<-n2-e2+.5
    list(logOR=log(a*d/(b*c)), se=sqrt(1/a+1/b+1/c+1/d)) }
  es5 <- list(
    `GUSTO-1`=lo(1135,13780,1021,13746), `ASSENT-2`=lo(749,8461,753,8488),
    `INJECT` =lo(270,3004,285,2992),    `GISSI-2` =lo(887,10372,862,10396),
    `ISIS-3` =lo(1455,13773,1418,13746))
  skcc <- escalc(measure="OR", ai=e.sk+.5, bi=n.sk-e.sk+.5,
                 ci=e.tpa+.5, di=n.tpa-e.tpa+.5, data=sk)
  fecc <- rma(yi,vi,data=skcc,method="FE"); recc <- rma(yi,vi,data=skcc,method="REML")
  pwc <- pairwise(treat=list(t1,t2),event=list(e1,e2),n=list(n1,n2),
                  studlab=study,data=d,sm="OR",incr=0.5,allincr=TRUE)
  nmc <- netmeta(pwc,reference.group="tPA",common=FALSE,random=TRUE)
  nrc <- netrank(nmc,small.values="desirable")
  toOR <- function(x) as.numeric(exp(x))
  jb <- list(
    effectSizes=lapply(es5,function(z)list(logOR=round(z$logOR,6),se=round(z$se,6))),
    pairwiseSKtPA=list(Q=round(fecc$QE,6),df=fecc$k-1,
      I2=round(max(0,(fecc$QE-(fecc$k-1))/fecc$QE*100),6),
      pooledLogOR_REML=round(as.numeric(recc$beta),6),
      se=round(as.numeric(recc$se),6),tau2=round(recc$tau2,8)),
    network=list(Q=round(nmc$Q,6),df=nmc$df.Q,I2=round(nmc$I2*100,6),
      tau2=round(nmc$tau^2,8)),
    networkOR=as.list(round(toOR(nmc$TE.random[,"tPA"]),6)),
    pscores=as.list(round(nrc$ranking.random,6)))
  writeLines(jsonlite::toJSON(jb,auto_unbox=TRUE,digits=8),
    "C:/Projects/allmeta/nma-pro-v2/tests/fixtures/nma-oracle.json")
  cat("\nwrote nma-oracle.json (engine +0.5-all convention)\n")
}
