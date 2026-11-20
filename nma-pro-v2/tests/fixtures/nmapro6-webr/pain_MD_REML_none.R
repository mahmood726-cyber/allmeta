library(netmeta)
library(jsonlite)
TE <- c(-1.90000000000000,-1.80000000000000,-2.00000000000000,-1.50000000000000,-2.40000000000000,-1.90000000000000,0.300000000000000,0.600000000000000,0.300000000000000,-1.80000000000000,0.300000000000000,-2.00000000000000)
seTE <- c(0.347371079203014,0.400499687890016,0.353938875051508,0.390156663690654,0.327461095751494,0.371214223865412,0.403112887414927,0.345358838416982,0.359010987142300,0.321603127205833,0.292688685580203,0.362215405525497)
treat1 <- c("Ibuprofen","Ibuprofen","Naproxen","Naproxen","Diclofenac","Diclofenac","Ibuprofen","Ibuprofen","Naproxen","Ibuprofen","Naproxen","Diclofenac")
treat2 <- c("Placebo","Placebo","Placebo","Placebo","Placebo","Placebo","Naproxen","Diclofenac","Diclofenac","Placebo","Diclofenac","Placebo")
studlab <- c("Pain-1","Pain-2","Pain-3","Pain-4","Pain-5","Pain-6","Pain-7","Pain-8","Pain-9","Pain-10","Pain-11","Pain-12")
net <- netmeta(TE, seTE, treat1, treat2, studlab,
               sm="MD", reference.group="Placebo",
               common=FALSE, random=TRUE, method.tau="REML",
               level=0.95)
net.own <- NULL
rnk <- tryCatch(
  netrank(net, small.values="desirable"),
  error=function(e) tryCatch(netrank(net, small.values="good"), error=function(e2) NULL)
)
pscores <- if(!is.null(rnk)){
  if(FALSE) setNames(as.numeric(rnk$Pscore.common), names(rnk$Pscore.common))
  else setNames(as.numeric(rnk$Pscore.random), names(rnk$Pscore.random))
} else c()
trts <- net$trts
rref <- net$reference.group
mat <- if(FALSE) "common" else "random"
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
  reference="Placebo", sm="MD",
  method_tau="REML",
  tau2_own=if(is.null(net.own)) NA else as.numeric(net.own$tau^2),
  nStudies=net$k, nTreatments=net$n,
  netmeta_version=as.character(packageVersion("netmeta")),
  engine="netmeta"
)
toJSON(out, auto_unbox=TRUE, digits=10)
