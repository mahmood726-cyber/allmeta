# Page values only: no JS-computed reference values and no jsonlite.
suppressPackageStartupMessages(library(metafor))
args <- commandArgs(FALSE)
script <- sub('^--file=', '', args[grepl('^--file=', args)])
base <- file.path(dirname(normalizePath(script)), '..', 'rchecks-out', 'p0share')
read <- function(name) read.csv(file.path(base, name), stringsAsFactors=FALSE,
                                strip.white=TRUE, check.names=FALSE)
near <- function(a,b) length(a)==length(b) && all(is.finite(a)) &&
  all(is.finite(b)) && all(abs(a-b) <= 1e-6)
estimate <- function(d, app, method) {
  stopifnot(nrow(d)>=3, all(is.finite(d$te)), all(is.finite(d$se)), all(d$se>0))
  fit <- function(ix) {
    if(length(ix)==1) return(d$te[ix])
    as.numeric(coef(rma.uni(yi=d$te[ix], sei=d$se[ix], method=method)))
  }
  if(app=='copas') return(fit(seq_len(nrow(d))))
  # The GOSH page reports the median pooled estimate across every nonempty subset.
  pools <- vapply(seq_len(2^nrow(d)-1), function(mask) {
    ix <- which(as.logical(intToBits(mask)[seq_len(nrow(d))]))
    fit(ix)
  }, numeric(1))
  median(pools)
}
plants <- 0L
for(app in c('gosh','copas')) {
  for(kind in c('short','past-cut','oversized')) {
    prefix <- paste(app,kind,sep='-')
    flags <- read(paste0(prefix,'-flags.csv'))
    expected <- as.integer(kind=='oversized')
    stopifnot(nrow(flags)==1, flags$omitted==expected, flags$note==expected)
    for(stage in c('original','restored')) {
      name <- paste(prefix,stage,sep='-')
      d <- read(paste0(name,'-source.csv'))
      rows <- read(paste0(name,'-rows.csv'))
      result <- read(paste0(name,'-result.csv'))
      stopifnot(nrow(result)==1, result$method=='FE', result$k==nrow(d),
                nrow(rows)==nrow(d), near(rows$te,d$te),near(rows$se,d$se))
      if(app=='gosh') stopifnot(identical(rows$label,d$label))
      stopifnot(near(result$estimate,estimate(d,app,result$method)))
    }
    if(kind!='oversized') {
      stopifnot(identical(read(paste0(prefix,'-original-source.csv')),
                          read(paste0(prefix,'-restored-source.csv'))))
    }
  }
  plant <- read(paste0(app,'-plant-source.csv'))
  wrong <- read(paste0(app,'-plant-result.csv'))
  # Reject the original page estimate falsely paired with the historical truncated data.
  stopifnot(nrow(plant)<wrong$k,
            !near(wrong$estimate,estimate(plant,app,wrong$method)))
  plants <- plants+1L
}
stopifnot(plants==2L)
cat('PLANT_DETECTED\n')
cat('R_CHECK_PASS\n')
