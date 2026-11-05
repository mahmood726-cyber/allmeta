# Run once from wt/. The JSON is the retained native-R oracle, not a test log.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(metadat))
output <- 'hub/shared/tests/unit/p08-bcg-reference.json'
if (file.exists(output)) stop('Refusing to overwrite the recorded reference')
json <- function(x) {
  if (is.list(x)) {
    fields <- vapply(x, json, character(1))
    if (!is.null(names(x))) return(paste0('{', paste(paste0(encodeString(names(x), quote='"'), ':', fields), collapse=','), '}'))
    return(paste0('[', paste(fields, collapse=','), ']'))
  }
  if (length(x) != 1L) return(json(as.list(x)))
  if (is.character(x) && !is.na(x)) return(encodeString(x, quote='"'))
  if (is.numeric(x) && is.finite(x)) return(trimws(formatC(x, digits=17, format='g', decimal.mark='.')))
  stop('Unsupported reference value')
}
data(dat.bcg, package='metadat')
d <- escalc(measure='RR', ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg)
summarise <- function(f) {
  pred <- predict(f, newmods=mean(d$ablat))
  list(k=f$k, beta=as.numeric(coef(f)), se=as.numeric(f$se), ci_lb=as.numeric(f$ci.lb), ci_ub=as.numeric(f$ci.ub), pval=as.numeric(f$pval), tau2=f$tau2, R2=f$R2, QE=f$QE, QEp=f$QEp, pred=as.numeric(pred$pred), pred_se=as.numeric(pred$se), pi_lb=as.numeric(pred$pi.lb), pi_ub=as.numeric(pred$pi.ub))
}
ref <- list(provenance=list(R=R.version.string, metafor=as.character(packageVersion('metafor')), metadat=as.character(packageVersion('metadat')), script_md5=unname(tools::md5sum('hub/shared/tests/unit/p08-bcg-reference.R')), serialization='base R; 17 significant digits', effect='escalc(measure="RR", ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg)', PM='rma(yi, vi, mods=~ablat, data=d, method="PM", test="adhoc", control=list(tol=1e-12))', PM_default='same PM/adhoc model with default convergence controls', REML_default='rma(yi, vi, mods=~ablat, data=d): default REML and z test'),
  rows=lapply(seq_len(nrow(d)), function(i) as.list(d[i,c('trial','author','year','tpos','tneg','cpos','cneg','ablat','yi','vi')])),
  PM=summarise(rma(yi,vi,mods=~ablat,data=d,method='PM',test='adhoc',control=list(tol=1e-12))),
  PM_default=summarise(rma(yi,vi,mods=~ablat,data=d,method='PM',test='adhoc')),
  REML_default=summarise(rma(yi,vi,mods=~ablat,data=d)))
writeLines(json(ref), output, useBytes=TRUE)
cat(json(ref), '\n')
