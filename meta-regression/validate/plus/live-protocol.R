# Shared desktop/live reference. No JavaScript estimates enter this calculation.
plus_reference <- function(c) {
  y <- unlist(c$yi); v <- unlist(c$vi)
  z <- do.call(rbind, c$mods); if(is.null(dim(z))) z <- matrix(z,ncol=1)
  nm <- unlist(c$names)
  if(length(y)!=length(v)||nrow(z)!=length(y)||any(!is.finite(c(y,v,z)))||any(v<=0)) stop('Invalid input rows')
  terms <- c('intercept',nm)
  X <- cbind(1,z)
  if(isTRUE(c$interaction)) { X<-cbind(X,z[,1]*z[,2]); terms<-c(terms,paste(nm[1:2],collapse=':')) }
  if(nrow(X)<=ncol(X)) return(list(status='refused',reason='Need more studies than coefficients'))
  # Standardise columns for a scale-independent rank check and stable inversion.
  Z <- scale(X[,-1,drop=FALSE]); Z[!is.finite(Z)]<-0
  if(qr(cbind(1,Z),tol=1e-10)$rank<ncol(X)) return(list(status='refused',reason='Moderator design is rank deficient'))
  fit <- function(M) metafor::rma(yi=y,vi=v,mods=M[,-1,drop=FALSE],method='ML',test='z',control=list(threshold=1e-12*max(1,var(y)),maxiter=10000,stepadj=.5))
  tryCatch({
    full<-fit(X); reducedX<-if(isTRUE(c$interaction)) X[,-ncol(X),drop=FALSE] else X[,1:2,drop=FALSE]
    reduced<-fit(reducedX)
    values<-function(m) list(k=unname(m$k),p=unname(m$p),tau2=unname(m$tau2),beta=as.numeric(m$b),se=as.numeric(m$se),z=as.numeric(m$zval),pval=as.numeric(m$pval),ciLo=as.numeric(m$ci.lb),ciHi=as.numeric(m$ci.ub),logLik=as.numeric(logLik(m)),AIC=unname(AIC(m)),BIC=unname(BIC(m)))
    grid<-seq(min(z[,1]),max(z[,1]),length.out=41)
    newz<-matrix(rep(colMeans(z),each=41),nrow=41);newz[,1]<-grid
    if(isTRUE(c$interaction)) newz<-cbind(newz,newz[,1]*newz[,2])
    pred<-predict(full,newmods=newz)
    a<-anova(reduced,full)
    list(status='ok',terms=terms,reducedTerms=terms[seq_len(ncol(reducedX))],full=values(full),reduced=values(reduced),comparison=list(LRT=unname(a$LRT),df=unname(full$p-reduced$p),pval=unname(a$pval)),plot=list(x=grid,pred=as.numeric(pred$pred),se=as.numeric(pred$se),ciLo=as.numeric(pred$ci.lb),ciHi=as.numeric(pred$ci.ub),weights=as.numeric(weights(full)),held=I(as.numeric(colMeans(z)[-1]))))
  },error=function(e) list(status='refused',reason=conditionMessage(e)))
}

c <- list(yi=c(2.67906266422896,-2.10900034392138,0.205621200622007,-0.115372151072073,-0.291758165051824,-0.307100158308883,-0.318453731118534,-0.451985123743057,-0.201343158141798,0.138103038147341,-0.622366998498898,-0.302280871872934,-0.268889573102414,-0.103598400664427,-2.05045400480658,-0.353987064878458,0.162846024433893,0.358305558208826,-0.974335723701178,-0.679654500515471,1.37624402526639,0.0431721718652085,-0.336472236621213,-0.073508419343173,-0.0440168854167744,-0.35814121986126,-1.38629436111989,-0.974314571990533,-0.141078598259906,-0.906138360410137,0.0373875320716204,-0.411937622613782,-0.326915973954474,0.148959046507098),vi=c(2.04026610644258,1.10529126213592,0.12273604531669,0.0388894819875924,0.0283168918477153,0.18746857717446,0.122727272727273,0.199168019480519,0.044512124927594,0.0371779530567072,0.041845557543232,0.0295447881044069,0.0154734862571732,0.00999826847797022,1.09600840336134,0.0124120511368399,0.0505297796863331,0.0563984885455706,0.451839758388413,0.304539888756028,2.59636363636364,1.97120961060481,0.30952380952381,0.025744421381637,0.0116507177033493,0.0490354045563143,1.21078431372549,1.30564043799338,3.94338118022329,0.679694908266337,0.981301878549585,0.820388213936601,0.0583945269556427,0.0176880903793642),mods=list(c(1960,0),c(1960,0),c(1961,0),c(1961,0),c(1964,0),c(1964,0),c(1966,0),c(1967,0),c(1967,0),c(1969,0),c(1969,0),c(1980,0),c(1990,0),c(1994,0),c(1969,0),c(1974,0),c(1980,0),c(1980,1),c(1993,1),c(1996,1),c(1990,1),c(1982,1),c(1981,1),c(1982,1),c(1969,0),c(1964,0),c(1986,0),c(1982,0),c(1990,1),c(1998,1),c(1994,1),c(1998,1),c(1997,1),c(1997,1)),names=c("year","asp.c"),interaction=FALSE)
print(.libPaths()); for(p in c('metafor')) cat(p,as.character(packageVersion(p)),'\n')
r <- plus_reference(c)
out <- list()
flat <- function(x,key='') {
 if(is.list(x)) { for(n in names(x)) flat(x[[n]],if(nchar(key))paste(key,n,sep='.') else n) }
 else if(length(x)>1 || inherits(x,'AsIs') || grepl('\\.(beta|se|z|pval|ciLo|ciHi|x|pred|weights|held)$',key) && key!='comparison.pval' || key %in% c('terms','reducedTerms')) {
  out[[paste0(key,'.length')]] <<- length(x); for(i in seq_along(x))out[[paste0(key,'.',i-1)]] <<- x[i]
 } else out[[key]] <<- x
}
flat(r)
encode <- function(v) {if(is.character(v)) paste0('"',gsub('"','\\"',v,fixed=TRUE),'"') else if(is.finite(v))sprintf('%.17g',v) else stop('Nonfinite R result')}
cat('ALMJSON:{',paste(paste0('"',names(out),'":',vapply(out,encode,'')),collapse=','),'}\n',sep='')

# Shared desktop/live reference. No JavaScript estimates enter this calculation.
plus_reference <- function(c) {
  y <- unlist(c$yi); v <- unlist(c$vi)
  z <- do.call(rbind, c$mods); if(is.null(dim(z))) z <- matrix(z,ncol=1)
  nm <- unlist(c$names)
  if(length(y)!=length(v)||nrow(z)!=length(y)||any(!is.finite(c(y,v,z)))||any(v<=0)) stop('Invalid input rows')
  terms <- c('intercept',nm)
  X <- cbind(1,z)
  if(isTRUE(c$interaction)) { X<-cbind(X,z[,1]*z[,2]); terms<-c(terms,paste(nm[1:2],collapse=':')) }
  if(nrow(X)<=ncol(X)) return(list(status='refused',reason='Need more studies than coefficients'))
  # Standardise columns for a scale-independent rank check and stable inversion.
  Z <- scale(X[,-1,drop=FALSE]); Z[!is.finite(Z)]<-0
  if(qr(cbind(1,Z),tol=1e-10)$rank<ncol(X)) return(list(status='refused',reason='Moderator design is rank deficient'))
  fit <- function(M) metafor::rma(yi=y,vi=v,mods=M[,-1,drop=FALSE],method='ML',test='z',control=list(threshold=1e-12*max(1,var(y)),maxiter=10000,stepadj=.5))
  tryCatch({
    full<-fit(X); reducedX<-if(isTRUE(c$interaction)) X[,-ncol(X),drop=FALSE] else X[,1:2,drop=FALSE]
    reduced<-fit(reducedX)
    values<-function(m) list(k=unname(m$k),p=unname(m$p),tau2=unname(m$tau2),beta=as.numeric(m$b),se=as.numeric(m$se),z=as.numeric(m$zval),pval=as.numeric(m$pval),ciLo=as.numeric(m$ci.lb),ciHi=as.numeric(m$ci.ub),logLik=as.numeric(logLik(m)),AIC=unname(AIC(m)),BIC=unname(BIC(m)))
    grid<-seq(min(z[,1]),max(z[,1]),length.out=41)
    newz<-matrix(rep(colMeans(z),each=41),nrow=41);newz[,1]<-grid
    if(isTRUE(c$interaction)) newz<-cbind(newz,newz[,1]*newz[,2])
    pred<-predict(full,newmods=newz)
    a<-anova(reduced,full)
    list(status='ok',terms=terms,reducedTerms=terms[seq_len(ncol(reducedX))],full=values(full),reduced=values(reduced),comparison=list(LRT=unname(a$LRT),df=unname(full$p-reduced$p),pval=unname(a$pval)),plot=list(x=grid,pred=as.numeric(pred$pred),se=as.numeric(pred$se),ciLo=as.numeric(pred$ci.lb),ciHi=as.numeric(pred$ci.ub),weights=as.numeric(weights(full)),held=I(as.numeric(colMeans(z)[-1]))))
  },error=function(e) list(status='refused',reason=conditionMessage(e)))
}

c <- list(yi=c(2.67906266422896,-2.10900034392138,0.205621200622007,-0.115372151072073,-0.291758165051824,-0.307100158308883,-0.318453731118534,-0.451985123743057,-0.201343158141798,0.138103038147341,-0.622366998498898,-0.302280871872934,-0.268889573102414,-0.103598400664427,-2.05045400480658,-0.353987064878458,0.162846024433893,0.358305558208826,-0.974335723701178,-0.679654500515471,1.37624402526639,0.0431721718652085,-0.336472236621213,-0.073508419343173,-0.0440168854167744,-0.35814121986126,-1.38629436111989,-0.974314571990533,-0.141078598259906,-0.906138360410137,0.0373875320716204,-0.411937622613782,-0.326915973954474,0.148959046507098),vi=c(2.04026610644258,1.10529126213592,0.12273604531669,0.0388894819875924,0.0283168918477153,0.18746857717446,0.122727272727273,0.199168019480519,0.044512124927594,0.0371779530567072,0.041845557543232,0.0295447881044069,0.0154734862571732,0.00999826847797022,1.09600840336134,0.0124120511368399,0.0505297796863331,0.0563984885455706,0.451839758388413,0.304539888756028,2.59636363636364,1.97120961060481,0.30952380952381,0.025744421381637,0.0116507177033493,0.0490354045563143,1.21078431372549,1.30564043799338,3.94338118022329,0.679694908266337,0.981301878549585,0.820388213936601,0.0583945269556427,0.0176880903793642),mods=list(c(1960,0),c(1960,0),c(1961,0),c(1961,0),c(1964,0),c(1964,0),c(1966,0),c(1967,0),c(1967,0),c(1969,0),c(1969,0),c(1980,0),c(1990,0),c(1994,0),c(1969,0),c(1974,0),c(1980,0),c(1980,1),c(1993,1),c(1996,1),c(1990,1),c(1982,1),c(1981,1),c(1982,1),c(1969,0),c(1964,0),c(1986,0),c(1982,0),c(1990,1),c(1998,1),c(1994,1),c(1998,1),c(1997,1),c(1997,1)),names=c("year","asp.c"),interaction=TRUE)
print(.libPaths()); for(p in c('metafor')) cat(p,as.character(packageVersion(p)),'\n')
r <- plus_reference(c)
out <- list()
flat <- function(x,key='') {
 if(is.list(x)) { for(n in names(x)) flat(x[[n]],if(nchar(key))paste(key,n,sep='.') else n) }
 else if(length(x)>1 || inherits(x,'AsIs') || grepl('\\.(beta|se|z|pval|ciLo|ciHi|x|pred|weights|held)$',key) && key!='comparison.pval' || key %in% c('terms','reducedTerms')) {
  out[[paste0(key,'.length')]] <<- length(x); for(i in seq_along(x))out[[paste0(key,'.',i-1)]] <<- x[i]
 } else out[[key]] <<- x
}
flat(r)
encode <- function(v) {if(is.character(v)) paste0('"',gsub('"','\\"',v,fixed=TRUE),'"') else if(is.finite(v))sprintf('%.17g',v) else stop('Nonfinite R result')}
cat('ALMJSON:{',paste(paste0('"',names(out),'":',vapply(out,encode,'')),collapse=','),'}\n',sep='')

# Shared desktop/live reference. No JavaScript estimates enter this calculation.
plus_reference <- function(c) {
  y <- unlist(c$yi); v <- unlist(c$vi)
  z <- do.call(rbind, c$mods); if(is.null(dim(z))) z <- matrix(z,ncol=1)
  nm <- unlist(c$names)
  if(length(y)!=length(v)||nrow(z)!=length(y)||any(!is.finite(c(y,v,z)))||any(v<=0)) stop('Invalid input rows')
  terms <- c('intercept',nm)
  X <- cbind(1,z)
  if(isTRUE(c$interaction)) { X<-cbind(X,z[,1]*z[,2]); terms<-c(terms,paste(nm[1:2],collapse=':')) }
  if(nrow(X)<=ncol(X)) return(list(status='refused',reason='Need more studies than coefficients'))
  # Standardise columns for a scale-independent rank check and stable inversion.
  Z <- scale(X[,-1,drop=FALSE]); Z[!is.finite(Z)]<-0
  if(qr(cbind(1,Z),tol=1e-10)$rank<ncol(X)) return(list(status='refused',reason='Moderator design is rank deficient'))
  fit <- function(M) metafor::rma(yi=y,vi=v,mods=M[,-1,drop=FALSE],method='ML',test='z',control=list(threshold=1e-12*max(1,var(y)),maxiter=10000,stepadj=.5))
  tryCatch({
    full<-fit(X); reducedX<-if(isTRUE(c$interaction)) X[,-ncol(X),drop=FALSE] else X[,1:2,drop=FALSE]
    reduced<-fit(reducedX)
    values<-function(m) list(k=unname(m$k),p=unname(m$p),tau2=unname(m$tau2),beta=as.numeric(m$b),se=as.numeric(m$se),z=as.numeric(m$zval),pval=as.numeric(m$pval),ciLo=as.numeric(m$ci.lb),ciHi=as.numeric(m$ci.ub),logLik=as.numeric(logLik(m)),AIC=unname(AIC(m)),BIC=unname(BIC(m)))
    grid<-seq(min(z[,1]),max(z[,1]),length.out=41)
    newz<-matrix(rep(colMeans(z),each=41),nrow=41);newz[,1]<-grid
    if(isTRUE(c$interaction)) newz<-cbind(newz,newz[,1]*newz[,2])
    pred<-predict(full,newmods=newz)
    a<-anova(reduced,full)
    list(status='ok',terms=terms,reducedTerms=terms[seq_len(ncol(reducedX))],full=values(full),reduced=values(reduced),comparison=list(LRT=unname(a$LRT),df=unname(full$p-reduced$p),pval=unname(a$pval)),plot=list(x=grid,pred=as.numeric(pred$pred),se=as.numeric(pred$se),ciLo=as.numeric(pred$ci.lb),ciHi=as.numeric(pred$ci.ub),weights=as.numeric(weights(full)),held=I(as.numeric(colMeans(z)[-1]))))
  },error=function(e) list(status='refused',reason=conditionMessage(e)))
}

c <- list(yi=c(2.67906266422896,-2.10900034392138,0.205621200622007,-0.115372151072073,-0.291758165051824,-0.307100158308883,-0.318453731118534,-0.451985123743057,-0.201343158141798,0.138103038147341,-0.622366998498898,-0.302280871872934,-0.268889573102414,-0.103598400664427,-2.05045400480658,-0.353987064878458,0.162846024433893,0.358305558208826,-0.974335723701178,-0.679654500515471,1.37624402526639,0.0431721718652085,-0.336472236621213,-0.073508419343173,-0.0440168854167744,-0.35814121986126,-1.38629436111989,-0.974314571990533,-0.141078598259906,-0.906138360410137,0.0373875320716204,-0.411937622613782,-0.326915973954474,0.148959046507098),vi=c(2.04026610644258,1.10529126213592,0.12273604531669,0.0388894819875924,0.0283168918477153,0.18746857717446,0.122727272727273,0.199168019480519,0.044512124927594,0.0371779530567072,0.041845557543232,0.0295447881044069,0.0154734862571732,0.00999826847797022,1.09600840336134,0.0124120511368399,0.0505297796863331,0.0563984885455706,0.451839758388413,0.304539888756028,2.59636363636364,1.97120961060481,0.30952380952381,0.025744421381637,0.0116507177033493,0.0490354045563143,1.21078431372549,1.30564043799338,3.94338118022329,0.679694908266337,0.981301878549585,0.820388213936601,0.0583945269556427,0.0176880903793642),mods=list(c(1960,0,0),c(1960,0,0),c(1961,0,0),c(1961,0,0),c(1964,0,0),c(1964,0,0),c(1966,0,0),c(1967,0,0),c(1967,0,0),c(1969,0,0),c(1969,0,0),c(1980,0,0),c(1990,0,0),c(1994,0,0),c(1969,0,0),c(1974,0,0),c(1980,0,0),c(1980,1,0),c(1993,1,0),c(1996,1,0),c(1990,1,0),c(1982,1,0),c(1981,1,0),c(1982,1,0),c(1969,0,0),c(1964,0,0),c(1986,0,0),c(1982,0,0),c(1990,1,1),c(1998,1,1),c(1994,1,1),c(1998,1,1),c(1997,1,1),c(1997,1,1)),names=c("year","asp.c","asp.t"),interaction=FALSE)
print(.libPaths()); for(p in c('metafor')) cat(p,as.character(packageVersion(p)),'\n')
r <- plus_reference(c)
out <- list()
flat <- function(x,key='') {
 if(is.list(x)) { for(n in names(x)) flat(x[[n]],if(nchar(key))paste(key,n,sep='.') else n) }
 else if(length(x)>1 || inherits(x,'AsIs') || grepl('\\.(beta|se|z|pval|ciLo|ciHi|x|pred|weights|held)$',key) && key!='comparison.pval' || key %in% c('terms','reducedTerms')) {
  out[[paste0(key,'.length')]] <<- length(x); for(i in seq_along(x))out[[paste0(key,'.',i-1)]] <<- x[i]
 } else out[[key]] <<- x
}
flat(r)
encode <- function(v) {if(is.character(v)) paste0('"',gsub('"','\\"',v,fixed=TRUE),'"') else if(is.finite(v))sprintf('%.17g',v) else stop('Nonfinite R result')}
cat('ALMJSON:{',paste(paste0('"',names(out),'":',vapply(out,encode,'')),collapse=','),'}\n',sep='')

# Shared desktop/live reference. No JavaScript estimates enter this calculation.
plus_reference <- function(c) {
  y <- unlist(c$yi); v <- unlist(c$vi)
  z <- do.call(rbind, c$mods); if(is.null(dim(z))) z <- matrix(z,ncol=1)
  nm <- unlist(c$names)
  if(length(y)!=length(v)||nrow(z)!=length(y)||any(!is.finite(c(y,v,z)))||any(v<=0)) stop('Invalid input rows')
  terms <- c('intercept',nm)
  X <- cbind(1,z)
  if(isTRUE(c$interaction)) { X<-cbind(X,z[,1]*z[,2]); terms<-c(terms,paste(nm[1:2],collapse=':')) }
  if(nrow(X)<=ncol(X)) return(list(status='refused',reason='Need more studies than coefficients'))
  # Standardise columns for a scale-independent rank check and stable inversion.
  Z <- scale(X[,-1,drop=FALSE]); Z[!is.finite(Z)]<-0
  if(qr(cbind(1,Z),tol=1e-10)$rank<ncol(X)) return(list(status='refused',reason='Moderator design is rank deficient'))
  fit <- function(M) metafor::rma(yi=y,vi=v,mods=M[,-1,drop=FALSE],method='ML',test='z',control=list(threshold=1e-12*max(1,var(y)),maxiter=10000,stepadj=.5))
  tryCatch({
    full<-fit(X); reducedX<-if(isTRUE(c$interaction)) X[,-ncol(X),drop=FALSE] else X[,1:2,drop=FALSE]
    reduced<-fit(reducedX)
    values<-function(m) list(k=unname(m$k),p=unname(m$p),tau2=unname(m$tau2),beta=as.numeric(m$b),se=as.numeric(m$se),z=as.numeric(m$zval),pval=as.numeric(m$pval),ciLo=as.numeric(m$ci.lb),ciHi=as.numeric(m$ci.ub),logLik=as.numeric(logLik(m)),AIC=unname(AIC(m)),BIC=unname(BIC(m)))
    grid<-seq(min(z[,1]),max(z[,1]),length.out=41)
    newz<-matrix(rep(colMeans(z),each=41),nrow=41);newz[,1]<-grid
    if(isTRUE(c$interaction)) newz<-cbind(newz,newz[,1]*newz[,2])
    pred<-predict(full,newmods=newz)
    a<-anova(reduced,full)
    list(status='ok',terms=terms,reducedTerms=terms[seq_len(ncol(reducedX))],full=values(full),reduced=values(reduced),comparison=list(LRT=unname(a$LRT),df=unname(full$p-reduced$p),pval=unname(a$pval)),plot=list(x=grid,pred=as.numeric(pred$pred),se=as.numeric(pred$se),ciLo=as.numeric(pred$ci.lb),ciHi=as.numeric(pred$ci.ub),weights=as.numeric(weights(full)),held=I(as.numeric(colMeans(z)[-1]))))
  },error=function(e) list(status='refused',reason=conditionMessage(e)))
}

c <- list(yi=c(2.67906266422896,-2.10900034392138,0.205621200622007,-0.115372151072073,-0.291758165051824,-0.307100158308883,-0.318453731118534,-0.451985123743057,-0.201343158141798,0.138103038147341,-0.622366998498898,-0.302280871872934,-0.268889573102414,-0.103598400664427,-2.05045400480658,-0.353987064878458,0.162846024433893,0.358305558208826,-0.974335723701178,-0.679654500515471,1.37624402526639,0.0431721718652085,-0.336472236621213,-0.073508419343173,-0.0440168854167744,-0.35814121986126,-1.38629436111989,-0.974314571990533,-0.141078598259906,-0.906138360410137,0.0373875320716204,-0.411937622613782,-0.326915973954474,0.148959046507098),vi=c(2.04026610644258,1.10529126213592,0.12273604531669,0.0388894819875924,0.0283168918477153,0.18746857717446,0.122727272727273,0.199168019480519,0.044512124927594,0.0371779530567072,0.041845557543232,0.0295447881044069,0.0154734862571732,0.00999826847797022,1.09600840336134,0.0124120511368399,0.0505297796863331,0.0563984885455706,0.451839758388413,0.304539888756028,2.59636363636364,1.97120961060481,0.30952380952381,0.025744421381637,0.0116507177033493,0.0490354045563143,1.21078431372549,1.30564043799338,3.94338118022329,0.679694908266337,0.981301878549585,0.820388213936601,0.0583945269556427,0.0176880903793642),mods=list(c(1960,0,0),c(1960,0,0),c(1961,0,0),c(1961,0,0),c(1964,0,0),c(1964,0,0),c(1966,0,0),c(1967,0,0),c(1967,0,0),c(1969,0,0),c(1969,0,0),c(1980,0,0),c(1990,0,0),c(1994,0,0),c(1969,0,0),c(1974,0,0),c(1980,0,0),c(1980,1,0),c(1993,1,0),c(1996,1,0),c(1990,1,0),c(1982,1,0),c(1981,1,0),c(1982,1,0),c(1969,0,0),c(1964,0,0),c(1986,0,0),c(1982,0,0),c(1990,1,1),c(1998,1,1),c(1994,1,1),c(1998,1,1),c(1997,1,1),c(1997,1,1)),names=c("year","asp.c","asp.t"),interaction=TRUE)
print(.libPaths()); for(p in c('metafor')) cat(p,as.character(packageVersion(p)),'\n')
r <- plus_reference(c)
out <- list()
flat <- function(x,key='') {
 if(is.list(x)) { for(n in names(x)) flat(x[[n]],if(nchar(key))paste(key,n,sep='.') else n) }
 else if(length(x)>1 || inherits(x,'AsIs') || grepl('\\.(beta|se|z|pval|ciLo|ciHi|x|pred|weights|held)$',key) && key!='comparison.pval' || key %in% c('terms','reducedTerms')) {
  out[[paste0(key,'.length')]] <<- length(x); for(i in seq_along(x))out[[paste0(key,'.',i-1)]] <<- x[i]
 } else out[[key]] <<- x
}
flat(r)
encode <- function(v) {if(is.character(v)) paste0('"',gsub('"','\\"',v,fixed=TRUE),'"') else if(is.finite(v))sprintf('%.17g',v) else stop('Nonfinite R result')}
cat('ALMJSON:{',paste(paste0('"',names(out),'":',vapply(out,encode,'')),collapse=','),'}\n',sep='')

# Shared desktop/live reference. No JavaScript estimates enter this calculation.
plus_reference <- function(c) {
  y <- unlist(c$yi); v <- unlist(c$vi)
  z <- do.call(rbind, c$mods); if(is.null(dim(z))) z <- matrix(z,ncol=1)
  nm <- unlist(c$names)
  if(length(y)!=length(v)||nrow(z)!=length(y)||any(!is.finite(c(y,v,z)))||any(v<=0)) stop('Invalid input rows')
  terms <- c('intercept',nm)
  X <- cbind(1,z)
  if(isTRUE(c$interaction)) { X<-cbind(X,z[,1]*z[,2]); terms<-c(terms,paste(nm[1:2],collapse=':')) }
  if(nrow(X)<=ncol(X)) return(list(status='refused',reason='Need more studies than coefficients'))
  # Standardise columns for a scale-independent rank check and stable inversion.
  Z <- scale(X[,-1,drop=FALSE]); Z[!is.finite(Z)]<-0
  if(qr(cbind(1,Z),tol=1e-10)$rank<ncol(X)) return(list(status='refused',reason='Moderator design is rank deficient'))
  fit <- function(M) metafor::rma(yi=y,vi=v,mods=M[,-1,drop=FALSE],method='ML',test='z',control=list(threshold=1e-12*max(1,var(y)),maxiter=10000,stepadj=.5))
  tryCatch({
    full<-fit(X); reducedX<-if(isTRUE(c$interaction)) X[,-ncol(X),drop=FALSE] else X[,1:2,drop=FALSE]
    reduced<-fit(reducedX)
    values<-function(m) list(k=unname(m$k),p=unname(m$p),tau2=unname(m$tau2),beta=as.numeric(m$b),se=as.numeric(m$se),z=as.numeric(m$zval),pval=as.numeric(m$pval),ciLo=as.numeric(m$ci.lb),ciHi=as.numeric(m$ci.ub),logLik=as.numeric(logLik(m)),AIC=unname(AIC(m)),BIC=unname(BIC(m)))
    grid<-seq(min(z[,1]),max(z[,1]),length.out=41)
    newz<-matrix(rep(colMeans(z),each=41),nrow=41);newz[,1]<-grid
    if(isTRUE(c$interaction)) newz<-cbind(newz,newz[,1]*newz[,2])
    pred<-predict(full,newmods=newz)
    a<-anova(reduced,full)
    list(status='ok',terms=terms,reducedTerms=terms[seq_len(ncol(reducedX))],full=values(full),reduced=values(reduced),comparison=list(LRT=unname(a$LRT),df=unname(full$p-reduced$p),pval=unname(a$pval)),plot=list(x=grid,pred=as.numeric(pred$pred),se=as.numeric(pred$se),ciLo=as.numeric(pred$ci.lb),ciHi=as.numeric(pred$ci.ub),weights=as.numeric(weights(full)),held=I(as.numeric(colMeans(z)[-1]))))
  },error=function(e) list(status='refused',reason=conditionMessage(e)))
}

c <- list(yi=c(-0.7761,-0.666,-0.2784,-0.1985,-0.0458,-0.227),vi=c(0.23687689,0.09897316,0.01411344,0.01234321,0.00616225,0.01721344),mods=list(c(2009,67),c(2015,70),c(2020,71),c(2022,74),c(2023,69),c(2025,70)),names=c("year","baseline.age"),interaction=TRUE)
print(.libPaths()); for(p in c('metafor')) cat(p,as.character(packageVersion(p)),'\n')
r <- plus_reference(c)
out <- list()
flat <- function(x,key='') {
 if(is.list(x)) { for(n in names(x)) flat(x[[n]],if(nchar(key))paste(key,n,sep='.') else n) }
 else if(length(x)>1 || inherits(x,'AsIs') || grepl('\\.(beta|se|z|pval|ciLo|ciHi|x|pred|weights|held)$',key) && key!='comparison.pval' || key %in% c('terms','reducedTerms')) {
  out[[paste0(key,'.length')]] <<- length(x); for(i in seq_along(x))out[[paste0(key,'.',i-1)]] <<- x[i]
 } else out[[key]] <<- x
}
flat(r)
encode <- function(v) {if(is.character(v)) paste0('"',gsub('"','\\"',v,fixed=TRUE),'"') else if(is.finite(v))sprintf('%.17g',v) else stop('Nonfinite R result')}
cat('ALMJSON:{',paste(paste0('"',names(out),'":',vapply(out,encode,'')),collapse=','),'}\n',sep='')

