print(.libPaths())
for(p in c('metafor','metadat','jsonlite')) print(c(p,as.character(packageVersion(p))))
library(metafor)
s <- deparse(metafor::rma.uni)
writeLines(s,'meta-regression/validate/plus/rma-source.txt')
d <- data(package='metadat')$results
print(dim(d)); print(head(d))
for(n in d[,'Item']) { e<-new.env();data(list=n,package='metadat',envir=e); x<-e[[n]];cat(n,':',paste(names(x),collapse=','),'\n') }
