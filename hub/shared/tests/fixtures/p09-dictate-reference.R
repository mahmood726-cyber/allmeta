# Independent FE convention and unchanged pooled/RE reference values.
# Print JSON for retention as a fixture after this script has actually run.
suppressPackageStartupMessages(library(metafor))

# Base-R JSON for this fixture's lists, strings, and numbers. The runner does
# not have jsonlite; preserve full precision and represent unavailable PIs as null.
json <- function(value) {
  if (is.list(value)) {
    parts <- vapply(value, json, character(1))
    if (!is.null(names(value))) {
      parts <- paste0(encodeString(names(value), quote='"'), ':', parts)
      return(paste0('{', paste(parts, collapse=','), '}'))
    }
    return(paste0('[', paste(parts, collapse=','), ']'))
  }
  if (length(value) > 1L) return(json(as.list(value)))
  if (length(value) == 0L || is.na(value)) return('null')
  if (is.character(value)) return(encodeString(value, quote='"'))
  if (is.numeric(value) && is.finite(value)) return(sprintf('%.17g', value))
  stop('Unsupported fixture value')
}
datasets <- list(
  heterogeneous = list(x=c(12,8,30,3,25), n=c(150,40,200,100,120)),
  homogeneous = list(x=c(10,10,10), n=c(100,100,100))
)
cases <- list()
for (dataset in names(datasets)) for (trans in c('logit','ft','raw')) for (method in c('FE','DL','PM')) {
  d <- datasets[[dataset]]
  x <- d$x; n <- d$n; k <- length(x)
  es <- escalc(measure=c(logit='PLO',ft='PFT',raw='PR')[[trans]],
               xi=x, ni=n, add=if(trans=='ft') 0 else .5, to='only0')
  fit <- rma(es$yi, es$vi, method=method, test='z',
             control=list(threshold=1e-12,tol=1e-18,maxiter=10000))
  native <- predict(fit)
  back <- switch(trans, logit=transf.ilogit,
                 ft=function(z) transf.ipft.hm(z,targs=list(ni=n)),
                 raw=function(z) pmin(1,pmax(0,z)))
  pooled <- predict(fit, transf=back)
  # Preserve the app's existing t_(k-1) RE convention; native predict uses z.
  pi <- if (method!='FE' && k>=3) as.numeric(coef(fit)) +
    c(-1,1)*qt(.975,k-1)*sqrt(fit$tau2+fit$se^2) else c(NA_real_,NA_real_)
  cases[[paste(dataset,trans,method,sep='|')]] <- list(
    mu_re=as.numeric(coef(fit)), seRE=as.numeric(fit$se), tau2=fit$tau2,
    lo=native$ci.lb, hi=native$ci.ub,
    poolP=pooled$pred, poolLo=pooled$ci.lb, poolHi=pooled$ci.ub,
    piLo=pi[1], piHi=pi[2], poolPiLo=back(pi[1]), poolPiHi=back(pi[2]),
    nativePiLo=if(is.null(native$pi.lb)) NA_real_ else native$pi.lb,
    nativePiHi=if(is.null(native$pi.ub)) NA_real_ else native$pi.ub
  )
}
reference <- list(R=R.version.string,
                  packages=list(metafor=as.character(packageVersion('metafor')),
                                metadat=as.character(packageVersion('metadat')),
                                numDeriv=as.character(packageVersion('numDeriv'))),
                  datasets=datasets, cases=cases)
cat('P09_REFERENCE_JSON:', json(reference), '\n', sep='')
