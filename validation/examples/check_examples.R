# Desktop/CI: Rscript validation/examples/check_examples.R
# No package installation, saved references, synthetic fits, or skipped examples.
finite_scalar <- function(x) is.numeric(x) && length(x)==1L && is.finite(x)
same <- function(a,b,kind,tol) {
  if (kind=='exact') return(length(a)==1L && length(b)==1L &&
    ((is.numeric(a)&&is.numeric(b)) || identical(typeof(a),typeof(b))) && isTRUE(a==b))
  if (!(kind %in% c('abs','rel')) || !finite_scalar(tol) || tol<0) return(FALSE)
  if (is.null(a) && is.null(b)) return(TRUE)
  if (!finite_scalar(a) || !finite_scalar(b)) return(FALSE)
  diff <- abs(a-b) / (if(kind=='rel') max(1,abs(b)) else 1)
  is.finite(diff) && diff <= tol
}
need <- function(ok,message) if(!isTRUE(ok)) stop(message,call.=FALSE)
nonempty <- function(x) is.character(x) && length(x)==1L && nzchar(trimws(x))
read_csv <- function(path) {
  need(file.exists(path),paste('Missing browser evidence:',path))
  read.csv(path, colClasses='character', na.strings=NULL, check.names=FALSE,
           stringsAsFactors=FALSE, fileEncoding='UTF-8', comment.char='')
}
decode_cell <- function(type,value) {
  if(type=='null') {need(value=='','Malformed null');return(NULL)}
  if(type=='string')return(value)
  if(type=='boolean') {need(value %in% c('true','false'),'Malformed boolean');return(value=='true')}
  need(type=='number','Unknown evidence type')
  v<-as.numeric(value);need(finite_scalar(v),'Nonfinite evidence');v
}
record_rows <- function(cells) {
  need(identical(names(cells),c('row','column','type','value')),'Malformed cell table')
  if(nrow(cells)==0L)return(list())
  ids<-as.integer(cells$row);need(!anyNA(ids)&&identical(unique(ids),seq_len(max(ids))),'Invalid record indices')
  lapply(seq_len(max(ids)),function(i) {
    z<-cells[ids==i,,drop=FALSE];need(!anyDuplicated(z$column),'Duplicate source cell')
    setNames(lapply(seq_len(nrow(z)),function(j)decode_cell(z$type[j],z$value[j])),z$column)
  })
}
read_evidence <- function(out,item) {
  read<-function(suffix)read_csv(file.path(out,paste0(item$app,'.',suffix)))
  meta<-read('metadata.csv');need(!anyDuplicated(meta$key),'Duplicate metadata')
  d<-as.list(setNames(meta$value,meta$key));d$values<-record_rows(read('source.csv'))
  need(length(d$values)>0L,'Missing source rows');d$columns<-names(d$values[[1]])
  need(identical(d$app,item$app)&&identical(d$dataset,item$dataset),'Artifact identity mismatch')
  a<-d; a$projection<-list(rows=record_rows(read('projection.csv')),excluded=as.integer(read('excluded.csv')$row))
  vals<-read('values.csv');need(nrow(vals)>0L && !anyDuplicated(vals$key),'Missing/duplicate app values')
  a$appValues<-lapply(seq_len(nrow(vals)),function(i)list(key=vals$key[i],value=decode_cell(vals$type[i],vals$value[i])))
  a$compare<-list(kind=as.list(setNames(vals$kind,vals$key)),tolerance=as.list(setNames(as.numeric(vals$tolerance),vals$key)))
  ds<-read('display.csv')
  a$display<-lapply(seq_len(nrow(ds)),function(i)list(key=ds$key[i],text=ds$text[i],value=as.numeric(ds$value[i]),digits=as.numeric(ds$digits[i]),scale=as.numeric(ds$scale[i])))
  a$packages<-readLines(file.path(out,paste0(item$app,'.packages.txt')),warn=FALSE,encoding='UTF-8')
  a$script<-readLines(file.path(out,paste0(item$app,'.recipe.R')),warn=FALSE,encoding='UTF-8')
  list(data=d,artifact=a)
}
validate_source <- function(d,root) {
  for(key in c('source_package','version','dataset','citation','licence','source_blob')) need(nonempty(d[[key]]),paste('Missing provenance:',key))
  # Source provenance is pinned to the original package bytes, independently
  # of the installed analysis runtime. Never relabel 3.7-0 data as 3.5-0 data.
  pins<-read_csv(file.path(root,'source-data','index.csv'))
  pin<-pins[pins$source_package==d$source_package & pins$version==d$version & pins$dataset==d$dataset,,drop=FALSE]
  need(nrow(pin)==1L && identical(pin$source_blob,d$source_blob),'Pinned source identity/version mismatch')
  need(grepl('^[A-Za-z0-9._/-]+$',pin$file) && !grepl('(^/|(^|/)\\.\\.(/|$))',pin$file),'Invalid pinned source path')
  path<-file.path(root,'source-data',pin$file)
  need(file.exists(path) && identical(unname(tools::md5sum(path)),pin$md5),'Pinned R source bytes differ')
  source_env <- new.env(parent=baseenv())
  objects<-load(path,envir=source_env)
  need(identical(objects,d$dataset),'Pinned R source object identity mismatch')
  need(exists(d$dataset,envir=source_env,inherits=FALSE),'Dataset missing in source package')
  original <- get(d$dataset,envir=source_env)
  need(is.data.frame(original) && nrow(original)==length(d$values),'Source row count mismatch')
  need(identical(names(original),unlist(d$columns,use.names=FALSE)),'Source column order mismatch')
  for(i in seq_len(nrow(original))) {
    need(identical(names(d$values[[i]]),names(original)),'Source record column mismatch')
    for(key in names(original)) {
      expected <- original[[key]][i]
      if(is.factor(expected)) expected <- as.character(expected)
      actual <- d$values[[i]][[key]]
      ok <- if(is.na(expected)) is.null(actual) else if(is.numeric(expected))
        finite_scalar(actual) && identical(as.numeric(actual),as.numeric(expected)) else identical(actual,expected)
      need(ok,paste('Source value differs:',d$dataset,'row',i,'column',key))
    }
  }
  original
}
# Rebuild transformations independently from the package, including the precise
# subset, signs, denominators and cluster identifiers. No stored effect estimates.
project_source <- function(app,d) {
  if(app=='component-nma') {
    groups<-lapply(unique(d$id),function(id)which(d$id==id))
    included<-groups[lengths(groups)==2L];excluded<-unlist(groups[lengths(groups)!=2L],use.names=FALSE)
    ia<-vapply(included,function(x)x[1],1L);ib<-vapply(included,function(x)x[2],1L)
    a<-d[ia,,drop=FALSE];b<-d[ib,,drop=FALSE]
    cc<-ifelse(a$exac==0|a$exac==a$total|b$exac==0|b$exac==b$total,.5,0)
    ai<-a$exac+cc;bi<-a$total-a$exac+cc;ci<-b$exac+cc;di<-b$total-b$exac+cc
    A<-tolower(as.character(a$treatment));B<-tolower(as.character(b$treatment));A[A=='placebo']<-'control';B[B=='placebo']<-'control'
    return(list(row=ia,study=as.character(a$study),yi=log((ai/bi)/(ci/di)),vi=1/ai+1/bi+1/ci+1/di,A=A,B=B,excluded=excluded))
  }
  if(app %in% c('nma','nma-inconsistency')) {
    keep <- d$treat3=='' & is.na(d$event3) & is.na(d$n3)
    row <- which(keep); z <- d[keep,,drop=FALSE]
    cc <- ifelse(z$event1==0 | z$event1==z$n1 | z$event2==0 | z$event2==z$n2,.5,0)
    a<-z$event1+cc; b<-z$n1-z$event1+cc; c<-z$event2+cc; e<-z$n2-z$event2+cc
    A<-as.character(z$treat1); B<-as.character(z$treat2)
    return(list(row=row,yi=log((a/b)/(c/e)),vi=1/a+1/b+1/c+1/e,A=A,B=B,excluded=which(!keep)))
  }
  if(app %in% c('multilevel-ma','rve-meta')) return(list(row=seq_len(nrow(d)),yi=d$yi,vi=d$vi,cluster=d$district,excluded=integer()))
  if(app=='correlation-ma') return(list(row=seq_len(nrow(d)),r=d$ri,n=d$ni,excluded=integer()))
  if(app=='dta-sroc') return(c(list(row=seq_len(nrow(d)),excluded=integer()),as.list(d)))
  p <- list(row=seq_len(nrow(d)),excluded=integer())
  if(app=='proportion-ma') return(c(p,list(x=d$cpos,n=d$cpos+d$cneg)))
  if(app=='mh-peto') return(c(p,list(e1=d$tpos,n1=d$tpos+d$tneg,e2=d$cpos,n2=d$cpos+d$cneg)))
  nt<-d$tpos+d$tneg; nc<-d$cpos+d$cneg
  c(p,list(yi=log((d$tpos/nt)/(d$cpos/nc)),vi=1/d$tpos-1/nt+1/d$cpos-1/nc,year=d$year,moderator=d$ablat,group=as.character(d$alloc)))
}
equal_vector <- function(a,b,label) {
  need(length(a)==length(b),paste('Input length mismatch:',label))
  if(is.numeric(b)) need(is.numeric(a)&&all(is.finite(a))&&all(abs(a-b)<=1e-12*pmax(1,abs(b))),paste('Input transformation differs:',label))
  else need(identical(as.character(a),as.character(b)),paste('Input identifiers differ:',label))
}
validate_projection <- function(a,p) {
  need(length(a$projection$rows)==length(p$row),'Projection row count mismatch')
  need(identical(as.integer(unlist(a$projection$excluded)),as.integer(p$excluded)),'Excluded whole-study rows differ')
  for(key in setdiff(names(p),'excluded')) {
    actual <- unlist(lapply(a$projection$rows,function(r)r[[key]]),use.names=FALSE)
    equal_vector(actual,p[[key]],key)
  }
}
validate_fit_inputs <- function(app,e,p) {
  get_local <- function(key) { need(exists(key,e,inherits=FALSE),paste('Missing R input',key)); get(key,e,inherits=FALSE) }
  pair <- function(y='yi',v='vi') {equal_vector(get_local(y),p$yi,y);equal_vector(get_local(v),p$vi,v)}
  if(app=='nma') {
    z<-get_local('p');equal_vector(z$TE,p$yi,'TE');equal_vector(z$seTE,sqrt(p$vi),'seTE');equal_vector(z$treat1,p$A,'treat1');equal_vector(z$treat2,p$B,'treat2')
  } else if(app %in% c('nma-inconsistency','component-nma')) {
    equal_vector(get_local('te'),p$yi,'te');equal_vector(get_local('se'),sqrt(p$vi),'se');equal_vector(get_local('A'),p$A,'A');equal_vector(get_local('B'),p$B,'B')
  } else if(app=='dta-sroc') {
    z<-get_local('d');for(key in c('TP','FP','FN','TN'))equal_vector(z[[key]],p[[key]],key)
  } else if(app=='rve-meta') {
    z<-get_local('d');equal_vector(z$yi,p$yi,'yi');equal_vector(z$vi,p$vi,'vi');equal_vector(as.numeric(z$cl),p$cluster,'district')
  } else if(app=='correlation-ma') {
    equal_vector(get_local('r'),p$r,'r');equal_vector(get_local('n'),p$n,'n')
  } else if(app=='proportion-ma') {
    equal_vector(get_local('x'),p$x,'x');equal_vector(get_local('n'),p$n,'n')
  } else if(app=='mh-peto') {
    for(key in c('ai','bi','ci','di'))equal_vector(get_local(key),switch(key,ai=p$e1,bi=p$n1-p$e1,ci=p$e2,di=p$n2-p$e2),key)
  } else if(app=='meta-regression') {
    equal_vector(get_local('yi'),p$yi,'yi');equal_vector(get_local('se'),sqrt(p$vi),'se');equal_vector(get_local('x'),p$moderator,'latitude')
  } else if(app=='limit-ma') {
    equal_vector(get_local('te'),p$yi,'te');equal_vector(get_local('se'),sqrt(p$vi),'se')
  } else if(app=='pubbias-tests') pair('y','v') else {
    pair()
    if(app=='multilevel-ma') equal_vector(get_local('cluster'),match(p$cluster,unique(p$cluster)),'district membership')
    if(app=='cumulative-subgroup') {equal_vector(get_local('yr'),p$year,'publication year');equal_vector(get_local('grp'),p$group,'allocation method')}
  }
}
max_tolerance <- function(app,key) {
  if(app %in% c('dta-sroc','nma','heterogeneity','multilevel-ma','meta-regression','influence')) return(1e-6)
  if(app=='proportion-ma' && !(key %in% c('Q','df','i2','k'))) return(1e-6)
  if(app=='correlation-ma' && key=='tau2_z') return(1e-6)
  if(app=='cumulative-subgroup' && grepl('tau2',key,fixed=TRUE)) return(1e-6)
  if(app=='pubbias-tests' && key %in% c('trimfill_est','trimfill_se','trimfill_tau2')) return(1e-6)
  1e-9
}
compare_result <- function(a,ref) {
  keys<-vapply(a$appValues,function(v)v$key,'')
  need(length(keys)>0L && !anyDuplicated(keys) && setequal(keys,names(ref)),'R/app key coverage mismatch')
  ok<-logical(length(keys))
  for(i in seq_along(keys)) {
    key<-keys[i];v<-a$appValues[[i]];kind<-a$compare$kind[[key]]
    if(is.null(kind))kind<-'abs'
    tol<-a$compare$tolerance[[key]];if(is.null(tol))tol<-a$compare$tolerance$default
    need(kind=='exact' || (finite_scalar(tol) && tol<=max_tolerance(a$app,key)),'Tolerance exceeds existing app contract')
    ok[i]<-same(v$value,ref[[key]],kind,tol)
    if(finite_scalar(v$value)&&finite_scalar(ref[[key]])) ok[i]<-ok[i]&&abs(v$value-ref[[key]])<=1e-6
    if(!ok[i]) cat('MISS',a$app,key,'app=',as.character(v$value),'R=',as.character(ref[[key]]),'\n')
  }
  need(length(a$display)>0L,'No displayed result evidence')
  shown_ok<-vapply(a$display,function(d) {
    if(!(d$key %in% keys) || !finite_scalar(d$value) || !finite_scalar(d$scale) || !finite_scalar(d$digits)) return(FALSE)
    r<-ref[[d$key]]
    finite_scalar(r) && d$value==as.numeric(formatC(r*d$scale,format='f',digits=d$digits))
  },TRUE)
  all(ok) && all(shown_ok)
}
# The multilevel page also reports a legacy MoM summary, separately from REML.
# Rebuild its component equations from the source rows, using metafor for each
# independent FE/DL fit. No browser-computed variance enters this reference.
add_reported_values <- function(app,ref,p) {
  if(app!='multilevel-ma')return(ref)
  groups<-split(seq_along(p$yi),p$cluster);J<-length(groups);k<-length(p$yi)
  group_fe<-lapply(groups,function(ix)metafor::rma(p$yi[ix],p$vi[ix],method='FE'))
  sw<-sum(1/p$vi);sw2<-sum(1/p$vi^2)
  Qw<-sum(vapply(group_fe,function(m)m$QE,1));dfw<-k-J
  within<-max(0,(Qw-dfw)/(sw-sw2/sw))
  adjusted<-lapply(groups,function(ix)metafor::rma(p$yi[ix],p$vi[ix]+within,method='FE'))
  means<-vapply(adjusted,function(m)as.numeric(coef(m)),1)
  variances<-vapply(adjusted,function(m)m$se^2,1)
  between<-metafor::rma(means,variances,method='DL')$tau2
  total<-within+between;w<-1/(p$vi+total)
  m<-metafor::rma(p$yi,p$vi,tau2=total,method='DL',test='z')
  mu<-as.numeric(coef(m));hk<-sqrt(max(1,sum(w*(p$yi-mu)^2)/(J-1))/sum(w))
  typical<-(k-1)*sw/(sw^2-sw2);den<-total+typical
  vals<-list(mu=mu,ci_lb_z=m$ci.lb,ci_ub_z=m$ci.ub,
    ci_lb_hk=mu-qt(.975,J-1)*hk,ci_ub_hk=mu+qt(.975,J-1)*hk,
    tau2_study=between,tau2_within=within,
    I2_study=between/den,I2_within=within/den,I2_sampling=typical/den)
  c(ref,setNames(vals,paste0('mom.',names(vals))))
}
check_one <- function(out,item,root) {
  evidence<-read_evidence(out,item);d<-evidence$data;a<-evidence$artifact
  # The allowed package list is an explicit task constraint, not a skipped check.
  allowed<-c('metafor','meta','netmeta','metadat')
  need(all(c(d$source_package,a$packages) %in% allowed),paste('Task package restriction conflicts with existing live recipe:',paste(setdiff(c(d$source_package,a$packages),allowed),collapse=', ')))
  source<-validate_source(d,root)
  bad_identity<-d;bad_identity$version<-paste0(d$version,'-wrong')
  need(tryCatch({validate_source(bad_identity,root);FALSE},error=function(e)TRUE),'Planted source version escaped')
  bad_identity<-d;bad_identity$source_blob<-paste(rep('0',40),collapse='')
  need(tryCatch({validate_source(bad_identity,root);FALSE},error=function(e)TRUE),'Planted source blob identity escaped')
  # Plant damages an actual shipped source row, not a result/reference tolerance.
  bad_source<-d;target<-NULL
  for(i in seq_along(d$values)) {
    numeric_fields<-names(d$values[[i]])[vapply(d$values[[i]],finite_scalar,TRUE)]
    if(length(numeric_fields)) {target<-list(i=i,key=numeric_fields[1]);break}
  }
  need(!is.null(target),'No numeric source-row plant target')
  bad_source$values[[target$i]][[target$key]]<-bad_source$values[[target$i]][[target$key]]+1
  rejected<-tryCatch({validate_source(bad_source,root);FALSE},error=function(e)TRUE)
  need(rejected,'Perturbed source row escaped source equality check')
  p<-project_source(item$app,source);validate_projection(a,p)
  for(pkg in a$packages)need(requireNamespace(pkg,quietly=TRUE),paste('Missing analysis package:',pkg))
  need(!any(grepl('jsonlite::|requireNamespace\\([\"\']jsonlite',a$script)),'Unexpected JSON serializer dependency')
  e<-new.env(parent=globalenv())
  invisible(capture.output(eval(parse(text=a$script),envir=e)))
  need(exists('alm_result',envir=e,inherits=FALSE),'R result list missing')
  ref<-base::get('alm_result',envir=e,inherits=FALSE)
  need(is.list(ref),'R result must be a named list')
  ref<-add_reported_values(item$app,ref,p)
  # R NA represents the live adapter's declared JSON-null output only.
  ref<-lapply(ref,function(x)if(length(x)==1L&&is.na(x))NULL else x)
  validate_fit_inputs(item$app,e,p)
  need(compare_result(a,ref),'Numerical or displayed-result comparison failed')
  bad<-a;i<-which(vapply(bad$appValues,function(v)finite_scalar(v$value),TRUE))[1]
  need(!is.na(i),'No numeric planted-defect target')
  bad$appValues[[i]]$value<-bad$appValues[[i]]$value+1
  invisible(capture.output(rejected<-!compare_result(bad,ref)))
  need(rejected,'Planted numerical defect escaped')
  bad<-a;bad$display[[1]]$value<-bad$display[[1]]$value+1
  need(!compare_result(bad,ref),'Planted display defect escaped')
  cat('PLANT_DETECTED',item$app,'source-row, result, display\n')
  cat('PASS',item$app,item$dataset,length(a$appValues),'quantities\n')
  TRUE
}
run_examples <- function(root) {
  out<-normalizePath(file.path(root,'../../hub/shared/tests/rchecks-out/examples'),mustWork=FALSE)
  need(same(.2,.2,'abs',1e-9),'Comparator control failed')
  need(!same(.2,.3,'abs',1e-9) && !same(NA_real_,NA_real_,'abs',1e-9) && !same(NULL,1,'abs',1e-9),'Comparator planted defect escaped')
  manifest<-read_csv(file.path(out,'manifest.csv'))
  need(identical(sort(as.integer(manifest$paper)),as.integer(c(3:17,19))),'Example paper coverage differs')
  expected<-c('dta-sroc','nma','heterogeneity','pubbias-tests','multilevel-ma','meta-regression','proportion-ma','mh-peto','influence','limit-ma','gosh','cumulative-subgroup','rve-meta','nma-inconsistency','correlation-ma','component-nma')
  need(setequal(manifest$app,expected)&&!anyDuplicated(manifest$app),'Example app coverage differs')
  passed<-0L
  for(i in seq_len(nrow(manifest))) {
    item<-as.list(manifest[i,,drop=FALSE])
    ok<-tryCatch(check_one(out,item,root),error=function(e){cat('FAIL',item$app,conditionMessage(e),'\n');FALSE})
    if(ok)passed<-passed+1L
  }
  cat(sprintf('EXAMPLES %d/%d\n',passed,nrow(manifest)))
  if(passed!=nrow(manifest))return(1L)
  cat('PLANT_DETECTED\n')
  cat('R_CHECK_PASS\n');0L
}
if(sys.nframe()==0L) {
  script<-sub('^--file=','',grep('^--file=',commandArgs(),value=TRUE)[1])
  status<-tryCatch(run_examples(dirname(normalizePath(script))),error=function(e){cat('EXAMPLES ERROR:',conditionMessage(e),'\n');1L})
  quit(save='no',status=status)
}
