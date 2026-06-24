suppressMessages(library(metafor)); data(dat.bcg)
d <- escalc(measure="RR", ai=tpos,bi=tneg,ci=cpos,di=cneg, data=dat.bcg)
yi <- round(as.numeric(d$yi),4); vi <- round(as.numeric(d$vi),4); se <- round(sqrt(as.numeric(d$vi)),2)
cat("idx  author                yi(4dp)  vi(4dp)  se(2dp)  lat  year\n")
for(i in 1:13) cat(sprintf("%2d  %-20s %+8.4f %8.4f %7.2f  %3d  %d\n",
   i, substr(dat.bcg$author[i],1,20), yi[i], vi[i], se[i], dat.bcg$ablat[i], dat.bcg$year[i]))
cat("\nyi 4dp:", paste(sprintf("%.4f",yi),collapse=", "), "\n")
cat("vi 4dp:", paste(sprintf("%.4f",vi),collapse=", "), "\n")
