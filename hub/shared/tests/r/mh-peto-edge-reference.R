# Run from wt/: Rscript hub/shared/tests/r/mh-peto-edge-reference.R
# Writes evidence to the OS temporary directory, never to the validation archive.
# Copy the actual output to mh-peto-edge-reference.json beside this script after review.
suppressPackageStartupMessages({library(metafor); library(meta); library(jsonlite)})
input_path <- 'hub/shared/tests/r/mh-peto-edge-input.json'
script_path <- 'hub/shared/tests/r/mh-peto-edge-reference.R'
input <- fromJSON(input_path, simplifyVector=FALSE)
num <- function(x) if (length(x) == 1L && is.numeric(x) && is.finite(x)) unname(as.numeric(x)) else NULL
fields <- c('beta','se','z','p','lo','hi','QE','QEp','I2','H2','k','df')
empty <- function(keys) setNames(rep(list(NULL), length(keys)), keys)
fit_values <- function(f) {
  v <- c(list(beta=num(f$b), se=num(f$se), z=num(f$zval), p=num(f$pval),
              lo=num(f$ci.lb), hi=num(f$ci.ub)),
         lapply(f[c('QE','QEp','I2','H2','k')], num), list(df=num(f$k - 1)))
  v[fields]
}
# Keep R errors and warnings as evidence; no fallback estimator or changed tolerance.
capture <- function(expr, pack, keys) {
  warnings <- character()
  result <- tryCatch(withCallingHandlers(expr, warning=function(w) {
    warnings <<- c(warnings, conditionMessage(w)); invokeRestart('muffleWarning')
  }), error=function(e)e)
  if (inherits(result, 'error')) return(list(values=empty(keys), error=conditionMessage(result), warnings=as.list(warnings)))
  list(values=pack(result), error=NULL, warnings=as.list(warnings))
}
mh <- function(d,m) rma.mh(ai=d$e1, bi=d$n1-d$e1, ci=d$e2, di=d$n2-d$e2,
  measure=m, add=c(.5,0), to=c('only0','none'), drop00=c(FALSE,FALSE), correct=FALSE)
pe <- function(d) rma.peto(ai=d$e1, bi=d$n1-d$e1, ci=d$e2, di=d$n2-d$e2,
  add=0, to='none', drop00=TRUE)
assoc_keys <- c('MH','MHp','TA','TAp','BD','BDp')
conv_keys <- fields[1:6]
pool <- function(d,m) {
  out <- list(mh=capture(mh(d,m), fit_values, fields))
  if (m == 'OR') {
    out$peto <- capture(pe(d), fit_values, fields)
    out$association <- capture(mh(d,m), function(f) setNames(lapply(assoc_keys, function(k) num(f[[k]])), assoc_keys), assoc_keys)
  }
  out
}
configurations <- list()
for (cfg in input$cases) {
  d <- do.call(rbind, lapply(cfg$rows, as.data.frame))
  for (m in c('OR','RR','RD')) {
    id <- paste(cfg$id,m,sep='|')
    e <- pool(d,m)
    e$meta <- capture(metabin(d$e1,d$n1,d$e2,d$n2, sm=m, method='MH', common=TRUE, random=FALSE),
      function(f) list(beta=num(f$TE.common),se=num(f$seTE.common),z=num(f$statistic.common),
        p=num(f$pval.common),lo=num(f$lower.common),hi=num(f$upper.common)),conv_keys)
    es <- escalc(measure=m, ai=d$e1,bi=d$n1-d$e1,ci=d$e2,di=d$n2-d$e2,
      add=.5,to='only0',drop00=FALSE)
    e$iv <- capture(rma(yi,vi,data=es,method='EE',test='z'),function(f)fit_values(f)[conv_keys],conv_keys)
    # Display OR/RR use only0 correction; RD is explicitly uncorrected.
    study_es <- suppressWarnings(escalc(measure=m,ai=d$e1,bi=d$n1-d$e1,ci=d$e2,di=d$n2-d$e2,
      add=if(m == 'RD')0 else .5,to=if(m == 'RD')'none' else 'only0',drop00=FALSE))
    e$studies <- lapply(seq_len(nrow(d)),function(i) {
      b <- study_es$yi[i]; se <- sqrt(study_es$vi[i]); tr <- if(m == 'RD')identity else exp
      list(est=num(tr(b)),lo=num(tr(b-qnorm(.975)*se)),hi=num(tr(b+qnorm(.975)*se)))
    })
    # This is the separate DL baseline used by the app's fragility panel.
    dl_es <- suppressWarnings(escalc(measure=m,ai=d$e1,bi=d$n1-d$e1,ci=d$e2,di=d$n2-d$e2,
      add=.5,to='only0',drop00=TRUE))
    e$dl <- capture(rma(yi,vi,data=dl_es,method='DL',test='z'),
      function(f)list(beta=num(f$b),lo=num(f$ci.lb),hi=num(f$ci.ub),tau2=num(f$tau2)),c('beta','lo','hi','tau2'))
    if (nrow(d) >= 3) {
      # Explicit canonical refits also cover omissions where the fit errors or k_effective=1.
      e$loo <- lapply(seq_len(nrow(d)),function(i)pool(d[-i,,drop=FALSE],m))
    }
    configurations[[id]] <- e
  }
}
pkgs <- c('metafor','meta','metadat','jsonlite')
provenance <- list(R=R.version.string,packages=setNames(lapply(pkgs,function(p)as.character(packageVersion(p))),pkgs),
  input_md5=unname(tools::md5sum(input_path)),script_md5=unname(tools::md5sum(script_path)),
  numeric_precision='jsonlite digits=NA',
  calls=list(mh="rma.mh(add=c(.5,0),to=c('only0','none'),drop00=c(FALSE,FALSE),correct=FALSE)",
    peto="rma.peto(add=0,to='none',drop00=TRUE)",meta="metabin(sm=m,method='MH',common=TRUE,random=FALSE); defaults unchanged",
    iv="rma(escalc(add=.5,to='only0',drop00=FALSE),method='EE',test='z')",
    dl="rma(escalc(add=.5,to='only0',drop00=TRUE),method='DL',test='z')",
    loo='canonical rma.mh/rma.peto refits after each omission; no fit below k_input=2',
    pi='Not offered by mh-peto; no prediction interval reference'))
out <- list(schema='mh-peto-edge-reference-v1',provenance=provenance,input=input,configurations=configurations)
path <- file.path(dirname(tempdir()),'rpar-P10-mh-peto-edge-reference.json')
con <- file(path,'wb')
writeLines(toJSON(out,auto_unbox=TRUE,digits=NA,null='null',na='null',pretty=TRUE),con,useBytes=TRUE)
close(con)
cat('REFERENCE_FILE=',normalizePath(path,winslash='/'), '\n',sep='')
cat(toJSON(provenance,auto_unbox=TRUE,pretty=TRUE), '\n')
cat('CONFIGURATIONS=',length(configurations),'\n',sep='')
