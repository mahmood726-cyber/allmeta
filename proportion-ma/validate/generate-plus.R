# Run from proportion-ma/validate. No package installation or network access.
print(.libPaths())
packages <- c('metafor','meta','metadat','lme4','jsonlite')
for (p in packages) {
  if (!requireNamespace(p, quietly=TRUE)) stop('Missing package: ', p)
  cat(p, as.character(packageVersion(p)), '\n')
}
cat(R.version.string, '\n')
root <- normalizePath('.', winslash='/')
stopifnot(file.exists('plus-source.R'))
dir.create('plus-corpus', showWarnings=FALSE)
setwd('plus-corpus')
source(file.path(root, 'plus-source.R'))
# The source recipe inspects every installed metadat catalogue entry and records
# explicit count/denominator mappings, candidate exclusions and omitted rows.
original <- jsonlite::fromJSON(file.path(root,'corpus/corpus.json'), simplifyVector=FALSE)
stopifnot(length(original)==length(corpus))
for (i in seq_along(corpus)) {
  stopifnot(identical(original[[i]]$id, corpus[[i]]$id))
  a <- original[[i]]$rows; b <- corpus[[i]]$rows
  stopifnot(length(a)==length(b))
  for (j in seq_along(a)) for (field in c('x','n','source_row'))
    stopifnot(identical(as.numeric(a[[j]][[field]]), as.numeric(b[[j]][[field]])))
}
cat('Verified current metadat source rows against original corpus:', length(corpus), '\n')
ctrl <- list(glmerCtrl=list(optimizer='bobyqa', optCtrl=list(maxfun=100000L, rhoend=1e-9)))
fields <- function(mu,se,tau2,k) {
  ci <- mu+c(-1,1)*qnorm(.975)*se
  pi <- if(k>=3) mu+c(-1,1)*qt(.975,k-1)*sqrt(tau2+se^2) else c(NA_real_,NA_real_)
  list(k=k,mu=mu,se=se,tau2=tau2,estimate=plogis(mu),ciLo=plogis(ci[1]),ciHi=plogis(ci[2]),piLo=plogis(pi[1]),piHi=plogis(pi[2]))
}
fit <- function(ca, backend) {
  x <- vapply(ca$rows,function(z)z$x,0); n <- vapply(ca$rows,function(z)z$n,0)
  warnings <- character()
  ans <- tryCatch(withCallingHandlers({
    if(length(x)<2) stop('insufficient_studies')
    if(all(x==0)||all(x==n)) stop('boundary_unidentifiable')
    if(backend=='metafor') {
      f <- metafor::rma.glmm(measure='PLO',xi=x,ni=n,method='ML',test='z',nAGQ=7,control=ctrl)
      value <- fields(as.numeric(coef(f)),as.numeric(f$se),f$tau2,length(x))
    } else {
      f <- meta::metaprop(event=x,n=n,sm='PLOGIT',method='GLMM',method.tau='ML',method.random.ci='classic',nAGQ=7,control=ctrl)
      value <- fields(f$TE.random,f$seTE.random,f$tau2,length(x))
    }
    if(any(grepl('converg|Hessian|identif|gradient|fallback|Cannot fit',warnings,ignore.case=TRUE))) stop('nonconvergence')
    required <- unlist(value[c('mu','se','tau2','estimate','ciLo','ciHi')])
    if(any(!is.finite(required))||value$se<=0||value$tau2<0) stop('nonfinite_fit')
    list(status='ok',values=value)
  },warning=function(w){warnings<<-c(warnings,conditionMessage(w));invokeRestart('muffleWarning')}),
  error=function(e) {
    detail <- conditionMessage(e)
    reason <- if(detail %in% c('insufficient_studies','boundary_unidentifiable','nonfinite_fit')) detail else 'nonconvergence'
    list(status='refused',reason=reason,detail=detail)
  })
  ans$warnings <- as.list(warnings)
  ans
}
reference <- list(); comparison <- list(); checks <- 0L; passed <- 0L
for (ca in corpus) {
  a <- fit(ca,'metafor'); b <- fit(ca,'meta')
  reference[[ca$id]] <- list(metafor=a,meta=b)
  rows <- list(list(field='status',pass=identical(a$status,b$status)))
  if(a$status=='ok'&&b$status=='ok') for (field in names(a$values)) {
    av<-a$values[[field]]; bv<-b$values[[field]]
    difference<-if(is.na(av)&&is.na(bv)) 0 else abs(av-bv)/max(1,abs(bv))
    rows[[length(rows)+1]]<-list(field=field,pass=is.finite(difference)&&difference<=if(field=='k')0 else 1e-6,difference=difference)
  }
  if(a$status=='refused'&&b$status=='refused') rows[[length(rows)+1]]<-list(field='reason',pass=identical(a$reason,b$reason))
  comparison[[ca$id]]<-rows
  checks<-checks+length(rows); passed<-passed+sum(vapply(rows,function(z)isTRUE(z$pass),TRUE))
  cat(ca$id, a$status, b$status, '\n')
}
writeLines(js(reference),'reference-plus.json',useBytes=TRUE)
writeLines(js(list(checks=checks,passed=passed,failed=checks-passed,comparisons=comparison)),'comparison-plus.json',useBytes=TRUE)
writeLines(js(list(R=R.version.string,packages=setNames(lapply(packages,function(p)as.character(packageVersion(p))),packages),nAGQ=7,control=ctrl,pi='t_(k-1), omitted for k<3',iterative_tolerance=1e-6)),'versions-plus.json',useBytes=TRUE)
cat('Cross-package checks:',checks,'passed:',passed,'failed:',checks-passed,'\n')
if(checks!=passed) stop('Cross-package comparison failed; not validated')
