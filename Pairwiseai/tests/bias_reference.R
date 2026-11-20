# Reference values for test_bias_metafor.py: R 4.6.0, metafor 5.2.1 (dat.bcg log RR; dat.hackshaw1998 log OR).
# Rscript bias_reference.R  ->  bias_metafor521.json
suppressMessages({library(metafor); library(jsonlite)})
out <- list(metafor=as.character(packageVersion("metafor")))
bcg <- escalc("RR", ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg)
hack <- dat.hackshaw1998  # yi = log OR, vi
sets <- list(bcg=list(yi=as.numeric(bcg$yi), vi=as.numeric(bcg$vi)), hack=list(yi=hack$yi, vi=hack$vi))
for (nm in names(sets)) {
  s <- sets[[nm]]; o <- list(yi=s$yi, vi=s$vi)
  sei <- sqrt(s$vi); z <- s$yi/sei; pr <- 1/sei
  cf <- summary(lm(z ~ pr))$coefficients
  rt <- regtest(rma(s$yi, s$vi, method="REML"), model="lm")
  o$egger <- list(intercept=cf[1,1], se=cf[1,2], t=cf[1,3], p=cf[1,4], df=length(s$yi)-2, regtest_lm_t=rt$zval, regtest_lm_p=rt$pval)
  tf <- list()
  for (m in c("REML","DL","ML")) { f <- rma(s$yi, s$vi, method=m)
    for (est in c("L0","R0")) { t <- trimfill(f, estimator=est)
      tf[[paste(m,est,sep="_")]] <- list(side=t$side, k0=t$k0, b=as.numeric(t$b), se=t$se, ci_lb=t$ci.lb, ci_ub=t$ci.ub, tau2=t$tau2,
        fill_yi=as.numeric(t$yi[t$fill]), fill_vi=as.numeric(t$vi[t$fill]))
      for (sd in c("left","right")) { t2 <- trimfill(f, estimator=est, side=sd); tf[[paste(m,est,sd,sep="_")]] <- list(k0=t2$k0, b=as.numeric(t2$b)) } } }
  o$trimfill <- tf
  out[[nm]] <- o
}
writeLines(toJSON(out, auto_unbox=TRUE, digits=15), "bias_metafor521.json")
# prediction interval: t(k-1) with the conventional (Wald) SE of the pooled estimate
for (nm in names(sets)) { s <- sets[[nm]]; pi <- list()
  for (m in c("REML","DL")) { f <- rma(s$yi, s$vi, method=m); k <- f$k; cr <- qt(.975, k-1)
    pk <- predict(rma(s$yi, s$vi, method=m, test="knha")); pa <- predict(rma(s$yi, s$vi, method=m, test="adhoc")); fa <- rma(s$yi, s$vi, method=m, test="adhoc")
    pi[[m]] <- list(theta=as.numeric(f$b), se=f$se, tau2=f$tau2, crit=cr, lo=as.numeric(f$b) - cr*sqrt(f$tau2+f$se^2), hi=as.numeric(f$b) + cr*sqrt(f$tau2+f$se^2),
      knha_pi=c(pk$pi.lb, pk$pi.ub), adhoc_pi=c(pa$pi.lb, pa$pi.ub), adhoc_se=fa$se, adhoc_ci=c(fa$ci.lb, fa$ci.ub)) }
  out[[nm]]$pi <- pi }
writeLines(toJSON(out, auto_unbox=TRUE, digits=15), "bias_metafor521.json")
