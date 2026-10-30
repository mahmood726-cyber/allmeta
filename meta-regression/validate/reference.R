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
  # Fit in informative-study units so absolute optimizer defaults are unit-independent.
  unit <- sqrt(min(v))
  fit <- function(M) metafor::rma(yi=y/unit,vi=v/unit^2,mods=M[,-1,drop=FALSE],method='ML',test='z',control=list(threshold=1e-12,maxiter=10000,stepadj=.5))
  tryCatch({
    full<-fit(X); reducedX<-if(isTRUE(c$interaction)) X[,-ncol(X),drop=FALSE] else X[,1:2,drop=FALSE]
    reduced<-fit(reducedX)
    values<-function(m) list(k=unname(m$k),p=unname(m$p),tau2=unname(m$tau2)*unit^2,beta=as.numeric(m$b)*unit,se=as.numeric(m$se)*unit,z=as.numeric(m$zval),pval=as.numeric(m$pval),ciLo=as.numeric(m$ci.lb)*unit,ciHi=as.numeric(m$ci.ub)*unit,logLik=as.numeric(logLik(m))-length(y)*log(unit),AIC=unname(AIC(m))+2*length(y)*log(unit),BIC=unname(BIC(m))+2*length(y)*log(unit))
    grid<-seq(min(z[,1]),max(z[,1]),length.out=41)
    newz<-matrix(rep(colMeans(z),each=41),nrow=41);newz[,1]<-grid
    if(isTRUE(c$interaction)) newz<-cbind(newz,newz[,1]*newz[,2])
    pred<-predict(full,newmods=newz)
    a<-anova(reduced,full)
    list(status='ok',terms=terms,reducedTerms=terms[seq_len(ncol(reducedX))],full=values(full),reduced=values(reduced),comparison=list(LRT=unname(a$LRT),df=unname(full$p-reduced$p),pval=unname(a$pval)),plot=list(x=grid,pred=as.numeric(pred$pred)*unit,se=as.numeric(pred$se)*unit,ciLo=as.numeric(pred$ci.lb)*unit,ciHi=as.numeric(pred$ci.ub)*unit,weights=as.numeric(weights(full)),held=I(as.numeric(colMeans(z)[-1]))))
  },error=function(e) list(status='refused',reason=conditionMessage(e)))
}
