suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(metadat))
print(.libPaths()); print(R.version.string); print(packageVersion('metafor')); print(packageVersion('metadat'))
source('json17.R')
input <- Sys.getenv('P17_REFERENCE_INPUT',unset='corpus.rds')
prefix <- Sys.getenv('P17_REFERENCE_PREFIX',unset='')
corpus <- readRDS(input); refs <- list(); configs <- list()
for(c in corpus) for(method in c('REML','PM','DL','FE')) {
 id <- paste(c[['id',exact=TRUE]],method,sep='::')
 k <- length(c[['accepted',exact=TRUE]])
 warnings <- character()
 ans <- tryCatch(withCallingHandlers({
  if(k<2) stop('fewer than 2 valid rows')
  y <- c[['z',exact=TRUE]]; v <- c[['v',exact=TRUE]]
  fit <- rma(yi=y,vi=v,method=method,test='z',control=list(threshold=1e-12,maxiter=10000,stepadj=0.5,tol=.Machine$double.eps^0.75))
  mu <- as.numeric(fit[['b',exact=TRUE]]); se <- fit[['se',exact=TRUE]]; tau <- fit[['tau2',exact=TRUE]]
  pi <- if(method=='FE') c(NA_real_,NA_real_) else mu+c(-1,1)*qt(.975,k-1)*sqrt(tau+se^2)
  good <- c[['studies',exact=TRUE]][c[['accepted',exact=TRUE]]]
  list(id=id,status='ok',k=k,method=method,mu_z=mu,se_z=se,tau2_z=tau,I2=fit[['I2',exact=TRUE]],Q=fit[['QE',exact=TRUE]],Q_p=fit[['QEp',exact=TRUE]],effect_p=fit[['pval',exact=TRUE]],ciLo=fit[['ci.lb',exact=TRUE]],ciHi=fit[['ci.ub',exact=TRUE]],piLo=pi[1],piHi=pi[2],r=tanh(mu),r_lo=tanh(fit[['ci.lb',exact=TRUE]]),r_hi=tanh(fit[['ci.ub',exact=TRUE]]),r_pi_lo=tanh(pi[1]),r_pi_hi=tanh(pi[2]),weights=unname(weights(fit)),studies=good,z=unname(y),v=unname(v),study_lo=unname(tanh(y-qnorm(.975)*sqrt(v))),study_hi=unname(tanh(y+qnorm(.975)*sqrt(v))))
 },warning=function(w){warnings <<- c(warnings,conditionMessage(w));invokeRestart('muffleWarning')}),error=function(e)list(id=id,status='refused',reason=conditionMessage(e),k=k,method=method))
 ans[['warnings']] <- as.list(warnings); refs[[length(refs)+1]] <- ans
 configs[[length(configs)+1]] <- data.frame(id=id,input=c[['id',exact=TRUE]],method=method,k=k,status=ans[['status',exact=TRUE]],reason=if(ans[['status',exact=TRUE]]=='ok')'' else ans[['reason',exact=TRUE]])
 cat(id,ans[['status',exact=TRUE]],paste(warnings,collapse='; '),'\n')
}
write_json17(refs,paste0(prefix,'reference.json')); write.csv(do.call(rbind,configs),paste0(prefix,'configuration-ledger.csv'),row.names=FALSE)
cat(sprintf('REFERENCE: %d configurations; %d successful; %d refused\n',length(refs),sum(vapply(refs,function(x)x[['status',exact=TRUE]]=='ok',logical(1))),sum(vapply(refs,function(x)x[['status',exact=TRUE]]!='ok',logical(1)))))
