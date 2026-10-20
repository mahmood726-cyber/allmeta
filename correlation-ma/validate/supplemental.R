suppressPackageStartupMessages(library(metafor)); suppressPackageStartupMessages(library(metadat))
print(.libPaths()); print(R.version.string); print(packageVersion('metafor')); print(packageVersion('metadat'))
items <- list(
 'two-studies'=list(r=c(.2,-.3),n=c(20,30)),
 'near-boundary'=list(r=c(.9999999999999999,-.9999999999999999),n=c(4,4)),
 'built-in'=list(r=c(.45,.30,.55,.20,.38,.62,.28,.50),n=c(40,55,30,80,65,25,90,45)))
supp <- lapply(names(items),function(id){
 d <- items[[id,exact=TRUE]]; r <- d[['r',exact=TRUE]]; n <- d[['n',exact=TRUE]]
 z <- escalc(measure='ZCOR',ri=r,ni=n)
 list(id=id,accepted=seq_along(r),z=unname(z[['yi',exact=TRUE]]),v=unname(z[['vi',exact=TRUE]]),studies=lapply(seq_along(r),function(i)list(label=paste0('row-',i),r=r[i],n=n[i])))
})
saveRDS(supp,'supplemental-corpus.rds')
Sys.setenv(P17_REFERENCE_INPUT='supplemental-corpus.rds',P17_REFERENCE_PREFIX='supplemental-')
source('reference.R')
