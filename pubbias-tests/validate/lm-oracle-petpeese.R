# Second, independent oracle for PET/PEESE and the conditional rule (lane p610): base-R lm() with weights 1/vi,
# not metafor::regtest, and a separate leave-one-out loop. Full data for all 152 configurations; leave-one-out for
# 4 <= k <= 100. Run from pubbias-tests/:
#   Rscript validate/lm-oracle-petpeese.R validate/corpus/corpus.json validate/plus-corpus/petpeese-lm-reference.json
args <- commandArgs(TRUE)
cat('libPaths:', paste(.libPaths(), collapse=' | '), '
')
suppressMessages(library(jsonlite))
corpus <- fromJSON(args[1], simplifyVector=FALSE)
fit1 <- function(y, v, x) {
  if (length(unique(x)) < 2) return(list(error='singular-design'))
  f <- lm(y ~ x, weights=1/v); s <- coef(summary(f)); df <- f$df.residual; q <- qt(0.975, df)
  list(est=s[1,1], se=s[1,2], t=s[1,3], p=s[1,4], ci_lb=s[1,1]-q*s[1,2], ci_ub=s[1,1]+q*s[1,2], slope=s[2,1], slope_t=s[2,3], slope_p=s[2,4], df=df)
}
pp <- function(y, v) {
  if (length(y) < 3) return(list(pet=list(error='k-below-3'), peese=list(error='k-below-3'), conditional=list(error='k-below-3')))
  pet <- fit1(y, v, sqrt(v)); peese <- fit1(y, v, v)
  cond <- if (!is.null(pet$error)) list(error=pet$error) else if (abs(pet$p - 0.05) <= 1e-9) list(error='alpha-tie') else {
    b <- if (pet$p < 0.05) 'PEESE' else 'PET'; r <- if (b == 'PET') pet else peese
    if (!is.null(r$error)) list(error=r$error) else list(branch=b, est=r$est, ci_lb=r$ci_lb, ci_ub=r$ci_ub) }
  list(pet=pet, peese=peese, conditional=cond)
}
out <- list()
for (d in corpus) {
  y <- as.numeric(unlist(d$yi)); v <- as.numeric(unlist(d$vi)); k <- length(y)
  e <- list(full=pp(y, v))
  if (k >= 4 && k <= 100) e$loo <- lapply(seq_len(k), function(i) { r <- pp(y[-i], v[-i]); list(pet=r$pet$est, peese=r$peese$est, branch=r$conditional$branch) })
  out[[d$id]] <- e
}
writeLines(toJSON(list(R=R.version.string, datasets=out), auto_unbox=TRUE, digits=NA, null='null'), args[2], useBytes=TRUE)
cat('DONE', length(out), '\n')
