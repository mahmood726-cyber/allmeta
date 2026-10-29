# Run from wt: Rscript hub/shared/tests/r/proportion-rpar.R
# Independent canonical-package oracle; never imports JS values or archived corpora.
suppressPackageStartupMessages(library(metafor))
args <- commandArgs(trailingOnly=FALSE)
script <- normalizePath(sub("^--file=", "", args[grepl("^--file=", args)]), winslash="/")
input_file <- file.path(dirname(script), "..", "fixtures", "proportion-rpar-input.json")
output_file <- file.path(dirname(script), "..", "fixtures", "proportion-rpar-reference.json")
if(file.exists(output_file)) stop("Refusing to overwrite the recorded R reference")
# Mirror the input counts using base R so the oracle needs no JSON package.
# The provenance unit test compares the complete recorded input with the JSON,
# as well as checking both file hashes; drift in either copy fails that test.
input <- list(schema="proportion-rpar-input-v1",
  transforms=c("logit","ft","raw"), methods=c("PM","DL","FE"), cases=list(
    list(id="heterogeneous",group="estimator-routing",rows=list(c(5,100),c(50,100),c(10,120),c(80,100),c(20,150),c(90,110),c(35,140),c(60,90))),
    list(id="identical",group="zero-heterogeneity",rows=list(c(12,100),c(12,100),c(12,100),c(12,100))),
    list(id="single",group="small-k",rows=list(c(2,17))),
    list(id="two",group="small-k",rows=list(c(0,10),c(4,20))),
    list(id="three",group="small-k",rows=list(c(1,10),c(7,20),c(30,40))),
    list(id="mixed-boundaries",group="boundary-correction",rows=list(c(0,1),c(1,1),c(0,10),c(10,10),c(2,17))),
    list(id="all-zero",group="boundary-correction",rows=list(c(0,10),c(0,100),c(0,1000))),
    list(id="all-total",group="boundary-correction",rows=list(c(10,10),c(100,100),c(1000,1000))),
    list(id="unequal-rare",group="ft-inverse",rows=list(c(0,5),c(1,13),c(2,1000),c(5,10000))),
    list(id="unequal-common",group="ft-inverse",rows=list(c(5,5),c(12,13),c(998,1000),c(9995,10000))),
    list(id="large-counts",group="study-limits",rows=list(c(1,1000000),c(500000,1000000),c(999999,1000000))),
    list(id="study-control",group="study-limits",rows=list(c(0,10),c(1,10),c(5,10),c(9,10),c(10,10)))
  ))

reference <- function(ca, tr, method) {
  x <- vapply(ca$rows, function(r) r[[1]], numeric(1))
  n <- vapply(ca$rows, function(r) r[[2]], numeric(1))
  k <- length(x)
  es <- escalc(measure=switch(tr, logit="PLO", ft="PFT", raw="PR"),
               xi=x, ni=n, add=if(tr=="ft") 0 else 0.5, to="only0")
  # The page deliberately refuses k=1. Retain R's valid singleton FE result
  # separately, without pretending that refusal is a numerical R equality.
  fit <- rma.uni(yi=es$yi, vi=es$vi, method=if(k==1L) "FE" else method,
                 test="z", level=95,
                 control=list(threshold=1e-12, tol=1e-14, maxiter=10000))
  mu <- as.numeric(coef(fit)); se <- as.numeric(fit$se)
  pred <- predict(fit)
  # predict(test='z') uses z for its PI; the page's stated contract is t_(k-1).
  # Do not use knha: that also changes the model SE and the confidence limits.
  pi <- if(k>=3L) mu+c(-1,1)*qt(.975,k-1)*sqrt(fit$tau2+se^2) else c(NA_real_,NA_real_)
  back <- switch(tr, logit=transf.ilogit,
                 ft=function(z) transf.ipft.hm(z, targs=list(ni=n)),
                 raw=function(z) pmin(1,pmax(0,z)))
  w <- as.numeric(weights(fit))
  studies <- lapply(seq_len(k), function(i) {
    ci <- binom.test(x[i], n[i], conf.level=.95)$conf.int
    list(p=x[i]/n[i],lo=ci[1],hi=ci[2],rel=w[i])
  })
  values <- list(mu_re=mu,seRE=se,tau2=fit$tau2,Q=fit$QE,df=k-1,
                 i2=if(fit$QE>k-1) 100*(fit$QE-(k-1))/fit$QE else 0,k=k,
                 lo=pred$ci.lb,hi=pred$ci.ub,piLo=pi[1],piHi=pi[2],
                 poolP=back(mu),poolLo=back(pred$ci.lb),poolHi=back(pred$ci.ub),
                 poolPiLo=if(k>=3L) back(pi[1]) else NA_real_,
                 poolPiHi=if(k>=3L) back(pi[2]) else NA_real_)
  list(id=paste(ca$id,tr,method,sep="|"),case=ca$id,group=ca$group,transform=tr,method=method,
       status=if(k<2L) "refused" else "ok",values=values,
       yi=as.numeric(es$yi),vi=as.numeric(es$vi),studies=studies,
       supplemental=list(Qp=fit$QEp,z=as.numeric(fit$zval),p=as.numeric(fit$pval),
                         metafor_I2=fit$I2,default_z_pi=c(pred$pi.lb,pred$pi.ub)))
}
fits <- list()
for(ca in input$cases) for(tr in input$transforms) for(method in input$methods)
  fits[[length(fits)+1L]] <- reference(ca,tr,method)

out <- list(provenance=list(R=R.version.string,metafor=as.character(packageVersion("metafor")),
                           jsonlite=if(requireNamespace("jsonlite",quietly=TRUE))
                             paste(as.character(packageVersion("jsonlite")),"(not used)") else "not installed (not used)",
                           packages=lapply(c("metafor","stats","metadat","Matrix","nlme","numDeriv"),function(pkg)
                             list(package=pkg,version=as.character(packageVersion(pkg)))),
                           input_md5=unname(tools::md5sum(input_file)),
                           script_md5=unname(tools::md5sum(script)),
                           serialization="base R; 17 significant digits",
                           ci="normal Wald; test=z", pi="qt(.975,k-1); absent for k<3",
                           i2="100*max(0,(QE-(k-1))/QE); zero when QE<=k-1",
                           tolerance="absolute 1e-6 for every numeric assertion"),
            input=input,fits=fits)
# Dependency-free JSON for the ASCII strings and finite doubles in this fixture.
# Keep 17 significant digits; no reference value is rounded by hand.
encode <- function(z) {
  if(is.null(z)) return("null")
  if(is.list(z)) {
    vals <- vapply(z,encode,character(1))
    if(!is.null(names(z))) {
      keys <- encodeString(names(z),quote='"')
      return(paste0("{",paste(paste0(keys,":",vals),collapse=","),"}"))
    }
    return(paste0("[",paste(vals,collapse=","),"]"))
  }
  if(length(z)!=1L) return(paste0("[",paste(vapply(as.list(z),encode,character(1)),collapse=","),"]"))
  if(is.na(z)) return("null")
  if(is.character(z)) return(encodeString(z,quote='"'))
  if(is.logical(z)) return(if(z) "true" else "false")
  stopifnot(is.finite(z))
  sprintf("%.17g",z)
}
writeLines(encode(out),output_file,useBytes=TRUE)
cat("Generated",length(fits),"canonical metafor fits\n")
cat(R.version.string,"; metafor",as.character(packageVersion("metafor")),"; serialization: base R\n")
