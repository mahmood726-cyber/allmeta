# Composite R oracle. Usage: Rscript generate.R corpus.json output.csv [worker=0] [workers=1]
# Each row is flushed as a checkpoint; at most three workers may be used.
versions <- c(meta='8.5.0', metasens='1.5.3', metafor='5.2.1', jsonlite='2.0.0')
cat(R.version.string, '\n')
for (p in names(versions)) {
  cat(p, as.character(packageVersion(p)), '\n')
  stopifnot(as.character(packageVersion(p)) == versions[[p]])
}
suppressPackageStartupMessages({library(jsonlite); library(meta); library(metasens)})
args <- commandArgs(TRUE)
corpus <- fromJSON(args[1], simplifyVector=FALSE)
worker <- if(length(args)>=3) as.integer(args[3]) else 0L
workers <- if(length(args)>=4) as.integer(args[4]) else 1L
stopifnot(workers>=1, workers<=3, worker>=0, worker<workers)
out <- file(args[2], 'w')
writeLines('id,k,dropped,status,limit_est,limit_se,re_est,tau2,reason', out)
n <- 0L; refused <- 0L; start <- Sys.time()
for (ci in seq_along(corpus)) {
  if ((ci-1) %% workers != worker) next
  cfg <- corpus[[ci]]; te <- unlist(cfg$te); se <- unlist(cfg$se); k <- length(te)
  stopifnot(k>=4, k<=200)
  for (i in seq_len(k)) {
    r <- tryCatch({
      m <- metagen(te[-i], se[-i], method.tau='DL', method.random.ci='classic',
                   level=.95, level.ma=.95, method.tau.ci='')
      l <- limitmeta(m, method.adjust='beta0')
      list(status='ok', est=l$TE.adjust, se=l$seTE.adjust, re=m$TE.random, tau2=m$tau2, reason='')
    }, error=function(e) list(status='refused',est=NA,se=NA,re=NA,tau2=NA,
                              reason=gsub('[",\n]', ' ', conditionMessage(e))))
    writeLines(sprintf('%s,%d,%d,%s,%s,%s,%s,%s,"%s"',cfg$id,k,i,r$status,
      format(r$est,digits=17),format(r$se,digits=17),format(r$re,digits=17),
      format(r$tau2,digits=17),r$reason), out)
    flush(out); n <- n+1L; refused <- refused+as.integer(r$status=='refused')
  }
  cat(cfg$id, 'checkpoint', n, 'deletions;', refused, 'refused\n'); flush.console()
}
close(out)
cat(sprintf('%d/%d deletions generated; %d refused; %.1f seconds\n',n,n,refused,
            as.numeric(difftime(Sys.time(),start,units='secs'))))
