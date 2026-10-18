# Run from multilevel-ma/. Uses installed packages only.
extra <- Sys.getenv('ALM_EXISTING_R_LIB', 'C:/Users/User/mh-offload/Rlibs')
if (dir.exists(extra)) .libPaths(c(.libPaths(), extra))
print(.libPaths())
for(p in c('metafor','metadat','clubSandwich','jsonlite')) cat(p, as.character(packageVersion(p)), '\n')
library(metafor)
library(clubSandwich)
options(warn=1)
corpus <- jsonlite::fromJSON('validate/corpus/corpus.json', simplifyVector=FALSE)
old <- jsonlite::fromJSON('validate/corpus/reference.json', simplifyVector=FALSE)
inventory <- read.csv('validate/dataset-disposition-plus.csv')
stopifnot(setequal(inventory$dataset, data(package='metadat')$results[,'Item']))
stopifnot(setequal(unique(vapply(old, `[[`, '', 'dataset')),inventory$dataset[inventory$status=='used']))
dir.create('validate/plus-corpus',showWarnings=FALSE)
save <- function(x,path) {
  text <- jsonlite::toJSON(x,auto_unbox=TRUE,digits=NA,null='null',na='null',pretty=FALSE)
  con <- file(path,'wb'); writeBin(charToRaw(paste0(text,'\n')),con); close(con)
}
result <- if(file.exists('validate/plus-corpus/reference-plus.json')) jsonlite::fromJSON('validate/plus-corpus/reference-plus.json',simplifyVector=FALSE) else list()
for(name in names(corpus)) {
  if(!is.null(result[[name]]) && result[[name]]$status=='ok')next
  cat('START',name,'\n');flush.console()
  d <- do.call(rbind,lapply(corpus[[name]],as.data.frame))
  warnings <- character()
  answer <- tryCatch(withCallingHandlers({
    ctrl <- list(rel.tol=1e-10)
    if(name=='dat.maire2019') ctrl <- list(optimizer='optim',optmethod='BFGS',reltol=1e-14,maxit=5000)
    f <- rma.mv(y,v,random=~1|cluster/id,data=d,method='REML',sparse=TRUE,control=ctrl)
    cr <- coef_test(f,vcov='CR2',cluster=d$cluster,test='Satterthwaite')
    ci <- conf_int(f,vcov='CR2',cluster=d$cluster,test='Satterthwaite',level=.95)
    robust <- list(estimate=unname(cr$beta[1]),se=cr$SE[1],df=cr$df_Satt[1],t=cr$tstat[1],p=cr$p_Satt[1],lower=ci$CI_L[1],upper=ci$CI_U[1])
    profiles <- lapply(1:2,function(j) {
      fp <- f
      ci <- confint(fp,sigma2=j,control=list(tol=1e-8,maxiter=1000))$random[1,]
      if(any(!is.finite(ci))) {
        fp$control <- list(optimizer='optim',optmethod='Nelder-Mead',reltol=1e-12,maxit=10000)
        ci <- confint(fp,sigma2=j,control=list(tol=1e-8,maxiter=1000))$random[1,]
      }
      stopifnot(all(is.finite(ci)))
      grid <- seq(0,max(ci[3],f$sigma2[j]*1.5,1e-8),length.out=9)
      pr <- profile(fp,sigma2=j,steps=grid,plot=FALSE,progbar=FALSE)
      stopifnot(all(is.finite(pr$ll)))
      list(estimate=unname(f$sigma2[j]),lower=unname(ci[2]),upper=unname(ci[3]),x=as.list(grid),ll=as.list(pr$ll),control=fp$control)
    })
    list(status='ok',rows=nrow(d),clusters=length(unique(d$cluster)),robust=robust,
      logLik=as.numeric(logLik(f)),profiles=profiles)
  },warning=function(w){warnings<<-c(warnings,conditionMessage(w));invokeRestart('muffleWarning')}),error=function(e)list(status='reference error',reason=conditionMessage(e)))
  result[[name]] <- c(answer,list(warnings=as.list(unique(warnings)),source=old[[name]][c('dataset','cluster','reason','original_rows','omitted_rows')]))
  save(result,'validate/plus-corpus/reference-plus.json')
  cat('DONE',name,answer$status,'\n');flush.console()
}
save(list(R=R.version.string,packages=setNames(lapply(c('metafor','metadat','clubSandwich','jsonlite'),function(p)as.character(packageVersion(p))),c('metafor','metadat','clubSandwich','jsonlite')),candidates=nrow(inventory),included=sum(inventory$status=='used'),configurations=length(result)), 'validate/plus-corpus/environment-plus.json')
