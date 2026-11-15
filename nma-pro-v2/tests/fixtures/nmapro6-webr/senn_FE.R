library(netmeta)
library(jsonlite)
TE <- c(-1.90000000000000,-0.820000000000000,-0.200000000000000,-1.34000000000000,-1.10000000000000,-1.30000000000000,-0.770000000000000,0.160000000000000,0.100000000000000,-1.30000000000000,-1.09000000000000,-1.50000000000000,-0.140000000000000,-1.20000000000000,-0.400000000000000,-0.800000000000000,-0.570000000000000,-0.700000000000000,-0.370000000000000,-0.740000000000000,-1.41000000000000,0.00000000000000,-0.680000000000000,-0.400000000000000,-0.230000000000000,-1.01000000000000,-1.20000000000000,-1.00000000000000)
seTE <- c(0.141400000000000,0.0992000000000000,0.357900000000000,0.143500000000000,0.114100000000000,0.126800000000000,0.107800000000000,0.0849000000000000,0.183100000000000,0.101400000000000,0.226300000000000,0.162400000000000,0.223900000000000,0.143600000000000,0.154900000000000,0.143200000000000,0.129100000000000,0.127300000000000,0.118400000000000,0.183900000000000,0.223500000000000,0.233900000000000,0.282800000000000,0.435600000000000,0.346700000000000,0.136600000000000,0.375800000000000,0.466900000000000)
treat1 <- c("metf","metf","metf","rosi","rosi","piog","rosi","piog","piog","rosi","rosi","rosi","rosi","rosi","acar","acar","sita","vild","metf","migl","migl","rosi","migl","metf","benf","benf","metf","acar")
treat2 <- c("plac","plac","acar","plac","plac","plac","plac","metf","rosi","plac","plac","plac","metf","sulf","sulf","plac","plac","plac","sulf","plac","plac","metf","plac","plac","plac","plac","plac","plac")
studlab <- c("DeFronzo1995","Lewin2007","Willms1999","Davidson2007","Wolffenbuttel1999","Kipnes2001","Kerenyi2004","Hanefeld2004","Derosa2004","Baksi2004","Rosenstock2008","Zhu2003","Yang2003","Vongthavaravat2002","Oyama2008","Costa1997","Hermansen2007","Garber2008","Alex1998","Johnston1994","Johnston1998a","Kim2007","Johnston1998b","Gonzalez-Ortiz2004","Stucci1996","Moulin2006","Willms1999","Willms1999")
net <- netmeta(TE, seTE, treat1, treat2, studlab,
               sm="MD", reference.group="plac",
               common=TRUE, random=FALSE, method.tau="REML",
               level=0.95)
net.own <- NULL
rnk <- tryCatch(
  netrank(net, small.values="desirable"),
  error=function(e) tryCatch(netrank(net, small.values="good"), error=function(e2) NULL)
)
pscores <- if(!is.null(rnk)){
  if(TRUE) setNames(as.numeric(rnk$Pscore.common), names(rnk$Pscore.common))
  else setNames(as.numeric(rnk$Pscore.random), names(rnk$Pscore.random))
} else c()
trts <- net$trts
rref <- net$reference.group
mat <- if(TRUE) "common" else "random"
effs <- list()
league <- list()
predict_list <- list()
for(t in trts){
  if(t==rref) next
  idx <- match(t, trts)
  ridx <- match(rref, trts)
  if(mat=="common"){
    effs[[t]] <- list(estimate=net$TE.common[idx,ridx], se=net$seTE.common[idx,ridx],
      ci_lower=net$lower.common[idx,ridx], ci_upper=net$upper.common[idx,ridx],
      pvalue=net$pval.common[idx,ridx])
  } else {
    effs[[t]] <- list(estimate=net$TE.random[idx,ridx], se=net$seTE.random[idx,ridx],
      ci_lower=net$lower.random[idx,ridx], ci_upper=net$upper.random[idx,ridx],
      pvalue=net$pval.random[idx,ridx])
  }
  predict_list[[t]] <- tryCatch(list(
    lower=net$lower.predict.random[idx,ridx],
    upper=net$upper.predict.random[idx,ridx]
  ), error=function(e) list(lower=NA, upper=NA))
}
for(i in seq_along(trts)){
  for(j in seq_along(trts)){
    if(i==j) next
    key <- paste0(trts[i], ":", trts[j])
    if(mat=="common"){
      league[[key]] <- list(TE=net$TE.common[i,j], seTE=net$seTE.common[i,j],
        lower=net$lower.common[i,j], upper=net$upper.common[i,j])
    } else {
      league[[key]] <- list(TE=net$TE.random[i,j], seTE=net$seTE.random[i,j],
        lower=net$lower.random[i,j], upper=net$upper.random[i,j])
    }
  }
}
ns_results <- tryCatch({
  ns <- netsplit(net, level=0.95)
  ns_list <- list()
  ns_df <- if(mat=="common") ns$common else ns$random
  ns_direct <- if(mat=="common") ns$direct.common else ns$direct.random
  ns_indirect <- if(mat=="common") ns$indirect.common else ns$indirect.random
  ns_compare <- if(mat=="common") ns$compare.common else ns$compare.random
  for(i in seq_len(nrow(ns_df))){
    comp <- ns$comparison[i]
    ns_list[[comp]] <- list(
      direct=ns_direct$TE[i],
      indirect=ns_indirect$TE[i],
      diff=ns_compare$TE[i],
      pvalue=ns_compare$p[i]
    )
  }
  ns_list
}, error=function(e) list())
out <- list(
  method=mat,
  tau2=as.numeric(net$tau^2), tau=as.numeric(net$tau),
  I2=100*as.numeric(net$I2), Q=as.numeric(net$Q), # netmeta I2 is a proportion, the page reports % (compared 81.4 with 0.814 until 2026-11-15)
  df=as.numeric(net$df.Q), pQ=as.numeric(net$pval.Q),
  pscores=as.list(pscores), effects=effs, league=league,
  predict=predict_list, nodesplit=ns_results,
  reference="plac", sm="MD",
  method_tau="FE",
  tau2_own=if(is.null(net.own)) NA else as.numeric(net.own$tau^2),
  nStudies=net$k, nTreatments=net$n,
  netmeta_version=as.character(packageVersion("netmeta")),
  engine="netmeta"
)
toJSON(out, auto_unbox=TRUE, digits=10)
