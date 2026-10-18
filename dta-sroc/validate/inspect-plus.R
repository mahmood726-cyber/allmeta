source('allmeta/dta-sroc/validate/preflight-plus.R')
for(n in c('dat.kearon1998','dat.rivera2025')) {
 cat('\nDOCUMENTATION',n,'\n'); h<-help(n,package='metadat'); cat(tools::Rd2txt(utils:::.getHelpFile(h))); data(list=n,package='metadat'); print(head(get(n))); print(summary(get(n)))
}
cat('\nDATASET TITLES\n'); print(data(package='metadat')$results[,c('Item','Title')], quote=FALSE)