# Generate once with native R before fixing the JS exporter. Never overwrite the fixture.
suppressPackageStartupMessages(library(metafor))
dir <- 'hub/shared/tests/unit'
path <- file.path(dir, 'p11-plot-reference.json')
if (file.exists(path)) stop('Refusing to overwrite the recorded R reference')
dat <- read.csv(file.path(dir, 'p11-plot-input.csv'), stringsAsFactors=FALSE)
vi <- dat$se^2
start_tau <- function(y, v) {
  score <- function(t) { w <- 1/(v+t); mu <- sum(w*y)/sum(w); sum(w*w*(y-mu)^2)-sum(w)+sum(w*w)/sum(w) }
  if (score(0) <= 0) return(0)
  hi <- max(var(y), max(v), 1e-8); while (score(hi) > 0) hi <- hi*2
  uniroot(score, c(0, hi), tol=1e-14, maxiter=1000)$root
}
start <- start_tau(dat$te, vi)
res <- rma(dat$te, vi, method='REML', control=list(tau2.init=start, threshold=1e-12*max(1,start), maxiter=10000, stepadj=1))
code <- 'x$control$tau2.init <- start_tau(x$yi[-i], x$vi[-i]); x$control$threshold <- 1e-12*max(1, x$control$tau2.init)'
pdf(NULL)
bj <- baujat(res, code2=code)
fe <- rma(dat$te, vi, method='FE')
rad <- radial(fe)
invisible(dev.off())
json <- function(x) {
  if (is.list(x)) {
    fields <- vapply(x, json, character(1))
    if (!is.null(names(x))) return(paste0('{', paste(paste0(encodeString(names(x), quote='"'), ':', fields), collapse=','), '}'))
    return(paste0('[', paste(fields, collapse=','), ']'))
  }
  if (length(x) != 1L) return(json(as.list(x)))
  if (is.character(x) && !is.na(x)) return(encodeString(x, quote='"'))
  if (is.numeric(x) && is.finite(x)) return(trimws(formatC(x, digits=17, format='g', decimal.mark='.')))
  stop('Unsupported reference value')
}
values <- list('baujat.x'=as.list(bj$x), 'baujat.y'=as.list(bj$y), 'radial.x'=as.list(rad$x), 'radial.z'=as.list(rad$y),
               'radial.resid'=as.list(rad$y-as.numeric(coef(fe))*rad$x), 'radial.slope'=list(as.numeric(coef(fe))))
reference <- list(provenance=list(script='p11-plot-reference.R', R=R.version.string, metafor=as.character(packageVersion('metafor')),
  input_md5=unname(tools::md5sum(file.path(dir, 'p11-plot-input.csv'))), serialization='base R; 17 significant digits'),
  rows=lapply(seq_len(nrow(dat)), function(i) as.list(dat[i,])), values=values)
encoded <- json(reference)
# Required immutable reference fixture, not a test log or cache.
writeLines(encoded, path, useBytes=TRUE)
cat(encoded, '\n')
