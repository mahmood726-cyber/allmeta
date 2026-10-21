print(.libPaths())
for(p in c('metafor','metadat','jsonlite')) cat(p,as.character(packageVersion(p)),'\n')
stopifnot(as.character(packageVersion('metafor'))=='5.2.1',as.character(packageVersion('metadat'))=='1.6.0',as.character(packageVersion('jsonlite'))=='2.0.0')
suppressPackageStartupMessages(library(metafor))
source('meta-regression/validate/reference.R')
out<-'meta-regression/validate/plus'
dir.create(out,recursive=TRUE,showWarnings=FALSE)
corpus<-list(); refs<-list(); ledger<-list()
add<-function(id,d,y,v,used,measure) {
  numeric<-names(d)[vapply(d,is.numeric,TRUE)]
  candidates<-setdiff(numeric,c(used,'yi','vi','sei','se','id','study','trial','obs','esid','studyid','study_id','sampleid','SampleID'))
  eligible<-candidates[vapply(candidates,function(n) length(unique(d[[n]][is.finite(d[[n]])]))>=2,TRUE)]
  # Prefer substantive covariates; sample-size variables remain documented candidates.
  priority<-c('year','Year','pubyear','age','meanage','baseline.age','ablat','dose','duration','length','weeks','grade','quality','score','ni')
  eligible<-unique(c(intersect(priority,eligible),sort(eligible)))
  chosen<-head(eligible,3)
  entry<-list(dataset=id,measure=measure,candidate_moderators=eligible,selected_moderators=chosen,excluded_moderators=setdiff(candidates,eligible),reason='',configurations=list())
  if(length(chosen)<2) {entry$reason<-'Fewer than two varying numeric moderators after excluding outcome fields and row identifiers';return(entry)}
  for(m in 2:length(chosen)) for(interaction in c(FALSE,TRUE)) {
    nms<-chosen[seq_len(m)]; z<-as.matrix(d[,nms,drop=FALSE]); valid<-is.finite(y)&is.finite(v)&v>0&apply(z,1,function(r)all(is.finite(r)))
    complete<-which(valid); sampled_out<-integer()
    if(length(complete)>80) {sampled_out<-complete[-seq_len(80)];valid[sampled_out]<-FALSE}
    cid<-paste(id,measure,m,if(interaction)'interaction' else 'additive',sep='::')
    input<-list(id=cid,dataset=id,measure=measure,source_rows=unname(which(valid)),yi=unname(y[valid]),vi=unname(v[valid]),mods=unname(lapply(which(valid),function(i)unname(z[i,]))),names=nms,interaction=interaction)
    entry$configurations[[length(entry$configurations)+1]]<-list(id=cid,rows=sum(valid),excluded_rows=setdiff(which(!valid),sampled_out),sampled_out_rows=sampled_out,sampling_rule='First 80 complete rows in original row order; bounded numerical test corpus, not a reanalysis of the complete study')
    if(sum(valid)==0) {entry$configurations[[length(entry$configurations)]]$reason<-'No complete finite rows with positive variance';next}
    r<-plus_reference(input)
    corpus[[length(corpus)+1]]<<-input;refs[[length(refs)+1]]<<-list(id=cid,result=r)
  }
  entry
}
for(id in data(package='metadat')$results[,'Item']) {
  e<-new.env();data(list=id,package='metadat',envir=e);d<-e[[id]]
  if(!is.data.frame(d)) {ledger[[length(ledger)+1]]<-list(dataset=id,reason='Not a flat study-level data frame; nested/phylogenetic/network representation requires a specified contrast and dependence model');next}
  effects<-list()
  pair<-function(a,b,squared=FALSE,measure=a) if(all(c(a,b)%in%names(d))&&is.numeric(d[[a]])&&is.numeric(d[[b]])) effects[[length(effects)+1]]<<-list(y=d[[a]],v=if(squared)d[[b]]^2 else d[[b]],used=c(a,b),measure=measure)
  pair('yi','vi'); pair('es.z','vi.z');pair('logOR','varlogOR');pair('smd','se',TRUE);pair('diff','se',TRUE);pair('b','SE',TRUE);pair('lnHR','selnHR',TRUE);pair('mean','se',TRUE);pair('mean','SE',TRUE)
  for(a in grep('(logrr|logrrr|md)$',names(d),value=TRUE)) pair(a,sub('(logrr|logrrr|md)$','se',a),TRUE)
  for(i in 1:4)pair(paste0('y',i,'i'),paste0('v',i,'i'))
  esc<-function(measure,fields,keys) if(all(fields%in%names(d))) {
    args<-setNames(lapply(fields,function(n)d[[n]]),keys)
    ans<-tryCatch(suppressWarnings(do.call(escalc,c(list(measure=measure),args))),error=function(e)NULL)
    if(!is.null(ans))effects[[length(effects)+1]]<<-list(y=ans$yi,v=ans$vi,used=fields,measure=measure)
  }
  if(!length(effects)) {
    esc('RR',c('ai','n1i','ci','n2i'),c('ai','n1i','ci','n2i'))
    esc('RR',c('tpos','tneg','cpos','cneg'),c('ai','bi','ci','di'))
    esc('OR',c('waward','wtotal','maward','mtotal'),c('ai','n1i','ci','n2i'))
    esc('RR',c('Ee','Ne','Ec','Nc'),c('ai','n1i','ci','n2i'))
    esc('RR',c('xt','nt','xc','nc'),c('ai','n1i','ci','n2i'))
    esc('RR',c('hcq_arm_event','hcq_arm_total','control_arm_event','control_arm_total'),c('ai','n1i','ci','n2i'))
    esc('RR',c('x.a','n.a','x.p','n.p'),c('ai','n1i','ci','n2i'))
    esc('RR',c('x.nrt','n.nrt','x.ctrl','n.ctrl'),c('ai','n1i','ci','n2i'))
    esc('OR',c('n.cbt.rec','n.cbt.non','n.ctrl.rec','n.ctrl.non'),c('ai','bi','ci','di'))
    esc('OR',c('lh.le','lh.re','rh.le','rh.re'),c('ai','bi','ci','di'))
    for(endpoint in c('mi','stroke','death','vdeath'))esc('RR',c(paste0('p2y12.',endpoint),'p2y12.total',paste0('aspirin.',endpoint),'aspirin.total'),c('ai','n1i','ci','n2i'))
    for(endpoint in c('infarction','death'))esc('RR',c(paste0('treat.',endpoint),'treat.total',paste0('cont.',endpoint),'cont.total'),c('ai','n1i','ci','n2i'))
    esc('SMD',c('m1i','sd1i','n1i','m2i','sd2i','n2i'),c('m1i','sd1i','n1i','m2i','sd2i','n2i'))
    esc('SMD',c('Me','Se','Ne','Mc','Sc','Nc'),c('m1i','sd1i','n1i','m2i','sd2i','n2i'))
    esc('ZCOR',c('ri','ni'),c('ri','ni'))
    esc('ZCOR',c('r','n'),c('ri','ni'))
    esc('PLO',c('events','total'),c('xi','ni'))
    esc('PLO',c('cases','total'),c('xi','ni'))
    esc('PLO',c('depr','n'),c('xi','ni'))
    esc('IRR',c('x1i','t1i','x2i','t2i'),c('x1i','t1i','x2i','t2i'))
  }
  if(!length(effects))ledger[[length(ledger)+1]]<-list(dataset=id,columns=names(d),reason='No precomputed effect/variance pair or unambiguous supported contrast mapping; raw arms, diagnostic, network, reliability or specialised outcomes require an explicit effect definition')
  # Disambiguate multiple endpoints with the actual source column names.
  if(length(effects)>1) for(j in seq_along(effects))effects[[j]]$measure<-paste(effects[[j]]$measure,paste(effects[[j]]$used,collapse='+'),sep=':')
  all_used<-unique(unlist(lapply(effects,function(es)es$used)))
  for(es in effects)ledger[[length(ledger)+1]]<-add(id,d,es$y,es$v,all_used,es$measure)
  cat(id,length(corpus),'configurations so far\n')
}
write<-function(x,name)writeLines(jsonlite::toJSON(x,auto_unbox=TRUE,digits=NA,pretty=TRUE,null='null',na='null'),file.path(out,name),useBytes=TRUE)
write(corpus,'corpus.json');write(refs,'reference.json');write(ledger,'candidates.json')
cat('TOTAL',length(corpus),'configurations;',sum(vapply(refs,function(r)r$result$status=='ok',TRUE)),'fits;',length(unique(vapply(corpus,function(c)c$dataset,''))),'datasets\n')
