# Generates living-meta-validation-metafor-audit5.json (lane audit5) and prints the Begg / trim-and-fill
# references used by ../living-meta-r-audit5.test.mjs. R 4.6.0, metafor 5.2.1, metadat 1.6.0.
# Run from this folder: Rscript living-meta-validation-metafor-audit5.R
suppressMessages(library(metafor)); suppressMessages(library(jsonlite))
cat("R", R.version.string, "metafor", as.character(packageVersion("metafor")), "\n")
ds <- list(
 bcg=list(yi=c(-0.8893,-1.5854,-1.3481,-1.4416,-0.2175,-0.7861,-1.6209,0.0120,-0.4694,-1.3713,-0.3394,0.4459,-0.0173),
          vi=c(0.3256,0.1946,0.4154,0.0200,0.0512,0.0069,0.2230,0.0040,0.0564,0.0730,0.0124,0.5325,0.0714)),
 aspirin=list(yi=c(-0.2744,-0.1863,-0.3417,-0.1508,-0.4005,-0.2231), vi=c(0.0148,0.0071,0.0240,0.0056,0.0403,0.0089)),
 homogeneous=list(yi=c(0.50,0.52,0.48,0.51,0.49), vi=rep(0.04,5)),
 heterogeneous=list(yi=c(0.2,0.8,0.3,1.2,0.5,0.1,0.9,0.6), vi=c(0.02,0.03,0.02,0.04,0.02,0.03,0.02,0.03)),
 single=list(yi=0.5, vi=0.04),
 magnesium=list(yi=c(-1.609,-0.511,-0.644,-0.223,-0.169,-0.693,-0.598,-0.154,0.131,-0.811,-0.336,-0.693,0.080,-0.099,0.095,0.041),
                vi=c(0.410,0.082,0.191,0.016,0.041,0.352,0.364,0.071,0.069,0.681,0.154,0.493,0.125,0.001,0.007,0.001)),
 large=list(yi=0.3 + ((0:49) %% 5)*0.1 - 0.2, vi=rep(0.025,50)))
out <- list()
for (nm in names(ds)) { d <- ds[[nm]]; o <- list()
  for (m in c("REML","DL","FE")) { f <- rma(d$yi, d$vi, method=m)
    o[[m]] <- list(estimate=as.numeric(f$b), se=f$se, tau2=f$tau2, I2=if (is.na(f$I2)) NULL else f$I2, Q=f$QE, k=f$k) }
  out[[nm]] <- o }
cat(toJSON(out, digits=NA, auto_unbox=TRUE, null="null", pretty=TRUE), file="living-meta-validation-metafor-audit5.json")
b <- ds$bcg; r <- rma(b$yi, b$vi, method="REML")
cat("REML ci", r$ci.lb, r$ci.ub, "Qp", r$QEp, "QbasedI2", (r$QE-12)/r$QE*100, "\n")
rk <- ranktest(b$yi, b$vi, exact=FALSE); cat("begg bcg exact=FALSE tau", sprintf("%.10f", rk$tau), "p", sprintf("%.10f", rk$pval), "\n")
rkF <- ranktest(rma(b$yi, b$vi, method="FE"), exact=FALSE); cat("begg FE-model tau", rkF$tau, rkF$pval, "\n")
rk2 <- ranktest(b$yi, b$vi); cat("begg default(exact) p", rk2$pval, "\n")
ty <- c(0.1,0.3,0.3,0.5,0.2,0.4); tv <- c(0.04,0.04,0.09,0.09,0.16,0.01)
rt <- ranktest(ty, tv, exact=FALSE); cat("begg ties tau", sprintf("%.10f", rt$tau), "p", sprintf("%.10f", rt$pval), "\n")
for (meth in c("DL","REML")) for (est in c("L0","R0")) for (s in c("right","left")) { t <- trimfill(rma(b$yi,b$vi,method=meth), estimator=est, side=s)
  cat("tf bcg", meth, est, s, "k0", t$k0, "est", sprintf("%.10f", t$b), "se", sprintf("%.10f", t$se), "\n") }
e <- escalc(measure="OR", ai=ai, n1i=n1i, ci=ci, n2i=n2i, data=dat.egger2001)
for (est in c("L0","R0")) { t <- trimfill(rma(e$yi,e$vi,method="DL"), estimator=est, side="left"); cat("tf mag", est, "left k0", t$k0, "est", sprintf("%.10f", t$b), "\n") }
cat("mag yi", toJSON(round(as.numeric(e$yi),6)), "\nmag vi", toJSON(round(as.numeric(e$vi),6)), "\n")
for (est in c("L0","R0")) { t <- trimfill(rma(round(e$yi,6),round(e$vi,6),method="DL"), estimator=est, side="left"); cat("tf mag6", est, "left k0", t$k0, "est", sprintf("%.10f", t$b), "\n") }
m <- ds$magnesium
for (meth in c("DL","REML")) for (est in c("L0","R0")) for (s in c("right","left")) { t <- trimfill(rma(m$yi,m$vi,method=meth), estimator=est, side=s)
  cat("tf magc", meth, est, s, "k0", t$k0, "est", sprintf("%.10f", t$b), "se", sprintf("%.10f", t$se), "
") }
