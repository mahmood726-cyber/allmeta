# Native R oracle for the mh-peto v2 additions. Full archive corpus (336 configurations x OR/RR/RD).
#  - rma.mh / rma.peto (archive settings): beta, se, z, p, CI, QE, QEp, I2, H2; CMH, Tarone, Breslow-Day for OR
#  - leave1out() of both fits (k >= 3)
#  - rare-event conventions: meta::metabin(sm, method = "MH") with its defaults; rma(escalc defaults, method = "EE")
#  - text claims shown on the page (validate/plus-corpus/claims-plus.json): metabin(MH.exact = TRUE) against the page's MH
#    (OR/RR agree, RD SE differs); default rma.mh(ai,bi,ci,di) against the page's call (Q/I2 differ on tables with a
#    double-zero or all-event study; CMH differs because correct = TRUE); one pinned double-zero example
# Run from mh-peto/:  Rscript validate/generate-plus.R   -> validate/plus-corpus/reference-plus.json + claims-plus.json
#                     Rscript validate/generate-plus.R --claims-only   -> claims-plus.json only
# (stops unless metafor 5.2-1 and meta 8.5-0; prints .libPaths() and versions)
args <- c('validate/corpus/corpus.json', 'validate/plus-corpus/reference-plus.json', 'validate/plus-corpus/claims-plus.json')
claimsOnly <- '--claims-only' %in% commandArgs(TRUE)
suppressMessages({library(metafor); library(meta); library(jsonlite)})
versions <- list(R=R.version.string, metafor=as.character(packageVersion('metafor')), meta=as.character(packageVersion('meta')), jsonlite=as.character(packageVersion('jsonlite')))
cat('libPaths:', paste(.libPaths(), collapse=' | '), '\n'); print(unlist(versions))
corpus <- fromJSON(args[1], simplifyVector=FALSE)
num <- function(x) { x <- unname(x); if (length(x) != 1 || is.null(x) || is.na(x) || !is.finite(x)) NULL else as.numeric(x) }
fitvals <- function(f, extra=character()) {
  out <- list(beta=num(f$beta), se=num(f$se), zval=num(f$zval), pval=num(f$pval), ci.lb=num(f$ci.lb), ci.ub=num(f$ci.ub),
              QE=num(f$QE), QEp=num(f$QEp), I2=num(f$I2), H2=num(f$H2))
  for (e in extra) out[[e]] <- num(f[[e]])
  out
}
l1o <- function(f) {
  l <- leave1out(f)
  lapply(seq_along(l$estimate), function(i) list(beta=num(l$estimate[i]), se=num(l$se[i]), zval=num(l$zval[i]), pval=num(l$pval[i]),
    ci.lb=num(l$ci.lb[i]), ci.ub=num(l$ci.ub[i]), QE=num(l$Q[i]), QEp=num(l$Qp[i]), I2=num(l$I2[i]), H2=num(l$H2[i])))
}
# Manual loop, used only when the full-data fit itself errors (leave1out needs a fitted object).
manual <- function(fun, ai, bi, ci, di) lapply(seq_along(ai), function(i) tryCatch(suppressWarnings(fitvals(fun(ai[-i], bi[-i], ci[-i], di[-i]))), error=function(e) list(error=conditionMessage(e))))
out <- list()
for (cfg in if (claimsOnly) list() else corpus) {
  ai <- as.numeric(sapply(cfg$rows, `[[`, 'ai')); bi <- as.numeric(sapply(cfg$rows, `[[`, 'bi'))
  ci <- as.numeric(sapply(cfg$rows, `[[`, 'ci')); di <- as.numeric(sapply(cfg$rows, `[[`, 'di')); k <- length(ai)
  for (m in c('OR', 'RR', 'RD')) {
    id <- paste0(cfg$id, '|', m); e <- list(k=k)
    if (k < 2) { e$skip <- 'k<2'; out[[id]] <- e; next }
    MH <- function(a, b, c, d) rma.mh(ai=a, bi=b, ci=c, di=d, measure=m, add=c(.5, 0), to=c('only0', 'none'), drop00=c(FALSE, FALSE), correct=FALSE)
    fm <- tryCatch(suppressWarnings(MH(ai, bi, ci, di)), error=function(err) err)
    e$mh <- if (inherits(fm, 'error')) list(error=conditionMessage(fm)) else fitvals(fm, if (m == 'OR') c('MH', 'MHp', 'TA', 'TAp', 'BD', 'BDp') else character())
    if (k >= 3) e$mh_loo <- if (inherits(fm, 'error')) manual(MH, ai, bi, ci, di) else suppressWarnings(l1o(fm))
    if (m == 'OR') {
      PE <- function(a, b, c, d) rma.peto(ai=a, bi=b, ci=c, di=d, add=0, to='none', drop00=TRUE)
      fp <- tryCatch(suppressWarnings(PE(ai, bi, ci, di)), error=function(err) err)
      e$peto <- if (inherits(fp, 'error')) list(error=conditionMessage(fp)) else fitvals(fp)
      if (k >= 3) e$peto_loo <- if (inherits(fp, 'error')) manual(PE, ai, bi, ci, di) else suppressWarnings(l1o(fp))
    }
    mb <- tryCatch(suppressWarnings(metabin(ai, ai + bi, ci, ci + di, sm=m, method='MH', common=TRUE, random=FALSE)), error=function(err) err)
    mbv <- function(x) list(beta=num(x$TE.common), se=num(x$seTE.common), pval=num(x$pval.common), lo=num(x$lower.common), hi=num(x$upper.common))
    e$metamh <- if (inherits(mb, 'error')) list(error=conditionMessage(mb)) else mbv(mb)
    # Diagnostic only, never the reference: metabin also fits a REML tau2 (for its heterogeneity output) even with
    # random = FALSE; when that fit fails, refit with method.tau = 'DL', which does not enter the common-effect MH estimate.
    if (inherits(mb, 'error')) e$metamh$fallback_dl <- tryCatch(mbv(suppressWarnings(metabin(ai, ai + bi, ci, ci + di, sm=m, method='MH', common=TRUE, random=FALSE, method.tau='DL'))), error=function(err) list(error=conditionMessage(err)))
    es <- escalc(measure=m, ai=ai, bi=bi, ci=ci, di=di)
    iv <- tryCatch(suppressWarnings(rma(yi, vi, data=es, method='EE')), error=function(err) err)
    e$ivfe <- if (inherits(iv, 'error')) list(error=conditionMessage(iv)) else list(beta=num(iv$beta), se=num(iv$se), pval=num(iv$pval), lo=num(iv$ci.lb), hi=num(iv$ci.ub))
    out[[id]] <- e
  }
}
if (!claimsOnly) {
con <- file(args[2], 'wb')  # LF bytes on every platform (the file is SHA-256 pinned)
writeLines(toJSON(list(schema='mh-peto-v2-oracle-v1', versions=versions,
  calls=list(mh="rma.mh(ai,bi,ci,di,measure=m,add=c(.5,0),to=c('only0','none'),drop00=c(FALSE,FALSE),correct=FALSE)",
    peto="rma.peto(ai,bi,ci,di,add=0,to='none',drop00=TRUE)", loo='leave1out(fit)',
    metamh="metabin(ai,n1i,ci,n2i,sm=m,method='MH') defaults (incr=0.5, method.incr='only0', allstudies=FALSE, MH.exact=FALSE)",
    ivfe="rma(yi,vi,data=escalc(measure=m,ai,bi,ci,di),method='EE') (escalc defaults add=1/2, to='only0', drop00=FALSE)"),
  configurations=out), auto_unbox=TRUE, digits=NA, null='null'), con, useBytes=TRUE); close(con)
cat('DONE', length(out), 'configuration-measures\n')
}
# ---- text claims shown on the page (claims-plus.json) ----
mhOf <- function(ai, bi, ci, di, m, default) suppressWarnings(if (default) rma.mh(ai=ai, bi=bi, ci=ci, di=di, measure=m) else
  rma.mh(ai=ai, bi=bi, ci=ci, di=di, measure=m, add=c(.5, 0), to=c('only0', 'none'), drop00=c(FALSE, FALSE), correct=FALSE))
hetv <- function(f) list(beta=num(f$beta), se=num(f$se), QE=num(f$QE), QEp=num(f$QEp), I2=num(f$I2), H2=num(f$H2), MH=num(f$MH), MHp=num(f$MHp))
claims <- list()
for (cfg in corpus) {
  ai <- as.numeric(sapply(cfg$rows, `[[`, 'ai')); bi <- as.numeric(sapply(cfg$rows, `[[`, 'bi'))
  ci <- as.numeric(sapply(cfg$rows, `[[`, 'ci')); di <- as.numeric(sapply(cfg$rows, `[[`, 'di'))
  if (length(ai) < 2) next
  for (m in c('OR', 'RR', 'RD')) {
    e <- list()
    # metabin(MH.exact = TRUE), as a user following the page's note would call it. method.tau = 'DL' only when the
    # REML tau2 fit stops metabin (tau2 does not enter the common-effect MH estimate); recorded in tau.
    mx <- function(tau) { z <- suppressWarnings(metabin(ai, ai + bi, ci, ci + di, sm=m, method='MH', MH.exact=TRUE, common=TRUE, random=FALSE, method.tau=tau))
      list(beta=num(z$TE.common), se=num(z$seTE.common), pval=num(z$pval.common), tau=tau) }
    e$mhexact <- tryCatch(mx('REML'), error=function(err) tryCatch(mx('DL'), error=function(err2) list(error=conditionMessage(err2))))
    fd <- tryCatch(mhOf(ai, bi, ci, di, m, TRUE), error=function(err) err)
    e$mh_default <- if (inherits(fd, 'error')) list(error=conditionMessage(fd)) else hetv(fd)
    claims[[paste0(cfg$id, '|', m)]] <- e
  }
}
# Pinned double-zero example (rv610 review, 102_struct_k4): table 1 has no events in either group, table 2 has
# events in every participant of both groups.
pin <- list(e1=c(0, 51, 0, 3), n1=c(110, 51, 34, 43), e2=c(0, 61, 1, 3), n2=c(141, 61, 23, 82))
for (m in c('OR', 'RR')) {
  a <- pin$e1; b <- pin$n1 - pin$e1; c0 <- pin$e2; d <- pin$n2 - pin$e2
  pin[[m]] <- list(page=hetv(mhOf(a, b, c0, d, m, FALSE)), default=hetv(mhOf(a, b, c0, d, m, TRUE)))
}
con <- file(args[3], 'wb')  # LF bytes (SHA-256 pinned)
writeLines(toJSON(list(schema='mh-peto-v2-claims-v1', versions=versions,
  calls=list(mhexact="metabin(ai,n1i,ci,n2i,sm=m,method='MH',MH.exact=TRUE,common=TRUE,random=FALSE) (method.tau='DL' only if REML stops)",
    mh_default="rma.mh(ai,bi,ci,di,measure=m) with metafor's defaults"),
  rma.mh.formals=lapply(formals(rma.mh)[c('add', 'to', 'drop00', 'correct')], eval),
  configurations=claims, pinned=list(id='rv610_102_struct_k4', data=pin)), auto_unbox=TRUE, digits=NA, null='null'), con, useBytes=TRUE); close(con)
cat('DONE claims', length(claims), 'configuration-measures\n')
