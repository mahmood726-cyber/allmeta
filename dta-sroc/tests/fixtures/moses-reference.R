# Fresh matched comparator, run by moses-reference.cjs. Refuse another package version.
args <- commandArgs(trailingOnly=TRUE)
stopifnot(length(args) == 3)
if (nzchar(Sys.getenv('DTA_R_LIBRARY'))) .libPaths(c(Sys.getenv('DTA_R_LIBRARY'), .libPaths()))
suppressPackageStartupMessages(library(mada))
stopifnot(as.character(packageVersion('mada')) == '0.5.12')
options(digits=17)
d <- read.csv(args[1])
pdf(NULL)
out <- lapply(unique(d$case), function(id) {
  x <- d[d$case == id, ]
  cc <- x$cc[1]
  z <- x[,c('TP','FP','FN','TN')]
  # mslSROC uses the same all/single/none correction before unweighted lm(D~S).
  # Supply fpr explicitly so a constant observed FPR does not fail earlier in cut().
  fit <- tryCatch(suppressWarnings(mslSROC(z, correction=0.5, correction.control=cc,
    fpr=seq(0.01,0.99,0.01), extrapolate=TRUE)), error=function(e) NULL)
  bad <- apply(z == 0,1,any)
  if (cc == 'all' && any(bad)) z <- z + 0.5
  if (cc == 'single') z[bad,] <- z[bad,] + 0.5
  y <- qlogis(z$TP/(z$TP+z$FN)); v <- qlogis(z$FP/(z$FP+z$TN))
  rho <- suppressWarnings(cor(y,v,method='spearman'))
  data.frame(case=id,cc=cc, A1=if(is.null(fit)) NA else unname(fit$A1),
    B1=if(is.null(fit)) NA else unname(fit$B1), A2=if(is.null(fit)) NA else unname(fit$A2),
    B2=if(is.null(fit)) NA else unname(fit$B2), rho=rho)
})
dev.off()
write.table(do.call(rbind,out),args[2],sep='\t',row.names=FALSE,quote=FALSE,na='NA')
writeLines(capture.output(sessionInfo()),args[3],useBytes=TRUE)
