# Adapted from the archived proportion validation corpus recipe.
# Source-backed mappings; executed by generate-plus.R in its output directory.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(metadat))
# JSON writer: 17 significant digits, non-finite values explicitly null.
js <- function(x) {
 if(is.null(x)) return('null')
 if(is.list(x)) { z<-vapply(x,js,''); if(!is.null(names(x))) return(paste0('{',paste(paste0(vapply(names(x),js,''),':',z),collapse=','),'}')); return(paste0('[',paste(z,collapse=','),']')) }
 if(length(x)!=1) return(paste0('[',paste(vapply(as.list(x),js,''),collapse=','),']'))
 if(is.na(x)) return('null')
 if(is.character(x)) return(paste0('"',gsub('\n','\\n',gsub('"','\\"',gsub('\\','\\\\',enc2utf8(x),fixed=TRUE),fixed=TRUE),fixed=TRUE),'"'))
 if(is.logical(x)) return(if(x)'true' else 'false')
 if(!is.finite(x)) return('null')
 sprintf('%.17g',x)
}
items<-sort(unique(data(package='metadat')$results[,'Item']))
corpus<-list(); manifest<-list(); omissions<-list()
add <- function(nm,d,x,n,group=NULL) {
 stopifnot(all(all.vars(parse(text=x)) %in% names(d)),all(all.vars(parse(text=n)) %in% names(d)))
 xx<-eval(parse(text=x),d); nn<-eval(parse(text=n),d)
 groups<-if(is.null(group)) rep('all',nrow(d)) else as.character(d[[group]])
 for(g in unique(groups[!is.na(groups)])) {
  sel<-which(groups==g); valid<-is.finite(xx[sel])&is.finite(nn[sel])&nn[sel]>0&xx[sel]>=0&xx[sel]<=nn[sel]&xx[sel]==floor(xx[sel])&nn[sel]==floor(nn[sel])
  ii<-sel[valid]; id<-paste(nm,x,n,g,sep='::')
  rows<-lapply(ii,function(i)list(x=xx[i],n=nn[i],label=paste0('row-',i),source_row=i))
  corpus[[length(corpus)+1]]<<-list(id=id,dataset=nm,x=x,n=n,group=g,rows=rows)
  omissions[[length(omissions)+1]]<<-list(id=id,source_rows=length(sel),used_rows=length(ii),excluded_rows=as.list(sel[!valid]),reason='Only finite integer counts with 0 <= x <= n and n > 0; no imputation; k<2 retained to test refusal')
 }
}
for(nm in items) {
 e<-new.env();data(list=nm,package='metadat',envir=e);d<-e[[nm]]; start<-length(corpus)
 if(is.data.frame(d)) {
  # Standard documented binary-arm schemas, applied to every matching dataset.
  if(all(c('ai','n1i','ci','n2i')%in%names(d))) {add(nm,d,'ai','n1i');add(nm,d,'ci','n2i')}
  if(all(c('Ee','Ne','Ec','Nc')%in%names(d))) {add(nm,d,'Ee','Ne');add(nm,d,'Ec','Nc')}
  if(all(c('xi','ni')%in%names(d))) add(nm,d,'xi','ni',if('trt'%in%names(d))'trt' else NULL)
  if(nm%in%c('dat.crisafulli2020','dat.obrien2003')) add(nm,d,'cases','total')
  if(nm%in%c('dat.roever2022','dat.ursino2021')) add(nm,d,'events','total')
  if(nm=='dat.bartos2023') {add(nm,d,'same','flips');add(nm,d,'hsame','hsame+hdiff');add(nm,d,'tsame','tsame+tdiff')}
  if(nm=='dat.axfors2021') for(a in c('hcq','control'))add(nm,d,paste0(a,'_arm_event'),paste0(a,'_arm_total'))
  if(nm=='dat.baker2009')add(nm,d,'exac','total','treatment')
  if(nm%in%c('dat.bcg','dat.colditz1994'))for(a in c('t','c'))add(nm,d,paste0(a,'pos'),paste0(a,'pos+',a,'neg'))
  if(nm=='dat.bornmann2007')for(a in c('w','m'))add(nm,d,paste0(a,'award'),paste0(a,'total'))
  if(nm=='dat.bourassa1996')for(a in c('lh','rh'))add(nm,d,paste0(a,'.le'),paste0(a,'.le+',a,'.re'))
  if(nm=='dat.cannon2006')for(a in c('t','c'))for(j in 1:6)add(nm,d,paste0('ep',j,a),paste0('n',a))
  if(nm=='dat.chiarito2020')for(a in c('p2y12','aspirin'))for(o in c('mi','stroke','death','vdeath'))add(nm,d,paste(a,o,sep='.'),paste0(a,'.total'))
  if(nm=='dat.collins1985a')for(a in c('t','c'))for(o in c('b','o','d'))add(nm,d,paste0(o,'.x',a,'i'),paste0('n',a,'i'))
  if(nm=='dat.collins1985b')for(a in c('t','c'))for(o in c('pre','ped','stb','ned'))add(nm,d,paste0(o,'.x',a,'i'),paste0(if(o=='pre')'pre' else 'fup','.n',a,'i'))
  if(nm%in%c('dat.dagostino1998','dat.damico2009'))for(a in c('t','c'))add(nm,d,paste0('x',a),paste0('n',a),if(nm=='dat.dagostino1998')'outcome' else NULL)
  if(nm=='dat.dogliotti2014')add(nm,d,'stroke','total','treatment')
  if(nm=='dat.dong2013')add(nm,d,'death','randomized','treatment')
  if(nm=='dat.dorn2007')for(a in c('a','p'))add(nm,d,paste0('x.',a),paste0('n.',a))
  if(nm=='dat.feng2019')add(nm,d,'depr','n')
  if(nm=='dat.fine1993')for(a in c('e','c'))for(j in 1:4)add(nm,d,paste0(a,j,'i'),paste0('n',a,'i'))
  if(nm=='dat.frank2008')for(a in c('bc','ct'))for(o in c('ins.ins','ins.del','del.del'))add(nm,d,paste(a,o,sep='.'),paste(paste(a,c('ins.ins','ins.del','del.del'),sep='.'),collapse='+'))
  if(nm=='dat.gurusamy2011')add(nm,d,'death','n','treatment')
  if(nm=='dat.hart1999')for(a in 1:2)add(nm,d,paste0('x',a,'i'),paste0('n',a,'i'))
  if(nm=='dat.hartmannboyce2018')for(a in c('nrt','ctrl'))add(nm,d,paste0('x.',a),paste0('n.',a))
  if(nm=='dat.higgins2008')for(a in c('halo','plac'))add(nm,d,paste0('resp.',a),paste0('resp.',a,'+fail.',a))
  if(nm=='dat.karner2014')for(a in c('tiotropium','placebo'))for(o in c('exa','sexa','hospi','deaths','sae','dropout'))add(nm,d,paste(a,o,sep='.'),paste0(a,'.total'))
  if(nm=='dat.kearon1998'){add(nm,d,'tp','np');add(nm,d,'tn','nn')}
  if(nm=='dat.landenberger2005')for(a in c('ctrl','cbt'))add(nm,d,paste0('n.',a,'.rec'),paste0('n.',a,'.rec+n.',a,'.non'))
  if(nm=='dat.linde2015')for(a in 1:3)for(o in c('resp','remi','loss','loss.ae','ae'))add(nm,d,paste0(o,a),paste0('n',a))
  if(nm=='dat.linde2016')add(nm,d,'resp','n','int')
  if(nm=='dat.nissen2007')for(a in c('treat','cont'))for(o in c('infarction','death'))add(nm,d,paste(a,o,sep='.'),paste0(a,'.total'))
  if(nm=='dat.rivera2025'){add(nm,d,'TP','TP+FN');add(nm,d,'TN','TN+FP')}
  if(nm=='dat.thompson1999')for(a in c('cont','exp'))add(nm,d,paste0('ihd.',a),paste0('ihd.',a,'+noihd.',a))
  if(nm=='dat.tian2009')for(o in c('deaths','infarcts'))add(nm,d,o,'n','group')
  if(nm=='dat.vanhowe1999')for(a in c('non','cir'))add(nm,d,paste0(a,'.pos'),paste0(a,'.pos+',a,'.neg'))
  if(nm=='dat.viechtbauer2021')for(a in c('T','C'))add(nm,d,paste0('x',a,'i'),paste0('n',a,'i'))
  if(nm=='dat.woods2010')add(nm,d,'r','N','treatment')
 }
 if(nm=='dat.metap') {add(paste0(nm,'$cholest'),d$cholest,'dtreat','ntreat');add(paste0(nm,'$cholest'),d$cholest,'dcontrol','ncontrol')}
 ids<-if(length(corpus)>start) vapply(corpus[(start+1):length(corpus)],function(z)z$id,'') else character()
 manifest[[nm]]<-list(status=if(length(ids))'used' else 'excluded',reason=if(length(ids))'Documented event counts and totals; each arm/outcome separate; see mappings and source manual' else 'No documented binomial event-count / denominator pair (continuous, correlation, effect-only, rate-only, or non-count nested data)',analyses=as.list(ids),columns=as.list(names(d)),manual=paste0('manuals/',nm,'.txt'))
}
writeLines(js(corpus),'corpus.json');writeLines(js(manifest),'manifest.json');writeLines(js(omissions),'row-audit.json')
