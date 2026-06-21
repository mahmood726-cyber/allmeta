suppressMessages(library(metafor)); suppressMessages(library(jsonlite))
s <- fromJSON("benchmark/rapidmeta-validation/smd_data.json", simplifyVector=FALSE)
for (st in s) {
  a<-st$arms[[1]]; b<-st$arms[[2]]
  e<-escalc(measure="SMD", m1i=a$mean, sd1i=a$sd, n1i=a$n, m2i=b$mean, sd2i=b$sd, n2i=b$n)
  cat(sprintf("%s: g(T vs P)=%.6f se=%.6f\n", st$id, e$yi, sqrt(e$vi)))
}
