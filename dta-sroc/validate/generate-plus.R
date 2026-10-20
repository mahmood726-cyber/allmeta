source('allmeta/dta-sroc/validate/preflight-plus.R')
library(mada)
items <- data(package='metadat')$results
inventory <- lapply(seq_len(nrow(items)), function(i) {
 n <- items[i,'Item']; e <- new.env(); data(list=n,package='metadat',envir=e); d<-get(n,e)
 list(dataset=n,title=items[i,'Title'],columns=names(d),included=n %in% c('dat.kearon1998','dat.rivera2025'),reason=if(n %in% c('dat.kearon1998','dat.rivera2025')) 'Documented diagnostic two-by-two data' else 'No documented paired diagnostic two-by-two counts in inspected schema and dataset title')
})
cases <- list(); exclusions <- list()
for(n in c('dat.kearon1998','dat.rivera2025')) {
 data(list=n,package='metadat'); raw<-get(n)
 if(n=='dat.kearon1998') {
 d<-data.frame(TP=raw$tp,FN=raw$np-raw$tp,FP=raw$nn-raw$tn,TN=raw$tn)
 covs<-list(year=raw$year,patients=as.numeric(raw$patients=='symptomatic'))
 } else {
 d<-raw[,c('TP','FN','FP','TN')]; covs<-list(year=raw$Year)
 }
 keep<-complete.cases(d)
 exclusions[[n]]<-list(rows=which(!keep),reason='Missing diagnostic counts; complete cases only',kept=which(keep))
 d<-d[keep,]; stopifnot(all(as.matrix(d)>=0),all(as.matrix(d)==floor(as.matrix(d))))
 for(cn in names(covs)) {
 x<-covs[[cn]][keep]; transformation<-list(centre=mean(x),scale=sd(x),raw=x,rule='(raw - centre) / sample SD'); x<-(x-mean(x))/sd(x); stopifnot(all(is.finite(x)),length(unique(x))>1); d$x<-x
 for(method in c('reml','ml','fixed')) for(cc in c('all','single','none')) {
 id<-paste(n,cn,method,cc,sep='/')
 f<-tryCatch(reitsma(d,formula=cbind(tsens,tfpr)~x,method=method,correction.control=cc,control=list(maxiter=1000,reltol=1e-12)),error=function(e)e)
 entry<-list(id=id,dataset=n,covariate=cn,transformation=transformation,source_rows=which(keep),rows=d,method=method,correction=cc,ok=!inherits(f,'error'))
 if(inherits(f,'error')) {entry$error<-conditionMessage(f); entry$refusal<-'Uncorrected zero cell'; stopifnot(cc=='none',any(as.matrix(d[,1:4])==0))} else {
 if(is.null(f$Psi)) f$Psi<-matrix(0,2,2); b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
 entry$coef<-b; entry$vcov<-unname(V); entry$Psi<-unname(f$Psi); entry$z<-z; entry$p<-2*pnorm(-abs(z)); entry$se<-se; entry$lo<-b-qnorm(.975)*se; entry$hi<-b+qnorm(.975)*se
 entry$converged<-if(is.null(f$converged)) TRUE else f$converged
 entry$predictions<-lapply(unique(c(min(x),mean(x),max(x))),function(at) {
 L<-rbind(c(1,at,0,0),c(0,0,1,at)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); P<-C+f$Psi
 sens<-plogis(mu[1]); fp<-plogis(mu[2])
 regions<-lapply(list(confidence=C,prediction=P),function(S) {
 # Symmetric positive square root, parametrised by a shared angle grid.
 ep<-ellipse::ellipse(S,centre=mu,level=.95)
 delta<-sweep(ep,2,mu); stopifnot(max(abs(rowSums((delta%*%solve(S))*delta)-qchisq(.95,2)))<1e-8)
 rho<-S[1,2]/sqrt(S[1,1]*S[2,2]); theta<-seq(0,2*pi,length.out=101)[-101]
 a<-sqrt(1+rho)*cos(theta); bb<-sqrt(1-rho)*sin(theta)
 cbind(sens=plogis(mu[1]+sqrt(qchisq(.95,2)*S[1,1]/2)*(a+bb)),fpr=plogis(mu[2]+sqrt(qchisq(.95,2)*S[2,2]/2)*(a-bb)))
 })
 list(at=at,sens=sens,spec=1-fp,mu=mu,C=unname(C),regions=regions,post=lapply(c(0,.01,.1,.5,1),function(prev) list(prevalence=prev,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))))
 })
 }
 cases[[length(cases)+1]]<-entry
 }
 }
}
out<-list(R=as.character(getRversion()),mada=as.character(packageVersion('mada')),metadat=as.character(packageVersion('metadat')),inventory=inventory,exclusions=exclusions,cases=cases)
jsonlite::write_json(out,'allmeta/dta-sroc/validate/corpus/plus-reference.json',auto_unbox=TRUE,digits=NA,pretty=TRUE,na='null')
cat('Datasets inventoried:',length(inventory),'configurations:',length(cases),'\n')
