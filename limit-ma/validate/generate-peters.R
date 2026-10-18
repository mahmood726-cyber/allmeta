# Binary extension of the existing dat.bcg configuration; no additional cases.
.libPaths(c('../re/Rlib_dta', Sys.getenv('R_LIBS'), .libPaths()))
versions <- vapply(c('metafor','meta','metasens','metadat'),function(p)as.character(packageVersion(p)),'')
print(versions);stopifnot(versions[['metafor']]=='5.2.1',versions[['meta']]=='8.5.0',versions[['metasens']]=='1.5.3')
invisible(parse('validate/generate-plus.R'))
c <- jsonlite::fromJSON('validate/plus/corpus.json',simplifyVector=FALSE)
r <- jsonlite::fromJSON('validate/plus/reference.json',simplifyVector=FALSE)
data('dat.bcg',package='metadat')
found <- 0
for(i in seq_along(c))if(c[[i]]$dataset=='dat.bcg'){
 z<-c[[i]];d<-dat.bcg[unlist(z$source_rows),];
 m<-meta::metabin(d$tpos,d$tpos+d$tneg,d$cpos,d$cpos+d$cneg,sm='RR',method='Inverse',method.tau='DL',method.tau.ci='')
 stopifnot(max(abs(m$TE-unlist(z$te)))<1e-12,max(abs(m$seTE-unlist(z$se)))<1e-12,
           all(d$tpos>0),all(d$tneg>0),all(d$cpos>0),all(d$cneg>0))
 c[[i]]$binary<-list(measure='RR',rows=lapply(seq_len(nrow(d)),function(j)as.list(unname(c(d$tpos[j],d$tpos[j]+d$tneg[j],d$cpos[j],d$cpos[j]+d$cneg[j])))))
 p<-meta::metabias(m,method.bias='Peters',k.min=10)
 r[[i]]$methods$Peters<-list(status='ok',values=list(statistic=unname(p$statistic),df=unname(p$df),p=p$pval))
 found<-found+1
}
stopifnot(found==1,length(c)==169,length(r)==169)
jsonlite::write_json(c,'validate/plus/corpus.json',auto_unbox=TRUE,digits=NA,pretty=TRUE,null='null')
jsonlite::write_json(r,'validate/plus/reference.json',auto_unbox=TRUE,digits=NA,pretty=TRUE,null='null')
cat('PETERS SOURCE-VERIFIED',found,'existing configuration; host',Sys.info()[['nodename']],'\n')