# Inspect the installed canonical package before classifying P10-COUNT-01.
# This supplements the pass-1 fixture; it never overwrites any reference value.
suppressPackageStartupMessages({library(metafor); library(jsonlite)})
input_path <- 'hub/shared/tests/r/mh-peto-edge-input.json'
script_path <- 'hub/shared/tests/r/mh-peto-count-diagnostic.R'
input <- fromJSON(input_path, simplifyVector=FALSE)
inspect <- function(d) {
  f <- tryCatch(suppressWarnings(rma.peto(ai=d$e1,bi=d$n1-d$e1,ci=d$e2,di=d$n2-d$e2,
    add=0,to='none',drop00=TRUE)), error=function(e)e)
  if (inherits(f,'error')) return(list(error=conditionMessage(f)))
  count_names <- grep('^k($|[.])',names(f),value=TRUE)
  list(counts=f[count_names],QE=f$QE,QEp=f$QEp,I2=f$I2,H2=f$H2,
    yi=unname(f$yi),vi=unname(f$vi),
    p_using_k_minus_1=pchisq(f$QE,df=f$k-1,lower.tail=FALSE))
}
fits <- list()
for (cfg in input$cases) {
  d <- do.call(rbind,lapply(cfg$rows,as.data.frame))
  fits[[paste0(cfg$id,'|full')]] <- inspect(d)
  if (nrow(d) >= 3) for (i in seq_len(nrow(d))) fits[[paste0(cfg$id,'|omit',i)]] <- inspect(d[-i,,drop=FALSE])
}
# Store the actual installed function body as evidence of which k Q uses.
source <- deparse(body(metafor::rma.peto))
out <- list(schema='mh-peto-count-diagnostic-v1',
  provenance=list(R=R.version.string,metafor=as.character(packageVersion('metafor')),
    jsonlite=as.character(packageVersion('jsonlite')),
    input_md5=unname(tools::md5sum(input_path)),script_md5=unname(tools::md5sum(script_path))),
  fits=fits,rma_peto_body=as.list(source))
path <- file.path(dirname(tempdir()),'rpar-P10-mh-peto-count-diagnostic.json')
con <- file(path,'wb')
writeLines(toJSON(out,auto_unbox=TRUE,digits=NA,null='null',na='null',pretty=TRUE),con,useBytes=TRUE)
close(con)
cat('DIAGNOSTIC_FILE=',normalizePath(path,winslash='/'),'\n',sep='')
cat(toJSON(out$provenance,auto_unbox=TRUE,pretty=TRUE),'\n')
for (id in names(fits)) {
  f <- fits[[id]]
  if (is.null(f$error)) cat(id,': ',toJSON(f[c('counts','QE','QEp','I2','H2','p_using_k_minus_1')],
    auto_unbox=TRUE,digits=NA,null='null',na='null'),'\n',sep='')
}
idx <- grep('k[.]|k <-|QE|QEp|H2|I2',source)
cat(paste(sprintf('%d: %s',idx,source[idx]),collapse='\n'),'\n')
