# Leave-one-study-out inconsistency oracle for the nma-inconsistency plus panel.
# The per-configuration fit is the P16 reference.R body, unchanged in substance:
# input gate, PM tau via the uncentred metafor .QE.func + uniroot, netmeta with
# tau.preset, netsplit(method="Back-calculation", tol.direct=0), independent-path
# membership, decomp.design(tau.preset=tau), and the Q=0/df=0/p=NA no-loop rule.
# Usage (resumable; one file per configuration):
#   Rscript --vanilla generate-plus.R <plus/corpus.json> <P16 reference dir> <out dir> [start step]
# The full-network fit of every configuration must match the archived final P16
# reference (same membership; numbers within 1e-12 relative); otherwise the script stops.
suppressPackageStartupMessages({library(netmeta); library(metafor); library(jsonlite)})
# The archived P16 references were produced in the C collation (their session asked for an
# unavailable C.UTF-8 locale); netmeta orders treatments and splits by locale collation, so use C.
invisible(Sys.setlocale("LC_COLLATE","C"))
G<-function(x,n)x[[n,exact=TRUE]]
# Speed: meta's internal settings lookup gs() dominates netmeta run time (~70%,
# repeated setchar/tolower over the argument list). It is a pure function of the
# current meta settings, which nothing here changes, so it is memoised. Exactness
# is checked twice: every full fit must match the archived (unmemoised) P16
# reference, and README-plus.md records a byte comparison of memoised vs plain
# drop-fits. Set PLUS_MEMO_GS=0 to disable.
gs_memo<-Sys.getenv("PLUS_MEMO_GS","1")!="0"
if(gs_memo) for(ns in c("meta","netmeta")) if(exists("gs",envir=asNamespace(ns),inherits=FALSE)) local({
 orig<-get("gs",envir=asNamespace(ns)); memo<-new.env(hash=TRUE)
 f<-function(x=NULL,unname=NULL){key<-paste0(paste(x,collapse="
"),"|",if(is.null(unname))"N" else unname);hit<-memo[[key]];if(!is.null(hit))return(hit$v);v<-orig(x,unname);memo[[key]]<-list(v=v);v}
 assignInNamespace("gs",f,ns)
})
write_json17 <- function(x, file) {
 encode <- function(v) {
  if(is.null(v)) return('null')
  if(is.list(v)) {
   z <- vapply(v,encode,character(1))
   if(!is.null(names(v))) return(paste0('{',paste(paste0(vapply(names(v),function(s)encodeString(s,quote='"'),character(1)),':',z),collapse=','),'}'))
   return(paste0('[',paste(z,collapse=','),']'))
  }
  atom <- function(a) {
   if(is.na(a)) return('null')
   if(is.numeric(a)) return(if(is.finite(a))sprintf('%.17g',a) else 'null')
   if(is.logical(a)) return(if(a)'true' else 'false')
   encodeString(as.character(a),quote='"')
  }
  z <- vapply(v,atom,character(1))
  if(length(z)==1) z else paste0('[',paste(z,collapse=','),']')
 }
 tmp <- paste0(file,'.tmp'); writeLines(encode(x),tmp,useBytes=TRUE); file.rename(tmp,file)
}
indirect_path<-function(A,B,pair) {
 keep<-!((A==pair[1]&B==pair[2])|(A==pair[2]&B==pair[1]));a<-A[keep];b<-B[keep];seen<-pair[1]
 repeat{new<-unique(c(seen,b[a%in%seen],a[b%in%seen]));if(length(new)==length(seen))break;seen<-new}
 pair[2]%in%seen
}
fit<-function(d,model) {
 A<-d$A;B<-d$B;te<-d$te;se<-d$se;study<-d$study
 tr<-sort(unique(c(A,B)),method="radix"); adjacency<-lapply(tr,function(t) unique(c(B[A==t],A[B==t])));names(adjacency)<-tr
 reached<-tr[1];repeat{nextset<-unique(c(reached,unlist(adjacency[reached])));if(length(nextset)==length(reached))break;reached<-nextset}
 # Plus corpus inputs are accepted two-arm networks, so the multi-arm gate cannot fire.
 reason<-if(nrow(d)<3)"At least 3 valid contrasts are required." else if(anyDuplicated(study))"Repeated study IDs are unsupported: enter one independent contrast per study." else if(length(reached)<length(tr))"The treatment network is disconnected." else NULL
 if(!is.null(reason)) return(list(status="refused",reason=reason))
 tau<-0
 if(model=="PM") {
  X<-sapply(tr[-1],function(t)as.numeric(A==t)-as.numeric(B==t))
  if(nrow(d)>ncol(as.matrix(X))) {
   qe<-get(".QE.func",asNamespace("metafor"))
   f<-function(t2)qe(t2,Y=as.matrix(te),vi=se^2,X=as.matrix(X),k=nrow(d),objective=nrow(d)-ncol(as.matrix(X)))
   if(f(0)>0) {
    upper<-max(1,var(te));while(f(upper)>0)upper<-upper*2
    tau<-sqrt(uniroot(f,c(0,upper),tol=.Machine$double.eps^0.75,maxiter=1000)[["root",exact=TRUE]])
   }
  }
 }
 m<-netmeta(TE=te,seTE=se,treat1=A,treat2=B,studlab=study,sm="MD",reference.group=tr[1],common=TRUE,random=TRUE,method.tau="DL",tau.preset=if(model=="DL")NULL else tau,sep.trts=" ~~ ",warn=FALSE)
 tau<-if(model=="FE")0 else G(m,"tau")
 s<-netsplit(m,method="Back-calculation",tol.direct=0)
 suffix<-if(model=="FE")"common" else "random"
 direct<-G(s,paste0("direct.",suffix));indirect<-G(s,paste0("indirect.",suffix));cmp<-G(s,paste0("compare.",suffix))
 splits<-list()
 for(j in seq_len(nrow(cmp))) {
  pair<-strsplit(G(cmp,"comparison")[j]," ~~ ",fixed=TRUE)[[1]]; ordered<-sort(pair,method="radix");sgn<-if(pair[1]==ordered[1])1 else -1
  name<-paste(ordered,collapse=" vs ")
  if(!is.finite(G(direct,"TE")[j]) || !indirect_path(A,B,ordered)) next
  if(!is.finite(G(cmp,"TE")[j])) stop(paste("netmeta did not return an estimable graph-supported split:",name))
  splits[[length(splits)+1]]<-list(comparison=name,direct=list(mean=sgn*G(direct,"TE")[j],se=G(direct,"seTE")[j]),indirect=list(mean=sgn*G(indirect,"TE")[j],se=G(indirect,"seTE")[j]),diff=sgn*G(cmp,"TE")[j],seDiff=G(cmp,"seTE")[j],z=sgn*G(cmp,"statistic")[j],p=G(cmp,"p")[j],kDirect=sum((A==ordered[1]&B==ordered[2])|(A==ordered[2]&B==ordered[1])))
 }
 dec<-decomp.design(m,tau.preset=tau,warn=FALSE)
 q<-if(model=="FE")G(dec,"Q.decomp") else G(dec,"Q.inc.random.preset")
 if(is.null(q)) global<-list(Q=0,df=0,p=NA_real_) else {row<-match("Between designs",rownames(q));global<-list(Q=G(q,"Q")[row],df=G(q,"df")[row],p=G(q,"pval")[row])}
 if(!is.null(G(global,"df")) && G(global,"df")==0) {global[["Q"]]<-0;global[["p"]]<-NA_real_}
 estimates<-function(which) setNames(lapply(tr,function(t)list(est=G(m,paste0("TE.",which))[t,tr[1]],se=G(m,paste0("seTE.",which))[t,tr[1]])),tr)
 re<-estimates("random");fe<-estimates("common")
 beta<-vapply(re,function(z)G(z,"est"),numeric(1)); qr<-sum((te-(beta[A]-beta[B]))^2/(se^2+tau^2))
 list(status="ok",trts=as.list(tr),Q=G(m,"Q"),df=G(m,"df.Q"),tau2=tau^2,Qrandom=qr,estimates=fe,estimatesRandom=re,nodeSplit=splits,dbt=global,k=nrow(d),model=model)
}
# Archived references were written with 17 significant digits; compare the same quantities.
flat<-function(x,p="") {
 if(is.list(x)) {nn<-names(x);if(is.null(nn))nn<-as.character(seq_along(x));unlist(lapply(seq_along(x),function(i)flat(x[[i]],paste(p,nn[i],sep="/"))),recursive=FALSE)}
 else setNames(list(x),p)
}
same_as_archive<-function(full,arch) {
 # Bitwise identity is not expected across machines (ulp-level BLAS/compiler
 # differences); 1e-12 relative is far inside the 1e-9 app tolerance.
 keep<-c("status","trts","Q","df","tau2","Qrandom","estimates","estimatesRandom","nodeSplit","dbt","k","model")
 a<-flat(jsonlite::fromJSON(write_json_text(full[keep]),simplifyVector=FALSE)); b<-flat(arch[keep])
 if(!identical(sort(names(a)),sort(names(b)))) return(list(ok=FALSE,msg="membership differs from archived final reference"))
 worst<-0
 for(n in names(b)) {
  x<-a[[n]];y<-b[[n]]
  if(is.numeric(x)&&is.numeric(y)) {d<-abs(x-y)/max(1,abs(y));worst<-max(worst,d);if(!(d<=1e-12))return(list(ok=FALSE,msg=paste("differs from archived final reference at",n,sprintf("%.17g",x),sprintf("%.17g",y))))}
  else if(!identical(x,y)) return(list(ok=FALSE,msg=paste("differs from archived final reference at",n)))
 }
 list(ok=TRUE,msg="matches archived final reference within 1e-12",max_rel_diff=worst)
}
write_json_text<-function(x){f<-tempfile();write_json17(x,f);paste(readLines(f,warn=FALSE),collapse="")}
args<-commandArgs(TRUE)
corpus<-jsonlite::fromJSON(args[1],simplifyVector=FALSE); refdir<-args[2]; out<-args[3]
start<-if(length(args)>3)as.integer(args[4]) else 1L; step<-if(length(args)>4)as.integer(args[5]) else 1L
dir.create(out,showWarnings=FALSE,recursive=TRUE)
versions<-list(R=paste(R.version$major,R.version$minor,sep="."),netmeta=as.character(packageVersion("netmeta")),metafor=as.character(packageVersion("metafor")),jsonlite=as.character(packageVersion("jsonlite")),meta=as.character(packageVersion("meta")),gs_memo=gs_memo)
cat("versions",unlist(versions),"\n")
todo<-which((seq_along(corpus)-1L)%%step==start-1L)
# PLUS_REVERSE=1 walks a shard backwards so a second node can share it (outputs are per configuration).
if(Sys.getenv("PLUS_REVERSE","0")=="1") todo<-rev(todo)
for(i in todo) {
 c<-corpus[[i]]; key<-G(c,"key"); file<-file.path(out,sprintf("%05d.json",i)); began<-proc.time()[["elapsed"]]
 if(file.exists(file) && identical(G(jsonlite::fromJSON(file,simplifyVector=FALSE),"key"),key)) {cat(i,"cached",key,"\n");next}
 d<-do.call(rbind,lapply(G(c,"rows"),as.data.frame,stringsAsFactors=FALSE)); model<-G(c,"model")
 warnings<-character()
 run<-function(dd)tryCatch(withCallingHandlers(fit(dd,model),warning=function(w){warnings<<-c(warnings,conditionMessage(w));invokeRestart("muffleWarning")}),error=function(e)list(status="error",reason=conditionMessage(e)))
 full<-run(d)
 arch<-jsonlite::fromJSON(file.path(refdir,sprintf("%05d.json",G(c,"archive_index"))),simplifyVector=FALSE)
 check<-same_as_archive(full,arch)
 if(!check$ok) stop(paste(key,check$msg))
 drops<-lapply(seq_len(nrow(d)),function(j)list(drop=d$study[j],fit=run(d[-j,,drop=FALSE])))
 write_json17(list(key=key,model=model,versions=versions,full_check=check$msg,full_max_rel_diff=check$max_rel_diff,full=full,drops=drops,warnings=as.list(unique(warnings)),seconds=proc.time()[["elapsed"]]-began),file)
 st<-table(vapply(drops,function(x)G(G(x,"fit"),"status"),""))
 cat(i,key,"k=",nrow(d),paste(names(st),st,sep="=",collapse=" "),sprintf("%.1fs",proc.time()[["elapsed"]]-began),"\n");flush.console()
}
cat("Plus shard complete",start,step,"\n")
