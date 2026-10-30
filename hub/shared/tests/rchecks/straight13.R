# Straight Path independent check. Inputs are CSV/plain text written by the browser spec.
# No archived corpus, page engine, JS expected set, or non-permitted R package is used.
suppressPackageStartupMessages(library(metafor))
apps <- c("heterogeneity","pubbias-tests","meta-regression","influence","limit-ma","gosh",
          "cumulative-subgroup","mh-peto","multilevel-ma","nma","component-nma","dose-response-ma","rve-meta")
arg <- grep("^--file=",commandArgs(),value=TRUE)
out <- file.path(dirname(dirname(normalizePath(sub("^--file=","",arg)))),"rchecks-out","straight13")
fail <- function(...) stop(paste(...),call.=FALSE)
check <- function(ok,...) if(!isTRUE(ok)) fail(...)
kv <- function(path) {d<-read.csv(path,colClasses="character",na.strings=NULL);check(!anyDuplicated(d$key),"duplicate evidence key");setNames(as.list(d$value),d$key)}
num <- function(x) as.numeric(x)
ci <- function(b,se,crit=qnorm(.975),null=0,pi=NULL) {
 ans<-data.frame(lo=as.numeric(b-crit*se),hi=as.numeric(b+crit*se),nul=rep(null,length(b)),piLo=rep(NA_real_,length(b)),piHi=rep(NA_real_,length(b)))
 if(!is.null(pi)){ans$piLo<-pi[1];ans$piHi<-pi[2]};ans
}
emptyCI <- function() ci(numeric(),numeric())
pool <- function(y,v,method="PM",X=NULL) {
 args<-list(yi=y,vi=v,method=method,control=list(threshold=1e-12,tol=1e-12,maxiter=1000))
 if(!is.null(X)){args$mods<-X;args$intercept<-FALSE}
 do.call(metafor::rma.uni,args)
}
# Fixed comparison tolerance; rounded DOM values are compared at their declared display precision.
near <- function(a,b,label,tol=1e-8) {
 check(length(a)==length(b),label,"length mismatch")
 check(all(is.finite(a))&&all(is.finite(b)),label,"non-finite")
 check(all(abs(a-b)<=tol*pmax(1,abs(b))),label,"mismatch:",paste(a,collapse=","),"vs",paste(b,collapse=","))
}
sameFired <- function(a,b) check(identical(sort(a),sort(b)),"fired-set mismatch",paste(a,collapse=","),"vs",paste(b,collapse=","))
tr <- function(A) sum(diag(A))
rawTable <- function(folder,sep=",") {
 txt<-readLines(file.path(folder,"input.txt"),warn=FALSE)
 txt<-txt[nzchar(trimws(txt)) & !grepl("^\\s*#",txt)]
 read.table(text=paste(txt,collapse="\n"),sep=sep,header=FALSE,strip.white=TRUE,
            quote='"',comment.char="",fill=TRUE,stringsAsFactors=FALSE)
}
rules <- function(app,z) {
 e<-character();add<-function(id) e<<-c(e,paste0(id,"@1"))
 k<-z$values$k; mn<-z$values$min; es<-z$es
 inc<-function(l,h,v) is.finite(l)&is.finite(h)&l<=v&h>=v
 if(isTRUE(z$rec))add("SP-REC-SMALLK")
 if(!is.null(z$values$i2)&&z$values$i2<.05&&k<5)add("SP-PIT-I2ZERO")
 if(any(inc(es$lo,es$hi,es$nul)))add("SP-PIT-NONSIG")
 if(isTRUE(z$funnel)&&k<10)add("SP-PIT-FUNNELSMALLK")
 if(isTRUE(z$consistent))add("SP-PIT-NMACONSIST")
 if(if(!is.null(mn))mn<5 else k<5)add("SP-UNC-SMALLK")
 if(!is.null(k)&&k>=3&&any(inc(es$piLo,es$piHi,es$nul)&!inc(es$lo,es$hi,es$nul)))add("SP-UNC-WIDEPI")
 sort(e)
}
# Component designs have no intercept (component-nma/index.html:185-237).
# Compute generalized DL from the uncentred weighted residuals. rma.uni's
# internal mean-centring of y is not invariant for this design; fixing the
# independently derived tau2 lets metafor supply the coefficient fit and vcov.
componentDL <- function(y,v,X) {
 check(nrow(X)==length(y)&&length(v)==length(y)&&all(v>0),"component DL dimensions/variances")
 check(qr(X)$rank==ncol(X),"component DL rank")
 df<-length(y)-ncol(X);check(df>0,"component DL residual degrees of freedom")
 w<-1/v;C<-solve(crossprod(X,w*X))
 b<-C%*%crossprod(X,w*y);Q<-sum(w*(y-X%*%b)^2)
 denom<-sum(w)-sum(diag(C%*%crossprod(X,w^2*X)))
 check(is.finite(denom)&&denom>0,"component DL moment denominator")
 tau<-max(0,(Q-df)/denom)
 metafor::rma.uni(yi=y,vi=v,mods=X,intercept=FALSE,method="DL",tau2=tau)
}

derive <- function(app,folder) {
 ctl<-kv(file.path(folder,"controls.csv"));d<-rawTable(folder,if(app=="component-nma")"|" else ",")
 z<-list(values=list(),es=emptyCI(),rec=FALSE,funnel=FALSE,consistent=FALSE)
 # Methods are derived from controls or the page's documented fixed method, never observed results.
 if(app %in% c("heterogeneity","meta-regression","influence","limit-ma","gosh","cumulative-subgroup")){
  j<-if(app %in% c("heterogeneity","meta-regression","cumulative-subgroup"))2L else 1L
  valid<-is.finite(suppressWarnings(as.numeric(d[[j]]))) & is.finite(suppressWarnings(as.numeric(d[[j+1]])))
  d<-d[valid,,drop=FALSE];y<-as.numeric(d[[j]]);v<-as.numeric(d[[j+1]])^2;k<-length(y);z$values$k<-k
  method<-switch(app,heterogeneity=toupper(ctl[["f-tau2"]]),influence="REML",
                 "limit-ma"="DL",gosh=ctl[["model"]],"PM")
  if(app=="heterogeneity"&&method=="DL"&&k<10)method<-"PM"
  z$values$estimator<-method
  if(app=="gosh"){z$rec<-method=="DL"&&k<10;return(z)}
  X<-if(app=="meta-regression")cbind(1,as.numeric(d[[4]])) else NULL
  f<-pool(y,v,method,X);b<-as.numeric(coef(f));se<-as.numeric(f$se)
  z$values$tau2<-f$tau2
  z$rec<-k<10&&(app %in% c("influence","limit-ma","cumulative-subgroup")||method=="DL")
  if(app=="meta-regression"){
   w<-1/(v+f$tau2);Q<-sum(w*(y-X%*%b)^2);df<-k-2
   es<-ci(b,se*sqrt(max(1,Q/df)),qt(.975,df))
   es[1,c("lo","hi")]<-round(es[1,c("lo","hi")],3)
   es[2,c("lo","hi")]<-round(es[2,c("lo","hi")],4);z$es<-es
  } else if(app=="heterogeneity"){
   w<-1/v;Q<-sum(w*(y-weighted.mean(y,w))^2);z$values$i2<-max(0,100*(Q-k+1)/Q)
   q<-max(1,sum((y-b)^2/(v+f$tau2))/(k-1))
   pi<-b+c(-1,1)*qt(.975,k-1)*sqrt(f$tau2+se^2)
   z$es<-ci(b,se*sqrt(q),qt(.975,k-1),pi=pi)
  } else if(app=="influence"){
   z$values$i2<-f$I2;z$es<-ci(b,se)
  } else if(app=="cumulative-subgroup"){
   pi<-if(ctl[["f-view"]]=="subgroup") b+c(-1,1)*qt(.975,k-1)*sqrt(f$tau2+se^2) else NULL
   z$es<-ci(b,se,pi=pi)
  } else {
   # Rücker beta0 limit estimate: radial OLS with DL-inflated sampling SE.
   st<-sqrt(v+f$tau2);fit<-lm(I(y/st)~I(1/st))
   C<-solve(crossprod(model.matrix(fit)));L<-c(sqrt(f$tau2),1)
   mu<-sum(L*coef(fit));s<-sqrt(drop(t(L)%*%C%*%L))
   z$es<-rbind(ci(mu,s),ci(b,se));z$funnel<-k>=10
   if(z$funnel)z$values$eggerP<-coef(summary(lm(I(y/sqrt(v))~I(1/sqrt(v)))))[1,4]
  }
 } else if(app=="pubbias-tests"){
  if(ncol(d)==3)d<-d[,-1,drop=FALSE]
  y<-as.numeric(d[[1]]);s<-as.numeric(d[[2]]);v<-s^2;k<-length(y)
  check(identical(ctl[["format"]],"te-se"),"unsupported publication-bias format")
  pet<-lm(y~s,weights=1/v);peese<-lm(y~v,weights=1/v)
  f<-if(coef(summary(pet))[1,4]<.05)peese else pet
  z$values<-list(k=k,eggerP=coef(summary(pet))[2,4])
  z$es<-ci(coef(f)[1],sqrt(vcov(f)[1,1]),qt(.975,k-2));z$funnel<-TRUE
 } else if(app=="mh-peto"){
  numericFirst<-all(is.finite(suppressWarnings(as.numeric(d[[1]]))))
  a<-if(numericFirst)1:4 else 2:5
  names(d)[a]<-c("e1","n1","e2","n2");k<-nrow(d);measure<-ctl[["measure"]]
  f<-metafor::rma.mh(ai=d$e1,bi=d$n1-d$e1,ci=d$e2,di=d$n2-d$e2,
       measure=measure,add=c(.5,0),to=c("only0","none"),drop00=c(FALSE,FALSE),correct=FALSE)
  es<-ci(as.numeric(f$b),f$se)
  if(measure!="RD"){es$lo<-exp(es$lo);es$hi<-exp(es$hi);es$nul<-1}
  if(measure=="OR"){
   p<-metafor::rma.peto(ai=d$e1,bi=d$n1-d$e1,ci=d$e2,di=d$n2-d$e2,add=0,to="none",drop00=TRUE)
   ep<-ci(as.numeric(p$b),p$se);ep$lo<-exp(ep$lo);ep$hi<-exp(ep$hi);ep$nul<-1;es<-rbind(es,ep)
  };z$values<-list(k=k);z$es<-es
 } else if(app=="component-nma"){
  arm<-function(x)if(tolower(trimws(x))=="control")character() else sort(trimws(strsplit(tolower(x),"+",fixed=TRUE)[[1]]))
  A<-lapply(d[[1]],arm);B<-lapply(d[[2]],arm);comps<-sort(unique(unlist(c(A,B))))
  X<-t(vapply(seq_len(nrow(d)),function(i)as.numeric(comps%in%A[[i]])-as.numeric(comps%in%B[[i]]),numeric(length(comps))))
  y<-as.numeric(d[[3]]);v<-as.numeric(d[[4]])^2;f<-componentDL(y,v,X)
  combos<-sort(unique(c(vapply(A,paste,"",collapse="+"),vapply(B,paste,"",collapse="+"))));combos<-combos[nzchar(combos)]
  L<-rbind(diag(length(comps)),t(vapply(combos,function(x)as.numeric(comps%in%strsplit(x,"+",fixed=TRUE)[[1]]),numeric(length(comps)))))
  b<-drop(L%*%coef(f));s<-sqrt(diag(L%*%vcov(f)%*%t(L)));z$es<-ci(b,s)
  z$es[,c("lo","hi")]<-round(z$es[,c("lo","hi")],3)
  keys<-vapply(seq_along(A),function(i)paste(sort(c(paste(A[[i]],collapse="+"),paste(B[[i]],collapse="+"))),collapse="|"),"")
  z$values<-list(min=min(table(keys)))
 } else if(app=="nma"){
  valid<-is.finite(suppressWarnings(as.numeric(d[[4]])));d<-d[valid,,drop=FALSE]
  names(d)<-c("study","t1","t2","y","s")
  f<-netmeta::netmeta(TE=d$y,seTE=d$s,treat1=d$t2,treat2=d$t1,studlab=d$study,
        sm="MD",common=TRUE,random=TRUE,method.tau="DL",method.random.ci=ctl[["f-ci"]],reference.group=ctl[["f-ref"]])
  mode<-if(ctl[["f-model"]]=="re")"random" else "common";ref<-ctl[["f-ref"]]
  tt<-sort(setdiff(unique(c(d$t1,d$t2)),ref))
  lo<-f[[paste0("lower.",mode)]][tt,ref];hi<-f[[paste0("upper.",mode)]][tt,ref]
  z$es<-ci((lo+hi)/2,(hi-lo)/2,1)
  if(ctl[["f-scale"]]=="exp"){z$es$lo<-round(exp(lo),2);z$es$hi<-round(exp(hi),2);z$es$nul<-1}
  else z$es[,c("lo","hi")]<-round(z$es[,c("lo","hi")],3)
  decomp<-netmeta::decomp.design(f);q<-decomp$Q.decomp["Between designs",]
  p<-pchisq(q$Q,q$df,lower.tail=FALSE)
  # netmeta releases may label the between-design row "Between designs".
  check(length(p)==1&&is.finite(p),"missing between-design test")
  keys<-apply(cbind(d$t1,d$t2),1,function(x)paste(sort(x),collapse="|"))
  z$values<-list(min=min(vapply(split(d$study,keys),function(x)length(unique(x)),1L)),inconsistencyP=round(p,4))
  z$consistent<-round(p,4)>=.05
 } else if(app=="multilevel-ma"){z<-multilevel(d)
 } else if(app=="rve-meta"){z<-rve(folder,ctl)
 } else if(app=="dose-response-ma"){z<-dose(d,ctl)
 } else fail("unimplemented app",app)
 z
}

# At sigma2Within=0 the likelihood factors into cluster means and residuals.
# Solve the analytic REML score for the between-cluster variance, rather than
# relying on a finite-difference two-parameter optimizer near its boundary.
boundaryREML <- function(y,v,cluster) {
 groups<-split(seq_along(y),cluster)
 m<-vapply(groups,function(i)weighted.mean(y[i],1/v[i]),0)
 s<-vapply(groups,function(i)1/sum(1/v[i]),0)
 score<-function(tau) {
  w<-1/(s+tau);b<-weighted.mean(m,w)
  (sum(w^2*(m-b)^2)-sum(w)+sum(w^2)/sum(w))/2
 }
 if(score(0)<=0)return(0)
 upper<-max(1,var(m));while(score(upper)>0)upper<-upper*2
 uniroot(score,c(0,upper),tol=1e-14)$root
}

multilevel <- function(d) {
 names(d)[1:3]<-c("cluster","y","s");d<-d[is.finite(suppressWarnings(as.numeric(d$y))),]
 y<-as.numeric(d$y);v<-as.numeric(d$s)^2;groups<-split(seq_along(y),d$cluster);J<-length(groups)
 # The page's MoM estimator pools the within-group residual Q, then applies
 # DL to group means with the resulting within-study variance.
 multi<-groups[lengths(groups)>1]
 Qw<-sum(vapply(multi,function(i)sum((y[i]-weighted.mean(y[i],1/v[i]))^2/v[i]),0))
 dfw<-sum(lengths(multi)-1);inds<-unlist(multi);w<-1/v[inds]
 tw<-if(dfw>0)max(0,(Qw-dfw)/(sum(w)-sum(w^2)/sum(w))) else 0
 means<-vapply(groups,function(i)weighted.mean(y[i],1/(v[i]+tw)),0)
 vars<-vapply(groups,function(i)1/sum(1/(v[i]+tw)),0)
 ts<-pool(means,vars,"DL")$tau2
 w<-1/(v+tw+ts);mu<-weighted.mean(y,w)
 se<-sqrt(max(1,sum(w*(y-mu)^2)/(J-1))/sum(w))
 es<-ci(mu,se,qt(.975,J-1),pi=mu+c(-1,1)*qt(.975,J-1)*sqrt(ts+tw+se^2))
 # Independent likelihood model for the separate REML table.
 dd<-data.frame(y=y,v=v,cluster=factor(d$cluster),id=seq_along(y))
 f<-metafor::rma.mv(y,V=v,random=~1|cluster/id,data=dd,method="REML",control=list(rel.tol=1e-10))
 if(f$sigma2[2]<1e-8){
  between<-boundaryREML(y,v,dd$cluster)
  # Verify the within-component boundary with the full REML score. This is
  # an optimizer refinement, not an assumption that the component is zero.
  Z<-model.matrix(~cluster-1,dd);V<-diag(v)+between*tcrossprod(Z)
  W<-solve(V);one<-rep(1,length(y));a<-W%*%one
  P<-W-tcrossprod(a)/sum(a)
  withinScore<-(sum((P%*%y)^2)-sum(diag(P)))/2
  check(withinScore<=0,"within-study boundary violates REML score")
  f<-metafor::rma.mv(y,V=v,random=~1|cluster/id,data=dd,method="REML",sigma2=c(between,0))
 }
 es<-rbind(es,ci(as.numeric(coef(f)),f$se))
 list(values=list(k=J,tau2Study=ts,tau2Within=tw),es=es)
}
rve <- function(folder,ctl) {
 d<-read.csv(file.path(folder,"rve-input.csv"),stringsAsFactors=FALSE)
 y<-d$yi;v<-d$vi;X<-as.matrix(d[,grep("^x[0-9]+$",names(d)),drop=FALSE])
 if(ctl[["f-centre"]]=="true"&&ncol(X))X<-sweep(X,2,colMeans(X))
 X<-cbind(1,X);p<-ncol(X);n<-nrow(X);groups<-split(seq_len(n),d$cluster);m<-length(groups);rho<-num(ctl[["f-rho"]])
 weights<-function(tau) {w<-numeric(n);for(i in groups)w[i]<-1/(length(i)*(mean(v[i])+tau));w}
 w<-weights(0);M<-solve(crossprod(X,w*X));b<-M%*%crossprod(X,w*y);Qe<-sum(w*(y-X%*%b)^2)
 A<-B<-C<-matrix(0,p,p)
 for(i in groups){
  x<-X[i,,drop=FALSE];s<-colSums(x);XX<-crossprod(x);ww<-w[i[1]];kj<-length(i)
  A<-A+ww^2*tcrossprod(s);B<-B+ww/kj*XX;C<-C+ww/kj*(tcrossprod(s)-XX)
 }
 tau<-max(0,(Qe-m+tr(M%*%B)+rho*tr(M%*%C))/(sum(w)-tr(M%*%A)))
 w<-weights(tau);M<-solve(crossprod(X,w*X));b<-drop(M%*%crossprod(X,w*y));e<-y-X%*%b
 Hres<-diag(n)-X%*%M%*%t(w*X);meat<-matrix(0,p,p);P<-list()
 for(i in groups){
  x<-X[i,,drop=FALSE];ww<-w[i[1]]
  eig<-eigen(diag(length(i))-ww*x%*%M%*%t(x),symmetric=TRUE)
  inv<-ifelse(eig$values<1e-10,0,1/sqrt(pmax(eig$values,1e-10)))
  Aj<-eig$vectors%*%diag(inv,length(inv))%*%t(eig$vectors)
  g<-ww*crossprod(x,Aj%*%e[i]);meat<-meat+tcrossprod(g)
  # Columns of this matrix are cluster contribution vectors for Satterthwaite df.
  P[[length(P)+1]]<-sweep(t(Hres[i,,drop=FALSE])%*%(ww*Aj%*%x%*%M),1,sqrt(w),"/")
 }
 V<-M%*%meat%*%M;se<-sqrt(diag(V))
 df<-vapply(seq_len(p),function(j){G<-do.call(cbind,lapply(P,function(a)a[,j]));B<-crossprod(G);tr(B)^2/sum(B^2)},0)
 list(values=list(k=m,tau2=tau),es=ci(b,se,qt(.975,df)))
}
dose <- function(d,ctl) {
 # The existing two browser fixtures use the linear, two-stage GL model.
 # Refuse silently unsupported choices; extend this branch if fixtures are added.
 check(ctl[["f-shape"]]=="linear"&&ctl[["f-cov"]]=="gl"&&ctl[["f-proc"]]=="2stage"&&ctl[["f-mod"]]=="false",
       "unsupported dose-response fixture")
 names(d)[1:7]<-c("study","dose","cases","n","y","s","type")
 slopes<-lapply(split(d,d$study),function(g){
  ref<-which(is.na(g$s)|g$s==0);check(length(ref)==1,"dose reference")
  nr<-setdiff(seq_len(nrow(g)),ref);type<-g$type[1]
  # Greenland–Longnecker pseudo-counts by Newton solution of the log-risk equations.
  # Fixed convergence definition belongs to the covariance method, not a comparison tolerance.
  A<-g$cases;total<-sum(A);Ap<-A
  for(it in seq_len(1000)){
   A0<-total-sum(A[nr])
   c0<-if(type=="ir")1/A else 1/A+1/(g$n-A)
   residual<-if(type=="ir")g$y[nr]+log(A0)+log(g$n[nr])-log(A[nr])-log(g$n[ref]) else
       g$y[nr]+log(A0)+log(g$n[nr]-A[nr])-log(A[nr])-log(g$n[ref]-A0)
   H<-matrix(c0[ref],length(nr),length(nr))+diag(c0[nr],length(nr))
   step<-solve(H,residual);Ap<-A;Ap[ref]<-A0;Ap[nr]<-A[nr]+step
   if(sum(step^2)<1e-5)break
   A<-Ap
  }
  check(it<1000,"GL reconstruction did not converge")
  A<-Ap
  samp<-if(type=="ir")1/A else if(type=="ci")1/A-1/g$n else 1/A+1/(g$n-A)
  V<-outer(g$s[nr],g$s[nr])*samp[ref]/sqrt(outer(samp[nr]+samp[ref],samp[nr]+samp[ref]))
  diag(V)<-g$s[nr]^2
  x<-g$dose[nr]-g$dose[ref];var<-1/drop(crossprod(x,solve(V,x)))
  c(beta=var*drop(crossprod(x,solve(V,g$y[nr]))),v=var)
 })
 S<-do.call(rbind,slopes);method<-toupper(ctl[["f-method"]])
 check(method%in%c("REML","ML","FIXED"),"dose estimator")
 f<-pool(S[,"beta"],S[,"v"],if(method=="FIXED")"FE" else method)
 es<-ci(as.numeric(coef(f)),f$se);es$lo<-round(exp(es$lo),4);es$hi<-round(exp(es$hi),4);es$nul<-1
 list(values=list(k=nrow(S)),es=es)
}
compareEvidence <- function(folder,z) {
 observed<-kv(file.path(folder,"observed.csv"))
 check(setequal(names(observed),names(z$values)),"observed quantity coverage",folder,
       paste(names(observed),collapse=","),"vs",paste(names(z$values),collapse=","))
 for(key in names(z$values)){
  if(key=="estimator")check(identical(observed[[key]],z$values[[key]]),"estimator mismatch")
  else near(num(observed[[key]]),z$values[[key]],paste(folder,key))
 }
 actual<-read.csv(file.path(folder,"estimates.csv"),na.strings="",check.names=FALSE)
 check(identical(names(actual),names(z$es))&&nrow(actual)==nrow(z$es),"interval coverage",folder)
 for(key in names(actual)){
  check(identical(is.na(actual[[key]]),is.na(z$es[[key]])),"missing interval mismatch",folder,key)
  i<-!is.na(actual[[key]])
  if(any(i))near(actual[[key]][i],z$es[[key]][i],paste(folder,key))
 }
}
# Boundary regression: with two clusters and zero within-study heterogeneity,
# REML between-cluster variance has a closed-form solution. Unequal sampling
# variances expose premature optimizer convergence. A perturbed fit must fail
# the same unchanged numeric comparator used for browser evidence.
checkBoundary <- function() {
 y<-c(.35,.28,.40,.18);v<-c(.12,.11,.14,.09)^2;g<-c(1,1,1,2)
 groups<-split(seq_along(y),g)
 m<-vapply(groups,function(i)weighted.mean(y[i],1/v[i]),0)
 s<-vapply(groups,function(i)1/sum(1/v[i]),0)
 exact<-max(0,((m[1]-m[2])^2-sum(s))/2)
 actual<-boundaryREML(y,v,g)
 near(actual,exact,"boundary REML closed-form control")
 bad<-tryCatch({near(actual+1e-5,exact,"boundary REML planted perturbation");FALSE},error=function(e)TRUE)
 check(bad,"boundary precision plant was not rejected")
}
checkBoundary()


# Generalized DL regression: centring y changes a design without an intercept.
# This one-component design has exact Q=0 and tau2=0; centring produces Q=18.225.
checkComponentDL <- function() {
 X<-matrix(c(1,1,2,2),ncol=1);v<-rep(.04,4);y<-drop(X)*.9
 f<-componentDL(y,v,X)
 near(f$tau2,0,"component DL zero-heterogeneity control")
 near(as.numeric(coef(f)),.9,"component DL coefficient control")
 near(as.numeric(vcov(f)),.004,"component DL covariance control")
 wrong<-max(0,(sum((y-mean(y)-X%*%solve(crossprod(X,X/v),crossprod(X,(y-mean(y))/v)))^2/v)-3)/
              (sum(1/v)-sum(diag(solve(crossprod(X,X/v))%*%crossprod(X,X/v^2)))))
 rejected<-tryCatch({near(wrong,f$tau2,"centred component DL plant");FALSE},error=function(e)TRUE)
 check(rejected,"centred component DL plant was not rejected")
 # Nonzero heterogeneity: residuals orthogonal to X have Q=25, df=3,
 # trace(P)=75, hence tau2=22/75. This prevents a hard-coded zero fix.
 yh<-y+c(.5,-.5,.5,-.5)
 fh<-componentDL(yh,v,X)
 near(fh$tau2,22/75,"component DL positive-heterogeneity control")
 near(as.numeric(coef(fh)),.9,"component DL heterogeneous coefficient")
 near(as.numeric(vcov(fh)),(.04+22/75)/10,"component DL heterogeneous covariance")
 # Centring is harmless when an intercept is actually in the model.
 Xi<-cbind(1,c(-1,-1,1,1));yi<-c(.1,.5,.3,1.1)
 fi<-componentDL(yi,v,Xi);ordinary<-pool(yi,v,"DL",Xi)
 near(fi$tau2,ordinary$tau2,"component DL intercept control")
 near(as.numeric(coef(fi)),as.numeric(coef(ordinary)),"component DL intercept coefficients")
}
checkComponentDL()

# Fail closed on any missing fixture, calculation, numeric check, or rule-set check.
plants<-0L;checked<-0L
for(app in apps)for(fixture in c("example","changed")){
 folder<-file.path(out,app,fixture)
 check(dir.exists(folder),"missing browser evidence",app,fixture)
 z<-derive(app,folder);compareEvidence(folder,z)
 expected<-rules(app,z);actual<-readLines(file.path(folder,"fired.txt"),warn=FALSE)
 sameFired(actual,expected)
 if(app=="gosh"&&fixture=="example"){
  # Alter a real page fixture to claim small-k uncertainty at k >= 5.
  check(z$values$k>=5&&!("SP-UNC-SMALLK@1"%in%expected),"plant precondition")
  corrupted<-sort(c(actual,"SP-UNC-SMALLK@1"))
  detected<-inherits(tryCatch({sameFired(corrupted,expected);NULL},error=identity),"error")
  check(detected,"planted wrong fired set was accepted");plants<-plants+1L
  cat("PLANT_DETECTED\n")
 }
 checked<-checked+1L;cat("R_STRAIGHT",app,fixture,paste(expected,collapse=","),"\n")
}
check(checked==2L*length(apps)&&plants==1L,"incomplete independent cross-check")
cat("R_CHECK_PASS\n")
