versions <- c(meta='8.5.0', metasens='1.5.3', metafor='5.2.1', jsonlite='2.0.0')
cat(R.version.string, '\n')
for (p in names(versions)) {
  cat(p, as.character(packageVersion(p)), '\n')
  stopifnot(as.character(packageVersion(p)) == versions[[p]])
}
suppressPackageStartupMessages({library(meta); library(metasens); library(metafor)})
m <- metagen(c(.55,.48,.70,.60,.30,.75,.52,.65,.45,.58),
             c(.08,.10,.15,.09,.07,.20,.08,.12,.17,.10), method.tau='DL')
l <- limitmeta(m)
cat('limitmeta formal arguments:', paste(names(formals(limitmeta)), collapse=', '), '\n')
stopifnot(!any(c('subset','influence') %in% names(formals(limitmeta))))
calls <- list(quote(meta::metainf(l)), quote(metafor::leave1out(l)))
expected <- c("Leave-one-out meta-analysis not available for an object of class 'limitmeta'.",
              'no applicable method for \'leave1out\' applied to an object of class "limitmeta"')
for (i in seq_along(calls)) {
  call <- calls[[i]]
  message <- tryCatch({eval(call); stop('Unexpected success')}, error=function(e) conditionMessage(e))
  cat(deparse(call), ': ', message, '\n', sep='')
  stopifnot(message == expected[[i]])
}
cat('leave1out.limitmeta method:', !is.null(getS3method('leave1out','limitmeta',optional=TRUE)), '\n')
stopifnot(is.null(getS3method('leave1out','limitmeta',optional=TRUE)))
cat('R can compose leave-one-out limit estimates with a metagen/limitmeta loop.\n')
