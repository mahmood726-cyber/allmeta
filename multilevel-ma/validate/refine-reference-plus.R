extra <- Sys.getenv('ALM_EXISTING_R_LIB','')
if(nzchar(extra)&&dir.exists(extra)) .libPaths(c(.libPaths(),extra))
print(.libPaths())
for(p in c('metafor','metadat','clubSandwich','jsonlite'))cat(p,as.character(packageVersion(p)),'\n')
library(metafor)
source('validate/refine-plus.R')
refs <- jsonlite::fromJSON('validate/plus-corpus/reference-plus.json',simplifyVector=FALSE)
corpus <- jsonlite::fromJSON('validate/corpus/corpus.json')
for(name in names(refs)) {
  if(refs[[name]]$status!='ok')next
  d <- corpus[[name]]
  theta <- refine_variances(d,vapply(refs[[name]]$profiles,function(p)p$estimate,0))
  f <- rma.mv(y,v,random=~1|cluster/id,data=d,sigma2=theta,method='REML',sparse=TRUE)
  cr <- clubSandwich::coef_test(f,vcov='CR2',cluster=d$cluster,test='Satterthwaite')
  ci <- clubSandwich::conf_int(f,vcov='CR2',cluster=d$cluster,test='Satterthwaite',level=.95)
  refs[[name]]$robust <- list(estimate=unname(cr$beta[1]),se=cr$SE[1],df=cr$df_Satt[1],t=cr$tstat[1],p=cr$p_Satt[1],lower=ci$CI_L[1],upper=ci$CI_U[1])
  refs[[name]]$cr2Sigma2 <- as.list(theta)
  cat(name,'CR2 score-refined reference\n');flush.console()
}
con <- file('validate/plus-corpus/refined-reference-plus.json','wb')
writeBin(charToRaw(paste0(jsonlite::toJSON(refs,auto_unbox=TRUE,digits=NA,null='null',na='null'),'\n')),con)
close(con)
