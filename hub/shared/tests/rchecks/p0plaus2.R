# Run from the worktree root (TEST.ps1). No JSON dependency.
suppressPackageStartupMessages(library(metafor))
base <- 'hub/shared/tests/'
f <- read.csv(paste0(base,'fixtures/p0plaus2/limit.csv'))
p <- read.csv(paste0(base,'rchecks-out/p0plaus2/limit.csv'))
near <- function(a,b) length(a)==length(b) && all(is.finite(a)) && all(is.finite(b)) && all(abs(a-b) <= 1e-6)
stopifnot(nrow(p)==1, identical(p$scale,'variance'))
r <- rma(yi=f$yi, sei=sqrt(f$variance), method='DL')
stopifnot(near(p$re_est,as.numeric(coef(r))),near(p$re_se,as.numeric(r$se)),near(p$tau2,r$tau2))
# The deliberately wrong PAGE result treats variance as SE. It must be rejected.
wrong <- rma(yi=f$yi, sei=f$variance, method='DL')
stopifnot(near(p$plant_est,as.numeric(coef(wrong))))
plant_detected <- !near(p$plant_est,as.numeric(coef(r)))
stopifnot(plant_detected)
cat('PLANT_DETECTED\n')
f <- read.csv(paste0(base,'fixtures/p0plaus2/raw.csv'))
p <- read.csv(paste0(base,'rchecks-out/p0plaus2/raw.csv'))
k <- nrow(f)
y <- as.vector(t(cbind(log(f$y1),log(f$y2))))
V <- matrix(0,2*k,2*k)
for(i in seq_len(k)) { ix <- (2*i-1):(2*i); V[ix,ix] <- matrix(c(f$v1[i],f$cov[i],f$cov[i],f$v2[i]),2,2) }
outcome <- factor(rep(c('one','two'),k),levels=c('one','two'))
trial <- rep(seq_len(k),each=2)
# BFGS's default ndeps=1e-3 biases numerical derivatives of the Cholesky
# parameters here: tighter reltol alone cannot remove that truncation error.
# metafor passes six optimizer coordinates: sigma2 (unused), two Cholesky
# diagonals, one off-diagonal, gamma2 and phi (both unused). Tighten the
# derivative step for all six; the model and 1e-6 comparison stay unchanged.
# No page estimates are used as starting values or as the R reference.
r <- rma.mv(y,V,mods=~outcome-1,random=~outcome|trial,struct='UN',method='REML',
            control=list(optimizer='optim',optmethod='BFGS',reltol=1e-12,maxit=10000,
                         ndeps=rep(1e-6,6)))
# Report both sides before asserting so any future mismatch is diagnosable.
print(data.frame(outcome=p$outcome,page_mu=p$mu,R_mu=as.numeric(coef(r)),
                 page_se=p$se,R_se=as.numeric(r$se)),digits=16)
stopifnot(identical(p$outcome,1:2),all(p$scale=='raw'),near(p$mu,as.numeric(coef(r))),near(p$se,as.numeric(r$se)))
if(plant_detected) cat('R_CHECK_PASS\n')
