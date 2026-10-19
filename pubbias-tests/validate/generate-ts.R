# Native R reference for the page's Thompson-Sharp test (fixed in this version):
# metafor::regtest(rma(yi, vi, method="REML"), model="rma", predictor="sei") on the 152 paper configurations.
# Run from pubbias-tests/:  Rscript validate/generate-ts.R   -> validate/plus-corpus/thompson-sharp-reference.json
.libPaths(c(Sys.getenv('R_LIBS_USER'), strsplit(Sys.getenv('R_LIBS'), ';')[[1]], .libPaths()))
cat('libPaths:', paste(.libPaths(), collapse=' | '), '\n')
suppressMessages({library(metafor); library(jsonlite)})
versions <- list(R=R.version.string, metafor=as.character(packageVersion('metafor')), jsonlite=as.character(packageVersion('jsonlite')))
cat('versions:', paste(names(versions), unlist(versions), sep='=', collapse='; '), '\n')
if (versions$metafor != '5.2.1') stop('Expected metafor 5.2-1')
js <- function(x) {
 if(is.null(x)) return('null')
 if(is.list(x)) {v<-vapply(x,js,''); if(!is.null(names(x)))return(paste0('{',paste(paste0(vapply(names(x),js,''),':',v),collapse=','),'}'));return(paste0('[',paste(v,collapse=','),']'))}
 if(length(x)!=1)return(paste0('[',paste(vapply(as.list(x),js,''),collapse=','),']'))
 if(is.na(x))return('null')
 if(is.character(x))return(paste0('"',gsub('"','\\"',x,fixed=TRUE),'"'))
 if(is.logical(x))return(if(x)'true' else 'false')
 if(!is.finite(x))return('null');sprintf('%.17g',x)
}
corpus <- fromJSON('validate/corpus/corpus.json', simplifyVector=FALSE)
stopifnot(length(corpus) == 152)
out <- list(); t0 <- Sys.time()
for (d in corpus) {
 y <- as.numeric(unlist(d$yi)); v <- as.numeric(unlist(d$vi))
 out[[d$id]] <- tryCatch({
  m <- rma(y, v, method='REML'); z <- regtest(m, model='rma', predictor='sei', ret.fit=TRUE)
  list(statistic=unname(z$zval), p=unname(z$pval), b0=unname(coef(z$fit)[2]), limit=unname(coef(z$fit)[1]), tau2=z$fit$tau2)
 }, error=function(e) list(error=conditionMessage(e)))
 cat(sprintf('%s k=%d %.1fs\n', d$id, length(y), as.numeric(difftime(Sys.time(), t0, units='secs'))))
}
res <- list(schema='pubbias-tests-thompson-sharp-reference-v1', versions=versions,
  call="m <- rma(yi, vi, method='REML'); regtest(m, model='rma', predictor='sei', ret.fit=TRUE)", datasets=out)
dir.create('validate/plus-corpus', showWarnings=FALSE)
writeLines(js(res), 'validate/plus-corpus/thompson-sharp-reference.json', useBytes=TRUE)
cat('DONE', length(out), format(Sys.time()), '\n')
