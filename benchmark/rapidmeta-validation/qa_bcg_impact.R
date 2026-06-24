suppressMessages(library(metafor))
yi <- c(-0.8893,-1.5854,-1.3481,-1.4416,-0.2175,-0.7861,-1.6209,0.0120,-0.4694,-1.3713,-0.3394,0.4459,-0.0173)
vi_emb <- c(0.3256,0.0786,0.0408,0.0203,0.0512,0.0069,0.2230,0.0044,0.0564,0.0730,0.0124,0.5325,0.0714)
vi_pub <- c(0.3256,0.1946,0.4154,0.0200,0.0512,0.0069,0.2230,0.0040,0.0564,0.0730,0.0124,0.5325,0.0714)
for(lbl in c("EMBEDDED(wrong)","PUBLISHED(correct)")){
  vi <- if(lbl=="EMBEDDED(wrong)") vi_emb else vi_pub
  m <- rma(yi=yi, vi=vi, method="REML")
  cat(sprintf("%-20s  mu=%+.4f (%.4f)  RR=%.4f [%.4f,%.4f]  tau2=%.4f  I2=%.1f%%\n",
     lbl, m$beta, m$se, exp(m$beta), exp(m$ci.lb), exp(m$ci.ub), m$tau2, m$I2))
}
