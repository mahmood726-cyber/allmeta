# Run from limit-ma. Local oracle library must precede every other library.
.libPaths(c('../re/Rlib_dta', Sys.getenv('R_LIBS'), .libPaths()))
versions <- vapply(c('metafor','meta','metasens'), function(p) as.character(packageVersion(p)), '')
print(versions)
stopifnot(versions[['metafor']]=='5.2.1', versions[['meta']]=='8.5.0', versions[['metasens']]=='1.5.3')
library(jsonlite)
dir.create('validate/plus', showWarnings=FALSE)
corpus <- fromJSON('validate/corpus/corpus.json', simplifyVector=FALSE)
refuse <- function(reason) list(status='refused',reason=reason)
ok <- function(values) list(status='ok',values=values)
reg <- function(y,s,power) {
  x <- s^power
  if(length(unique(x))<2) return(refuse('singular-design'))
  f <- lm(y~x,weights=1/s^2); z <- summary(f); ci <- confint(f)
  ok(list(mu=unname(coef(f)[1]),slope=unname(coef(f)[2]),se=z$coefficients[1,2],
    ciLo=ci[1,1],ciHi=ci[1,2],t=z$coefficients[1,3],p=z$coefficients[1,4],df=f$df.residual))
}
results <- list()
for(i in seq_along(corpus)) {
  c <- corpus[[i]]; y <- unlist(c$te); s <- unlist(c$se); k <- length(y)
  cat(i,c$id,'\n'); flush.console()
  m <- meta::metagen(y,s,method.tau='DL',method.random.ci='classic',method.tau.ci='')
  r <- list(RE=ok(list(mu=m$TE.random,se=m$seTE.random,ciLo=m$lower.random,ciHi=m$upper.random,tau2=m$tau2)))
  l <- tryCatch(metasens::limitmeta(m,method.adjust='beta0'),error=function(e)e)
  if(inherits(l,'error')) {
    r$limit <- refuse(conditionMessage(l)); r$Qsmall <- r$Qresid <- r$shift <- r$G2 <- r$limit
  } else {
    r$limit <- ok(list(mu=l$TE.adjust,se=l$seTE.adjust,ciLo=l$lower.adjust,ciHi=l$upper.adjust))
    r$Qsmall <- ok(list(statistic=l$Q.small,df=1,p=pchisq(l$Q.small,1,lower.tail=FALSE)))
    r$Qresid <- ok(list(statistic=l$Q.resid,df=k-2,p=pchisq(l$Q.resid,k-2,lower.tail=FALSE)))
    r$shift <- ok(list(value=l$TE.adjust-m$TE.random))
    r$G2 <- if(is.finite(l$G.squared)) ok(list(value=l$G.squared)) else refuse('undefined-G2')
  }
  f <- tryCatch(meta::trimfill(m,type='L',ma.common=TRUE),error=function(e)e)
  r$trimfill <- if(inherits(f,'error')) refuse(conditionMessage(f)) else ok(list(mu=f$TE.random,se=f$seTE.random,
    ciLo=f$lower.random,ciHi=f$upper.random,tau2=f$tau2,k0=f$k0,side=if(f$left)'left' else 'right',
    imputed=unname(as.list(f$TE[f$trimfill])),imputedSE=unname(as.list(f$seTE[f$trimfill]))))
  r$PET <- reg(y,s,1); r$PEESE <- reg(y,s,2)
  r$conditional <- if(r$PET$status!='ok') r$PET else if(abs(r$PET$values$p-.1)<1e-8) refuse('alpha-tie') else
    list(status='ok',branch=if(r$PET$values$p<.1)'PEESE' else 'PET',values=if(r$PET$values$p<.1)r$PEESE$values else r$PET$values)
  r$Egger <- if(k<10) refuse('k-below-10') else {
    e <- meta::metabias(m,method.bias='Egger',k.min=10)
    ok(list(statistic=unname(e$statistic),df=unname(e$df),p=e$pval))
  }
  r$Peters <- refuse('binary-arm-counts-required')
  p <- pnorm(y/s,lower.tail=FALSE)
  r$selection <- if(!any(p<.025)||!any(p>=.025)) refuse('empty-interval') else {
    f <- tryCatch(metafor::selmodel(metafor::rma(y,vi=s^2,method='ML'),type='stepfun',steps=.025),error=function(e)e)
    if(inherits(f,'error')) refuse(conditionMessage(f)) else ok(list(mu=as.numeric(f$beta[1]),tau2=f$tau2,
      delta=f$delta[2],se=f$se[1],ciLo=f$ci.lb[1],ciHi=f$ci.ub[1],logLik=as.numeric(logLik(f))))
  }
  results[[i]] <- list(id=c$id,methods=r)
  write_json(results,'validate/plus/reference.partial.json',auto_unbox=TRUE,digits=NA,pretty=TRUE,null='null',na='null')
}
write_json(corpus,'validate/plus/corpus.json',auto_unbox=TRUE,digits=NA,pretty=TRUE,null='null')
write_json(results,'validate/plus/reference.json',auto_unbox=TRUE,digits=NA,pretty=TRUE,null='null',na='null')
cat('PLUS ORACLE COMPLETE',length(results),'configurations; host',Sys.info()[['nodename']],'\n')
