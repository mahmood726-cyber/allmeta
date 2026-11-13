# Reference values for tests/test_reml_score.py: R 4.6.0, metafor 5.2.1, rma(method="REML"/"ML"), test="z".
# Run from Pairwiseai/tests:  Rscript --no-environ reml_score_reference.R
suppressMessages({library(metafor); library(jsonlite)})
cat("metafor", as.character(packageVersion("metafor")), "\n")
d <- list()
bcg <- escalc("RR", ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg)
d$bcg <- bcg
d$bcg_k2 <- bcg[c(4,6),]
d$bcg_k3 <- bcg[c(4,7,9),]
d$bcg_k3_zero <- bcg[1:3,]
d$bangertdrowns2004 <- dat.bangertdrowns2004[!is.na(dat.bangertdrowns2004$yi),]
d$molloy2014 <- escalc("ZCOR", ri=ri, ni=ni, data=dat.molloy2014)
d$normand1999 <- escalc("MD", m1i=m1i, sd1i=sd1i, n1i=n1i, m2i=m2i, sd2i=sd2i, n2i=n2i, data=dat.normand1999)
d$hackshaw1998 <- dat.hackshaw1998
d$pritz1997 <- escalc("PR", xi=xi, ni=ni, data=dat.pritz1997)
d$hine1989 <- escalc("RD", n1i=n1i, n2i=n2i, ai=ai, ci=ci, data=dat.hine1989)
# synthetic k=3 boundary (homogeneous): REML tau2 = 0
d$boundary_k3 <- data.frame(yi=c(0.10,0.12,0.11), vi=c(0.04,0.05,0.03))
out <- list(metafor=as.character(packageVersion("metafor")), sets=list())
for (nm in names(d)) {
  x <- d[[nm]]; yi <- as.numeric(x$yi); vi <- as.numeric(x$vi)
  r <- rma(yi, vi, method="REML", control=list(threshold=1e-12, maxiter=1000))
  m <- rma(yi, vi, method="ML", control=list(threshold=1e-12, maxiter=1000))
  out$sets[[nm]] <- list(yi=yi, vi=vi, k=length(yi), tau2_reml=r$tau2, tau2_ml=m$tau2,
    mu=as.numeric(coef(r)), se=r$se, ci_lb=r$ci.lb, ci_ub=r$ci.ub, z=r$zval, p=r$pval)
  cat(sprintf("%-20s k=%2d REML=%.8f ML=%.8f mu=%.6f se=%.6f p=%.6g\n", nm, length(yi), r$tau2, m$tau2, coef(r), r$se, r$pval))
}
writeLines(toJSON(out, digits=I(17), auto_unbox=TRUE, pretty=TRUE), "reml_metafor521.json")
