suppressMessages(library(metafor)); suppressMessages(library(jsonlite))
d <- fromJSON("benchmark/rapidmeta-validation/bcg_data.json")
for (m in c("DL","REML","PM")) {
  r <- rma(yi=d$yi, vi=d$vi, method=m)
  cat(sprintf("%s: mu=%.6f se=%.6f tau2=%.6f I2=%.3f\n", m, coef(r), r$se, r$tau2, r$I2))
}
rhk <- rma(yi=d$yi, vi=d$vi, method="REML", test="knha")
cat(sprintf("REML_HK: mu=%.6f se=%.6f tau2=%.6f\n", coef(rhk), rhk$se, rhk$tau2))
