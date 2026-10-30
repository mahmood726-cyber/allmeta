# Fresh, independent integer-count controls for the P09-R1 parser fix.
# Run from wt: Rscript proportion-ma/tests/fixtures/p09-count-control.R
# The wrapper captures stdout; commit the resulting JSON fixture with versions.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
cases <- list(
  integer = list(x=c(12,20), n=c(100,100)),
  boundary = list(x=c(0,10,4), n=c(10,10,20))
)
fits <- lapply(cases, function(d) {
  es <- escalc(measure="PLO", xi=d$x, ni=d$n, add=.5, to="only0")
  f <- rma(es$yi, es$vi, method="PM", test="z",
           control=list(threshold=1e-12,tol=1e-18,maxiter=10000))
  p <- predict(f, transf=transf.ilogit)
  list(x=d$x, n=d$n, values=list(
    mu_re=as.numeric(coef(f)), seRE=as.numeric(f$se), tau2=f$tau2,
    Q=f$QE, df=length(d$x)-1, k=length(d$x),
    i2=if(f$QE>length(d$x)-1) 100*(f$QE-(length(d$x)-1))/f$QE else 0,
    poolP=p$pred, poolLo=p$ci.lb, poolHi=p$ci.ub
  ))
})
cat(toJSON(list(
  script="proportion-ma/tests/fixtures/p09-count-control.R",
  versions=list(R=R.version.string, metafor=as.character(packageVersion("metafor")),
                jsonlite=as.character(packageVersion("jsonlite"))),
  transform="logit", method="PM", tolerance=1e-6, cases=fits
), auto_unbox=TRUE, digits=NA, pretty=TRUE), "\n")
