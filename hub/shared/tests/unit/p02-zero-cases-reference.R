# Run from the worktree root. Constructed regression data, not clinical evidence.
# The equal-variance fixed fit makes the reported sign reversal reproducible.
suppressPackageStartupMessages(library(dosresmeta))
library(jsonlite)
d <- data.frame(id=rep(c('A','B','zero-category'), each=2),
  dose=rep(0:1,3), cases=c(10,12,10,12,10,0), n=100,
  logrr=c(0,.0227,0,.0227,0,-.1843), se=rep(c(0,.5),3), type='cc')
results <- list()
for (type in c('cc','ci','ir')) for (position in c('nonreference','reference')) {
  x <- d; x$type <- type
  if (position == 'reference') x$cases[5:6] <- c(0,10)
  for (covariance in c('gl','h','user')) for (proc in c('2stage','1stage')) {
    warnings <- character()
    fit <- withCallingHandlers(tryCatch({
      args <- list(formula=logrr~dose, id=x$id, type=x$type, se=x$se,
        cases=x$cases, n=x$n, data=x, covariance=covariance, proc=proc, method='fixed')
      if (covariance == 'user') args$Slist <- rep(list(matrix(.25)),3)
      do.call(dosresmeta,args)
    },error=identity), warning=function(w) { warnings <<- c(warnings,conditionMessage(w)); invokeRestart('muffleWarning') })
    ok <- !inherits(fit,'error')
    results[[length(results)+1]] <- list(name=paste(type,position,covariance,proc,sep='/'),
      rows=x, covariance=if(covariance=='user') 'indep' else covariance,
      R_covariance=covariance, proc=proc, method='fixed', model='linear', ok=ok,
      slope=if(ok) unname(coef(fit)[1]) else NULL,
      se=if(ok) unname(sqrt(vcov(fit)[1,1])) else NULL,
      warnings=as.list(warnings), error=if(!ok) conditionMessage(fit) else NULL)
  }
}
dropped <- dosresmeta(logrr~dose,id=id,type=type,se=se,cases=cases,n=n,
  data=d[d$id!='zero-category',],covariance='h',proc='2stage',method='fixed')
out <- list(dropped_study_control=list(slope=unname(coef(dropped)[1]), se=unname(sqrt(vcov(dropped)[1,1]))), dataset='constructed-zero-category-sign-reversal',
  disclosure='Constructed regression fixture; not the unidentified original user dataset. No continuity correction applied.',
  R=R.version.string, dosresmeta=as.character(packageVersion('dosresmeta')),
  mixmeta=as.character(packageVersion('mixmeta')), cases=results)
write_json(out,'hub/shared/tests/unit/p02-zero-cases-reference.json',auto_unbox=TRUE, digits=NA, pretty=TRUE, null='null')
for(r in results) cat(r$name, r$ok, r$slope, r$se, r$error, '\n')
