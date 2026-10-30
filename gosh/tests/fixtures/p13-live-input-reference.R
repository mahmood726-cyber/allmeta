# Independent native-R oracle for synthetic input, run before the production fix.
# Output is in the system temporary directory; import once, never rebaseline.
suppressPackageStartupMessages(library(metafor))
json <- function(x) {
  if (is.list(x)) {
    fields <- vapply(x, json, character(1))
    if (!is.null(names(x))) return(paste0('{', paste(paste0(encodeString(names(x), quote='"'), ':', fields), collapse=','), '}'))
    return(paste0('[', paste(fields, collapse=','), ']'))
  }
  if (length(x) != 1L) return(json(as.list(x)))
  if (is.character(x) && !is.na(x)) return(encodeString(x, quote='"'))
  if (is.numeric(x) && is.finite(x)) return(sprintf('%.17g', x))
  stop('Unsupported oracle value')
}
te <- c(.1, -.4, .8); se <- c(.2, .3, .4)
models <- lapply(c('FE', 'DL'), function(method) {
  fit <- rma(yi=te, vi=se^2, method=method)
  g <- gosh(fit, progbar=FALSE)
  points <- lapply(seq_len(nrow(g$res)), function(i) {
    m <- which(g$incl[i, ])
    list(members=as.list(m), mu=g$res$estimate[i], I2=g$res$I2[i], Q=g$res$QE[i],
         H2=if(length(m)==1) 1 else g$res$H2[i],
         tau2=if(method=='FE') 0 else g$res$tau2[i], tau=if(method=='FE') 0 else g$res$tau[i])
  })
  rows <- lapply(seq_along(te), function(i) {
    included <- g$incl[, i]
    out <- list(study=i, with_n=sum(included), without_n=sum(!included))
    for (q in c('mean', 'median', 'i2')) {
      x <- if(q=='i2') g$res$I2 else g$res$estimate
      f <- if(q=='median') median else mean
      out[[paste0('with_', q)]] <- f(x[included])
      out[[paste0('without_', q)]] <- f(x[!included])
      out[[paste0('diff_', q)]] <- f(x[included])-f(x[!included])
    }
    out
  })
  list(model=method, points=points, rows=rows)
})
reference <- list(provenance=list(script='p13-live-input-reference.R', R=R.version.string,
  packages=lapply(c('metafor', 'metadat', 'Matrix', 'nlme', 'numDeriv'), function(p) list(package=p, version=as.character(packageVersion(p)))),
  method='metafor::rma and metafor::gosh; all nonempty memberships', serialization='base R; 17 significant digits'),
  input=list(te=te, se=se), models=models)
output <- file.path(dirname(tempdir()), 'p13-live-input-reference.json')
writeLines(json(reference), output, useBytes=TRUE)
cat('Native R oracle:', output, '\n', R.version.string, '; metafor ', as.character(packageVersion('metafor')), '\n', sep='')
cat(length(models), 'models;', sum(vapply(models, function(m) length(m$points), integer(1))), 'subset fits\n')
