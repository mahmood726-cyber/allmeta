# Regenerate the existing R fixture in a temporary directory and compare it
# without overwriting, re-baselining, or loosening the committed reference.
suppressPackageStartupMessages(library(jsonlite))
fixturePath <- 'hub/shared/tests/unit/fixtures/'
committed <- fromJSON(paste0(fixturePath, 'p08-ml-reference.json'), simplifyVector=FALSE)
code <- paste(readLines(paste0(fixturePath, 'p08-ml-reference.R'), warn=FALSE), collapse='\n')
oldWrite <- "writeLines(toJSON(result, auto_unbox=TRUE, digits=NA, pretty=TRUE), paste0(path, 'p08-ml-reference.json'))"
newWrite <- "writeLines(toJSON(result, auto_unbox=TRUE, digits=NA, pretty=TRUE), file.path(tempdir(), 'p08-regenerated-reference.json'))"
stopifnot(length(gregexpr(oldWrite, code, fixed=TRUE)[[1]])==1L,
          grepl(oldWrite, code, fixed=TRUE))
code <- sub(oldWrite, newWrite, code, fixed=TRUE)
scope <- new.env()
eval(parse(text=code), envir=scope)
fresh <- fromJSON(file.path(tempdir(), 'p08-regenerated-reference.json'), simplifyVector=FALSE)
stopifnot(length(fresh$records)==length(committed$records))
checks <- 0L
maxDifference <- 0
for (i in seq_along(committed$records)) {
  a <- fresh$records[[i]]; b <- committed$records[[i]]
  stopifnot(identical(a$case,b$case), identical(a$scale,b$scale), identical(a$input,b$input))
  for (model in c('full','reduced')) for (key in names(b$expected[[model]])) {
    divisor <- if(key=='tau2') b$scale^2 else if(key %in% c('beta','se','ciLo','ciHi')) b$scale else 1
    delta <- abs(unlist(a$expected[[model]][[key]])/divisor-unlist(b$expected[[model]][[key]])/divisor)
    stopifnot(all(is.finite(delta)), all(delta<=1e-9))
    maxDifference <- max(maxDifference,delta); checks <- checks+length(delta)
  }
  for (key in names(b$expected$comparison)) {
    delta <- abs(unlist(a$expected$comparison[[key]])-unlist(b$expected$comparison[[key]]))
    stopifnot(all(is.finite(delta)), all(delta<=1e-9))
    maxDifference <- max(maxDifference,delta); checks <- checks+length(delta)
  }
}
cat('FRESH_REFERENCE_CHECKS=',checks,' max_normalized_difference=',
    sprintf('%.17g',maxDifference),'\n',sep='')
