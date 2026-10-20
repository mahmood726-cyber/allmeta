source('allmeta/dta-sroc/validate/preflight-plus.R')
x <- data(package='metadat')$results[, 'Item']
for(n in x) {
 e <- new.env(); data(list=n,package='metadat',envir=e); d <- get(n,e)
 if(is.data.frame(d)) cat(n, ':', paste(names(d),collapse=','), '\n')
}