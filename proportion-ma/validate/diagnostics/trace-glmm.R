print(.libPaths())
for(p in c('metafor','lme4','numDeriv',if(requireNamespace('meta',quietly=TRUE)) 'meta')) cat(p,as.character(packageVersion(p)),'\n')
options(digits=17)
stages <- list(); .diagFit <- NULL
trace('optwrap',where=asNamespace('lme4'),print=FALSE,tracer=quote(.diagStart <- par+0),exit=quote({
 stages[[length(stages)+1L]] <<- list(start=.diagStart,control=control,par=opt$par,value=opt$fval,convergence=opt$convergence,derivs=derivs)
 if(length(opt$par)==2L) finalfn <<- fn
}))
trace('glmer',where=asNamespace('lme4'),print=FALSE,exit=quote({
 .diagFit <<- returnValue()
 cat('GLMER_CONTROL\n'); dput(list(nAGQ=nAGQ,start=start,control=control))
}))
diagnose <- function(x,n,backend='metafor') {
 stages <<- list(); .diagFit <<- NULL; ww <- character()
 ctrl <- list(glmerCtrl=list(optimizer='bobyqa',optCtrl=list(maxfun=100000L,rhoend=1e-9)))
 f <- tryCatch(withCallingHandlers({
  if(backend=='metafor') metafor::rma.glmm(measure='PLO',xi=x,ni=n,method='ML',test='z',nAGQ=7,control=ctrl)
  else meta::metaprop(event=x,n=n,sm='PLOGIT',method='GLMM',method.tau='ML',method.random.ci='classic',nAGQ=7,control=ctrl)
 },warning=function(w){ww<<-c(ww,conditionMessage(w));invokeRestart('muffleWarning')}),error=function(e)conditionMessage(e))
 cat('STAGES\n');dput(stages); cat('WARNINGS\n');dput(ww)
 if(is.character(f)) {dput(f);return(invisible(NULL))}
 cat('FIT\n');dput(if(backend=='metafor')c(mu=coef(f),se=f$se,tau2=f$tau2) else c(mu=f$TE.random,se=f$seTE.random,tau2=f$tau2))
 if(is.null(.diagFit))return(invisible(NULL))
 pp <- c(.diagFit@theta,lme4::fixef(.diagFit)); cat('OPTINFO\n'); dput(.diagFit@optinfo)
 for(h in c(1e-4,1e-3,1e-2)) {
  dd <- lme4:::deriv12(finalfn,pp,delta=h)
  cat('STEP',h,'\n'); dput(dd)
  cat('SE_STEP',h,sqrt(2*solve(dd$Hessian)[2,2]),'\n')
 }
 hh <- numDeriv::hessian(finalfn,pp)
 cat('RICHARDSON\n');dput(hh);cat('SE_RICHARDSON',sqrt(2*solve(hh)[2,2]),'\n')
 if(exists('.diagCommon',inherits=TRUE)) {
  grid <- rbind(.diagCommon,.diagCommon+c(1e-4,0),.diagCommon-c(1e-4,0),.diagCommon+c(0,1e-4),.diagCommon-c(0,1e-4))
  cat('COMMON_PARAMETERS\n');dput(.diagCommon)
  cat('COMMON_OBJECTIVE_GRID\n');dput(apply(grid,1,finalfn),control='digits17')
  cat('COMMON_DERIVATIVES\n');dput(lme4:::deriv12(finalfn,.diagCommon))
 }
 invisible(NULL)
}
