suppressMessages(library(metafor))
data(dat.bcg)
db <- escalc(measure="RR", ai=tpos,bi=tneg,ci=cpos,di=cneg, data=dat.bcg)
pv <- round(as.numeric(db$vi),4)
py <- round(as.numeric(db$yi),4)
emb_vi <- c(0.3256,0.0786,0.0408,0.0203,0.0512,0.0069,0.2230,0.0044,0.0564,0.0730,0.0124,0.5325,0.0714)
emb_yi <- c(-0.8893,-1.5854,-1.3481,-1.4416,-0.2175,-0.7861,-1.6209,0.0120,-0.4694,-1.3713,-0.3394,0.4459,-0.0173)
emb_yr <- c(1948,1949,1960,1977,1973,1953,1973,1980,1968,1961,1974,1956,1976)
for(i in 1:13){
  vb <- if(abs(pv[i]-emb_vi[i])>0.0005) "  <<VI_MISMATCH" else ""
  yb <- if(dat.bcg$year[i]!=emb_yr[i]) "  <<YR_MISMATCH" else ""
  cat(sprintf("%-22s pubYi=%+.4f embYi=%+.4f | pubVI=%.4f embVI=%.4f%s | pubYr=%d embYr=%d%s\n",
      substr(dat.bcg$author[i],1,22), py[i], emb_yi[i], pv[i], emb_vi[i], vb, dat.bcg$year[i], emb_yr[i], yb))
}
