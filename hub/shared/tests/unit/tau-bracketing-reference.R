# Run from repository root. Synthetic numerical stress tests, not research data.
suppressPackageStartupMessages(library(metafor))
library(jsonlite)
script <- "hub/shared/tests/unit/tau-bracketing-reference.R"
pair <- function(scale) {
  y <- c(-1,0,1)*scale; v <- rep(.01*scale^2,3)
  ctl <- list(tau2.max=1e6*scale^2, tol=1e-12*scale^2,
              threshold=1e-12*scale^2, maxiter=10000)
  fits <- lapply(c("PM","EB","REML","DL"), function(m) {
    f <- rma(y, v, method=m, control=ctl)
    list(tau2=f$tau2, mu=as.numeric(coef(f)), se=f$se, ciLo=f$ci.lb, ciHi=f$ci.ub)
  })
  names(fits) <- c("PM","EB","REML","DL")
  ci <- confint(rma(y,v,method="PM",control=ctl),type="QP",control=ctl)$random
  list(yi=y, vi=v, fits=fits, tau2Lo=ci["tau^2","ci.lb"],tau2Hi=ci["tau^2","ci.ub"])
}
# Regression stress oracles use a change of units inside R to avoid metafor's
# absolute matrix-singularity threshold. Coefficients/SE multiply by scale,
# variance by scale^2; t and p are invariant. This transformation is explicit.
regression <- function(scale, moderator=TRUE) {
  y <- c(-2,1,0,4,-1); v <- c(1,2,3,1,2); x <- 0:4
  f <- if(moderator) rma(y,v,mods=~x,method="PM",test="adhoc",control=list(tol=1e-12)) else
    rma(y,v,method="PM",control=list(tol=1e-12))
  list(yi=y*scale,vi=v*scale^2,xi=x,tau2=f$tau2*scale^2,
       beta=as.numeric(coef(f))*scale,se=f$se*scale,t=as.numeric(f$zval))
}
x <- 0:4
perm_fit <- rma(c(-2,1,0,4,-1),c(1,2,3,1,2),mods=~x,method="PM",test="adhoc",control=list(tol=1e-12))
perm_p <- permutest(perm_fit,exact=TRUE,progbar=FALSE)$pval[2]
out <- list(permutationP=unname(perm_p),provenance=list(R=R.version.string,metafor=as.character(packageVersion("metafor")),
  script_md5=unname(tools::md5sum(script)), disclosure="Synthetic stress inputs; regression fitted in normalized units in R, explicitly transformed back."),
  quantiles=list(p=.975, df=.01, t=qt(.975,.01)),
  cases=list(scale_6000=pair(6000),scale_60000=pair(60000),above_2_40=pair(2^22)),
  regression=regression(1e10), intercept=regression(1e10,FALSE),
  permutation=regression(60000),
  beyond_200=list(yi=c(-1e40,1e40),vi=c(1,1),tau2=2e80-1,
    tau2Lo=2e80/qchisq(.975,1)-1,tau2Hi=2e80/qchisq(.025,1)-1))
writeLines(toJSON(out,auto_unbox=TRUE,digits=NA,pretty=TRUE),sub("\\.R$",".json",script),useBytes=TRUE)
