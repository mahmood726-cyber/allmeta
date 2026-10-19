# generate-plus.R -- independent metafor oracle for the correlation-ma "plus" panel (paper 17).
# Inputs: corpus.rds (the 17 archived P17 inputs; unmodified) + supplemental probes defined below.
# Output: reference-plus.json (17 significant digits), generate-plus.log (via the runner).
# For every input: REML/PM/DL/FE x test z | knha | adhoc (metafor rma.uni test= option),
# explicit t_{k-1} prediction interval mu +/- qt(.975,k-1)*sqrt(tau2+se^2) (se = the fit's SE),
# metafor predict() interval (negative control: qnorm-based for test="z"), and leave1out()
# for 3 <= k <= 200 (the browser cap) with explicit t_{k-2} PI per omission.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(metadat))
print(.libPaths()); print(R.version.string); print(packageVersion('metafor')); print(packageVersion('metadat'))
source('json17.R')
ctrl <- list(threshold=1e-12, maxiter=10000, stepadj=0.5, tol=.Machine$double.eps^0.75)
cat('rma.uni test= choices:', paste(eval(formals(metafor::rma.uni)$test), collapse=','), '\n')

# ---- archive the metafor source we rely on (predict.rma, leave1out.rma.uni, influence.rma.uni, rma.uni) ----
dir.create('metafor-source', showWarnings=FALSE)
for (nm in c('predict.rma','leave1out.rma.uni','influence.rma.uni','rma.uni')) {
  f <- get(nm, envir=asNamespace('metafor'))
  writeLines(deparse(f, control=c('keepNA','keepInteger','showAttributes')), file.path('metafor-source', paste0(nm, '.R')), useBytes=TRUE)
  cat('archived', nm, 'args:', paste(names(formals(f)), collapse=','), '\n')
}
cat('predict.rma has pi.type arg:', 'pi.type' %in% names(formals(get('predict.rma', envir=asNamespace('metafor')))), '\n')

corpus <- readRDS('corpus.rds')
inputs <- lapply(corpus, function(c) {
  acc <- c[['accepted', exact=TRUE]]
  st <- c[['studies', exact=TRUE]][acc]
  list(id=c[['id', exact=TRUE]], source='P17 corpus.rds',
       studies=lapply(st, function(s) list(label=s[['label', exact=TRUE]], r=s[['r', exact=TRUE]], n=s[['n', exact=TRUE]])),
       z=unname(c[['z', exact=TRUE]]), v=unname(c[['v', exact=TRUE]]))
})
probes <- list(
  'built-in'          = list(l=paste('Study', LETTERS[1:8]), r=c(.45,.30,.55,.20,.38,.62,.28,.50), n=c(40,55,30,80,65,25,90,45)),
  'two-studies'       = list(l=c('row-1','row-2'), r=c(.2,-.3), n=c(20,30)),
  'three-studies'     = list(l=c('S1','S2','S3'), r=c(.10,.40,.25), n=c(25,40,60)),
  'identical-effects' = list(l=c('S1','S2','S3'), r=c(.3,.3,.3), n=c(30,45,60)),
  'homogeneous-q-lt-1'= list(l=c('S1','S2','S3','S4'), r=c(.30,.31,.29,.305), n=c(200,180,220,210)),
  'near-boundary'     = list(l=c('row-1','row-2'), r=c(.9999999999999999,-.9999999999999999), n=c(4,4)),
  'near-plus-one'     = list(l=c('S1','S2','S3'), r=c(.999,.995,.99), n=c(10,12,15)),
  'comma-label'       = list(l=c('Smith, 2001','Jones, 2003','Lee'), r=c(.35,.20,.50), n=c(50,70,30)),
  'injection-label'   = list(l=c('x"); system("echo pwned', "y'); q('no", 'back\\slash'), r=c(.15,.25,.05), n=c(60,45,80)),
  'loo-flip'          = list(l=c('S1','S2','S3','S4','S5'), r=c(.25,.20,.30,.18,-.10), n=c(30,25,40,35,300))
)
for (id in names(probes)) {
  p <- probes[[id]]; es <- escalc(measure='ZCOR', ri=p$r, ni=p$n)
  inputs[[length(inputs)+1]] <- list(id=paste0('plus-probe::', id), source='generate-plus.R probe',
    studies=lapply(seq_along(p$r), function(i) list(label=p$l[i], r=p$r[i], n=p$n[i])),
    z=unname(as.numeric(es$yi)), v=unname(as.numeric(es$vi)))
}

fitrec <- function(fit, k, method, test) {
  mu <- as.numeric(fit$b); se <- fit$se; t2 <- fit$tau2
  pr <- predict(fit)
  re <- method != 'FE'
  pit <- if (re) mu + c(-1,1)*qt(.975, k-1)*sqrt(t2 + se^2) else c(NA_real_, NA_real_)
  piz <- if (re) mu + c(-1,1)*qnorm(.975)*sqrt(t2 + se^2) else c(NA_real_, NA_real_)
  list(method=method, test=test, k=k, mu_z=mu, se_z=se, tau2_z=t2, tau_z=sqrt(t2), I2=fit$I2, Q=fit$QE, df=k-1,
       ciLo=fit$ci.lb, ciHi=fit$ci.ub, piLo=pit[1], piHi=pit[2],
       pred_piLo=if (re) as.numeric(pr$pi.lb) else NA_real_, pred_piHi=if (re) as.numeric(pr$pi.ub) else NA_real_,
       qnorm_piLo=piz[1], qnorm_piHi=piz[2],
       r=tanh(mu), r_lo=tanh(fit$ci.lb), r_hi=tanh(fit$ci.ub),
       r_pi_lo=if (re) tanh(pit[1]) else NA_real_, r_pi_hi=if (re) tanh(pit[2]) else NA_real_,
       app_applicable=!(method=='FE' && test!='z'))
}

loorec <- function(fit, k, method, test, full_mu, full_lo, full_hi) {
  l <- leave1out(fit)
  est <- as.numeric(l$estimate); se <- as.numeric(l$se); t2 <- if (method=='FE') rep(0,k) else as.numeric(l$tau2)
  re <- method != 'FE'
  pilo <- if (re) est - qt(.975, k-2)*sqrt(t2+se^2) else rep(NA_real_, k)
  pihi <- if (re) est + qt(.975, k-2)*sqrt(t2+se^2) else rep(NA_real_, k)
  full_ex <- (full_lo > 0) || (full_hi < 0)
  ex <- (as.numeric(l$ci.lb) > 0) | (as.numeric(l$ci.ub) < 0)
  dr <- tanh(est) - tanh(full_mu)
  list(method=method, test=test, k=k,
       mu_z=est, se_z=se, tau2_z=t2, I2=if (re) as.numeric(l$I2) else rep(NA_real_, k), Q=as.numeric(l$Q),
       ciLo=as.numeric(l$ci.lb), ciHi=as.numeric(l$ci.ub), piLo=pilo, piHi=pihi,
       r=tanh(est), r_lo=tanh(as.numeric(l$ci.lb)), r_hi=tanh(as.numeric(l$ci.ub)),
       delta_r=dr, full_ci_excludes_0=full_ex, ci_excludes_0=ex, changes_ci_excludes_0=(ex != full_ex),
       largest_abs_delta_index=which.max(abs(dr)))
}

out <- list(); nfit <- 0; nloo <- 0; warnings_all <- character()
t0 <- Sys.time()
for (inp in inputs) {
  k <- length(inp$z); y <- inp$z; v <- inp$v
  rec <- list(id=inp$id, source=inp$source, k=k, studies=inp$studies, z=y, v=v, sensitivity=list(), loo=list(), loo_refusal=NULL)
  if (k < 3) rec$loo_refusal <- 'k<3' else if (k > 200) rec$loo_refusal <- 'k>200'
  for (method in c('REML','PM','DL','FE')) for (test in c('z','knha','adhoc')) {
    w <- character()
    fit <- withCallingHandlers(rma(yi=y, vi=v, method=method, test=test, control=ctrl),
      warning=function(e) { w <<- c(w, conditionMessage(e)); invokeRestart('muffleWarning') })
    fr <- fitrec(fit, k, method, test); fr$warnings <- as.list(w); nfit <- nfit + 1
    rec$sensitivity[[length(rec$sensitivity)+1]] <- fr
    if (length(w)) warnings_all <- c(warnings_all, paste(inp$id, method, test, w))
    if (is.null(rec$loo_refusal)) {
      w2 <- character()
      lr <- withCallingHandlers(loorec(fit, k, method, test, fr$mu_z, fr$ciLo, fr$ciHi),
        warning=function(e) { w2 <<- c(w2, conditionMessage(e)); invokeRestart('muffleWarning') })
      lr$warnings <- as.list(w2); nloo <- nloo + k
      if (length(w2)) warnings_all <- c(warnings_all, paste(inp$id, method, test, 'loo', w2))
      rec$loo[[length(rec$loo)+1]] <- lr
    }
  }
  cat(sprintf('%s k=%d fits=%d loo=%s elapsed=%.1fs\n', inp$id, k, nfit, if (is.null(rec$loo_refusal)) 'yes' else rec$loo_refusal, as.numeric(Sys.time()-t0, units='secs')))
  out[[length(out)+1]] <- rec; saveRDS(out, 'reference-plus-partial.rds')
}
meta <- list(schema='corr-ma-plus-reference-v1', R=R.version.string, metafor=as.character(packageVersion('metafor')),
  metadat=as.character(packageVersion('metadat')), control=list(threshold=1e-12, maxiter=10000, stepadj=0.5, tol='.Machine$double.eps^0.75'),
  pi_rule='mu +/- qt(.975,k-1)*sqrt(tau2+se^2), se = fit SE (Wald or HKSJ); FE: none; LOO uses qt(.975,k-2)',
  adhoc_rule='metafor rma.uni test="adhoc": Knapp-Hartung with q floored at 1 (max(1,q))',
  n_inputs=length(out), n_fits=nfit, n_loo_fits=nloo, warnings=as.list(warnings_all))
write_json17(list(meta=meta, inputs=out), 'reference-plus.json')
cat(sprintf('PLUS-REFERENCE: inputs=%d fits=%d loo_omissions=%d warnings=%d\n', length(out), nfit, nloo, length(warnings_all)))
