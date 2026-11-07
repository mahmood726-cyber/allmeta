# Read-only diagnosis of P09-Q-1; never writes or replaces reference values.
suppressPackageStartupMessages(library(metafor))
es <- escalc(measure="PR", xi=c(1,500000,999999), ni=rep(1000000,3),
             add=0.5, to="only0")
wi <- 1/es$vi
mu <- sum(wi*es$yi)/sum(wi)
q_left <- Reduce(function(a,i) a+wi[i]*(es$yi[i]-mu)*(es$yi[i]-mu),
                 seq_along(wi), init=0)
q_sqrt <- sum((sqrt(wi)*(es$yi-mu))^2)
cat(R.version.string,"; metafor",as.character(packageVersion("metafor")),"\n")
cat(sprintf("weighted mean: %.17g\nleft-associated Q: %.17g\nsqrt-weighted Q: %.17g\n",
            mu,q_left,q_sqrt))
for(method in c("PM","DL","FE")) {
  fit <- rma.uni(yi=es$yi,vi=es$vi,method=method,test="z",level=95,
                 control=list(threshold=1e-12,tol=1e-14,maxiter=10000))
  cat(sprintf("%s metafor QE: %.17g; abs difference from left-associated Q: %.17g\n",
              method,fit$QE,abs(fit$QE-q_left)))
}
# Inspect the installed canonical implementation, not an assumed formula.
src <- deparse(body(metafor::rma.uni))
hits <- grep("QE <-|beta.FE <-|sY <-|sX <-",src)
lines <- sort(unique(unlist(lapply(hits,function(i) seq(max(1,i-2),min(length(src),i+3))))))
cat("Installed rma.uni source around Q and weighted least-squares calculations:\n")
cat(paste(sprintf("%d: %s",lines,src[lines]),collapse="\n"),"\n")
