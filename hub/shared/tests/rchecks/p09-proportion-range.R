# Emit a reference fixture to stdout. Retain this script with the captured JSON.
# For ordinary counts use metafor directly. For the extreme synthetic boundary,
# compute the corrected counts independently: metafor's probability-ratio PLO
# path can itself lose the complement at the binary64 integer boundary.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
ordinary <- list()
x <- c(0, 10, 4)
n <- c(10, 10, 20)
for (tr in c('logit', 'ft', 'raw')) for (method in c('PM', 'DL', 'FE')) {
  es <- escalc(measure=switch(tr, logit='PLO', ft='PFT', raw='PR'),
               xi=x, ni=n, add=if (tr == 'ft') 0 else .5, to='only0')
  fit <- rma(es$yi, es$vi, method=method, test='z',
             control=list(threshold=1e-12, tol=1e-18, maxiter=10000))
  ordinary[[paste(tr, method, sep='|')]] <- list(
    yi=as.numeric(es$yi), vi=as.numeric(es$vi),
    mu_re=as.numeric(coef(fit)), seRE=as.numeric(fit$se), tau2=fit$tau2, Q=fit$QE)
}
max_safe <- 2^53 - 1
extreme <- lapply(c(0, max_safe), function(events) {
  ce <- events + .5
  cn <- (max_safe - events) + .5
  list(x=events, n=max_safe, y=log(ce)-log(cn), v=1/ce+1/cn,
       raw_y=ce/(max_safe+1), raw_v=(ce/(max_safe+1))*(cn/(max_safe+1))/(max_safe+1))
})
cat(toJSON(list(versions=list(R=R.version.string, metafor=as.character(packageVersion('metafor')),
                             jsonlite=as.character(packageVersion('jsonlite'))),
                ordinary=ordinary, extreme=extreme), auto_unbox=TRUE, digits=NA, pretty=TRUE))
cat('\n')
