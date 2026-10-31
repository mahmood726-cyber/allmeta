# Run from any directory; only base/recommended R and metafor/metadat are used.
# Input is the CSV of *rendered tooltip* text and metadata exported by Playwright.
# References: https://www.metafor-project.org/doku.php/faq
# https://wviechtb.github.io/metafor/reference/predict.rma.html
# https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-10
# An optional CSV path supports isolated negative/control tests without replacing
# the page evidence. Never use those fixtures to claim the browser gate passed.
suppressPackageStartupMessages(library(metafor))
args <- commandArgs(trailingOnly=TRUE)
script <- sub('^--file=', '', grep('^--file=', commandArgs(), value=TRUE)[1])
input <- if (length(args)) args[1] else file.path(dirname(script), '..', 'rchecks-out', 'glossary', 'entries.csv')
stopifnot(file.exists(input))
rows <- read.csv(input, stringsAsFactors=FALSE, check.names=FALSE, encoding='UTF-8', na.strings=NULL)
stopifnot(identical(names(rows), c('key', 'text', 'expression', 'reference')),
          nrow(rows) >= 244L, !anyDuplicated(rows$key),
          all(nchar(rows$text, type='chars') > 0L), all(nchar(rows$text, type='chars') <= 280L))

# Bind visible equations/bands to their numerical checks, not just to metadata.
# These exact mathematical tokens are intentional; surrounding prose may change.
tokens <- list(
  I2=c('0\u201340%', '30\u201360%', '50\u201390%', '75\u2013100%'),
  i2=c('0\u201340%', '30\u201360%', '50\u201390%', '75\u2013100%'),
  PI=c('95%', 't(k\u22121)', '\u221a(SE\u00b2+\u03c4\u00b2)'),
  HKSJ='t(k\u22121)', H2='Q/(k\u22121)',
  FisherZ=c('atanh(r)', '1/(n\u22123)'), Logit='p/(1\u2212p)',
  Se='TP/(TP+FN)', Sp='TN/(TN+FP)', FPR='FP/(FP+TN)'
)
visible_claims_valid <- function(data) {
  all(vapply(names(tokens), function(key) {
    text <- data$text[data$key == key]
    length(text) == 1L && all(vapply(tokens[[key]], function(token)
      grepl(token,text,fixed=TRUE), logical(1)))
  }, logical(1)))
}
stopifnot(visible_claims_valid(rows))
for (key in names(tokens)) for (token in tokens[[key]]) {
  broken <- rows
  broken$text[broken$key == key] <- sub(token,'PLANTED',broken$text[broken$key == key],fixed=TRUE)
  stopifnot(!visible_claims_valid(broken))
}

# BCG is a treatment dataset. Reusing its positive cell counts below exercises
# diagnostic/continuous/correlation arithmetic; it does NOT make BCG a diagnostic,
# continuous-outcome, or correlation study. Those fixtures are labelled here.
data('dat.bcg', package='metadat')
bcg <- dat.bcg
dat <- escalc(measure='RR', ai=tpos, bi=tneg, ci=cpos, di=cneg, data=bcg)
precise <- list(threshold=1e-12, tol=1e-12, maxiter=10000)
fit <- rma(yi, vi, data=dat, method='REML', control=precise)
dl <- rma(yi, vi, data=dat, method='DL')
pm <- rma(yi, vi, data=dat, method='PM', control=precise)
hk <- rma(yi, vi, data=dat, method='REML', test='knha', control=precise)
adhoc <- rma(yi, vi, data=dat, method='REML', test='adhoc', control=precise)
tfit <- rma(yi, vi, data=dat, method='REML', test='t', control=precise)
mod <- rma(yi, vi, mods=~ablat, data=dat, method='REML', control=precise)

# Candidate formulas get data and independently computed intermediates, never
# the metafor reference objects. REML solves the restricted likelihood score.
e <- new.env(parent=baseenv())
for (name in c('optimize', 'uniroot', 'qt', 'var', 'cor', 'median', 'weighted.mean'))
  e[[name]] <- get(name, envir=asNamespace('stats'))
e$a <- bcg$tpos; e$b <- bcg$tneg; e$c <- bcg$cpos; e$d <- bcg$cneg
with(e, {
  n1 <- a+b; n2 <- c+d; N <- n1+n2; p1 <- a/n1; p2 <- c/n2
  y <- log(p1/p2); v <- 1/a-1/n1+1/c-1/n2; k <- length(y)
  w0 <- 1/v; Q <- sum(w0*(y-sum(w0*y)/sum(w0))^2)
  C <- sum(w0)-sum(w0^2)/sum(w0); typical <- (k-1)/C
  reml_variance <- function(y, v) {
    score <- function(tau) {
      weights <- 1/(v+tau); mean <- sum(weights*y)/sum(weights)
      sum(weights^2*(y-mean)^2)-sum(weights)+sum(weights^2)/sum(weights)
    }
    if (score(0) <= 0) 0 else uniroot(score, c(0,10*var(y)+max(v)), tol=1e-12)$root
  }
  tau <- reml_variance(y, v); w <- 1/(v+tau)
  mu <- sum(w*y)/sum(w); se <- sqrt(1/sum(w)); hkq <- sum(w*(y-mu)^2)/(k-1)
  # Binary outcomes viewed as Bernoulli samples for MD/SMD formula fixtures.
  s1 <- sqrt(p1*(1-p1)*n1/(n1-1)); s2 <- sqrt(p2*(1-p2)*n2/(n2-1))
  pooledSD <- sqrt(((n1-1)*s1^2+(n2-1)*s2^2)/(N-2))
  # Correlation transformation fixture, from BCG risks and sample sizes.
  zr <- p1-p2; zn <- N
})
# with(environment, ...) assigns into that environment; enforce no hidden globals.
stopifnot(exists('tau', envir=e, inherits=FALSE))
e$modtau <- mod$tau2 # R2 checks the reduction formula, not the moderator optimizer.
e$ablat <- bcg$ablat
e$looVariance <- vapply(seq_len(nrow(dat)), function(i)
  as.numeric(vcov(rma(yi, vi, data=dat[-i, ], method='REML', control=precise))), numeric(1))
e$fullVariance <- as.numeric(vcov(fit))
# A numerator fixture for the quotient rule, not validation of an FI algorithm.
e$fi <- seq_len(nrow(dat))
# Additional algebra fixtures reuse BCG numbers as times, costs, QALYs and
# component predictors. No survival/economic/component analysis of BCG is claimed.
olsfit <- rma(yi, vi=rep(1,nrow(dat)), mods=~ablat, data=dat, method='FE')
quadratic <- rma(yi, vi, mods=~ablat+I(ablat^2), data=dat, method='REML', control=precise)
components <- rma(yi, vi, mods=~ablat+year-1, data=dat, method='REML', control=precise)
e$X <- cbind(1,bcg$ablat)
e$Xquad <- cbind(1,bcg$ablat,bcg$ablat^2)
e$betaquad <- as.numeric(coef(quadratic))
e$componentCoefficients <- as.numeric(coef(components))
e$ols <- as.numeric(solve(crossprod(e$X),crossprod(e$X,e$y)))

es <- function(measure, ...) escalc(measure=measure, ...)
binary <- function(measure) es(measure, ai=bcg$tpos, bi=bcg$tneg, ci=bcg$cpos, di=bcg$cneg)
props <- es('PR', xi=bcg$tpos, ni=bcg$tpos+bcg$tneg)
diagSe <- es('PR', xi=bcg$tpos, ni=bcg$tpos+bcg$cpos)$yi
diagSp <- es('PR', xi=bcg$cneg, ni=bcg$tneg+bcg$cneg)$yi
zcor <- es('ZCOR', ri=e$zr, ni=e$zn)
md <- es('MD', m1i=e$p1, m2i=e$p2, sd1i=e$s1, sd2i=e$s2, n1i=e$n1, n2i=e$n2)
smd <- es('SMD', m1i=e$p1, m2i=e$p2, sd1i=e$s1, sd2i=e$s2, n1i=e$n1, n2i=e$n2)
pred <- predict(tfit)
# Overlapping Handbook bands are interpretation guidance, not metafor estimates.
# Check literal endpoints plus membership of the independently fitted I2 value.
lower <- c(0,30,50,75); upper <- c(40,60,90,100)
refs <- list(
  HKSJ=c(hk$se, hk$ci.lb, hk$ci.ub), REML=fit$tau2, tau2=fit$tau2,
  DL=dl$tau2, PM=pm$tau2,
  I2=c(dl$I2, fit$I2, lower, upper, as.numeric(fit$I2 >= lower & fit$I2 <= upper)),
  i2=c(dl$I2, fit$I2, lower, upper, as.numeric(fit$I2 >= lower & fit$I2 <= upper)),
  Q=fit$QE, H2=c(dl$H2, fit$H2), Tau=sqrt(fit$tau2),
  PI=c(pred$pi.lb, pred$pi.ub), HKScale=c(hk$s2w, adhoc$s2w),
  IV=weights(fit), Weight=weights(fit), Variance=dat$vi,
  ZTest=fit$zval, TTest=c(tfit$zval, tfit$ddf),
  SMD=smd$yi, MD=md$yi, OR=exp(binary('OR')$yi), RR=exp(dat$yi), RD=binary('RD')$yi,
  DOR=exp(binary('OR')$yi), Se=diagSe, Sp=diagSp,
  FPR=es('PR', xi=bcg$tneg, ni=bcg$tneg+bcg$cneg)$yi,
  ROC=c(diagSe, 1-diagSp), LogRR=dat$yi, LogOR=binary('OR')$yi,
  Proportion=props$yi, Logit=es('PLO', xi=bcg$tpos, ni=e$n1)$yi,
  FisherZ=c(zcor$yi, zcor$vi),
  Rho=c(-1,1,transf.ztor(zcor$yi)), Correlation=c(-1,1,transf.ztor(zcor$yi)),
  Residual=residuals(fit), RSS=hk$s2w*(fit$k-fit$p), R2=mod$R2,
  CovRatio=influence(fit)$inf$cov.r,
  Centering=as.numeric(model.matrix(rma(yi, vi, mods=~I(ablat-mean(ablat)), data=dat))[,2]),
  LRpos=exp(es('RR', ai=bcg$tpos, bi=bcg$cpos, ci=bcg$tneg, di=bcg$cneg)$yi),
  LRneg=exp(es('RR', ai=bcg$cpos, bi=bcg$tpos, ci=bcg$cneg, di=bcg$tneg)$yi),
  # Fagan: sample prevalence is used solely as a pre-test probability fixture.
  Fagan=es('PR', xi=bcg$tpos, ni=bcg$tpos+bcg$tneg)$yi,
  FragilityQuotient=es('PR', xi=e$fi, ni=e$N)$yi,
  VarianceRatio=influence(fit)$inf$cov.r,
  CumulativeIncidence=props$yi,
  HR=exp(es('IRR', x1i=bcg$tpos, x2i=bcg$cpos, t1i=e$n1, t2i=e$n2)$yi),
  IRR=exp(es('IRR', x1i=bcg$tpos, x2i=bcg$cpos, t1i=e$n1, t2i=e$n2)$yi),
  ICER=es('MD', m1i=e$b, m2i=e$d, sd1i=rep(1,e$k), sd2i=rep(1,e$k), n1i=e$n1, n2i=e$n2)$yi /
       es('MD', m1i=e$a, m2i=e$c, sd1i=rep(1,e$k), sd2i=rep(1,e$k), n1i=e$n1, n2i=e$n2)$yi,
  Component=as.numeric(predict(components,newmods=c(1,1))$pred),
  Additivity=as.numeric(predict(components,newmods=c(1,1))$pred),
  OLS=as.numeric(coef(olsfit)), Quadratic=as.numeric(fitted(quadratic)),
  # Ordinary regression R2 is not metafor's heterogeneity-reduction R2.
  # The independent base-R lm reference checks the definition in this entry.
  Determination=with(summary(lm(yi~ablat,data=dat)), c(r.squared,adj.r.squared)),
  LR=c(diagSe/(1-diagSp),(1-diagSe)/diagSp)
)

checked <- rows[nzchar(rows$expression), ]
stopifnot(setequal(checked$key, names(refs)),
          all(checked$reference == checked$key),
          all(nzchar(rows$expression) == nzchar(rows$reference)))
compare <- function(expression, reference) {
  actual <- eval(parse(text=expression), envir=e)
  expected <- refs[[reference]]
  is.numeric(actual) && is.numeric(expected) && length(actual) == length(expected) &&
    length(actual) > 0L && all(is.finite(actual)) && all(is.finite(expected)) &&
    all(abs(as.numeric(actual)-as.numeric(expected)) <= 1e-6)
}
for (i in seq_len(nrow(checked))) {
  row <- checked[i, ]
  if (!isTRUE(compare(row$expression, row$reference))) stop('Formula mismatch: ', row$key)
  # A perturbed result must fail for EVERY check, through the same comparator.
  if (isTRUE(compare(paste0('(', row$expression, ')+1'), row$reference)))
    stop('Undetected numerical plant: ', row$key)
  cat('CHECK ', row$key, '\n', sep='')
}
# The same comparator must accept the valid conventional I2 formula and reject
# a wrong degrees-of-freedom formula. Do not confuse REML and conventional I2.
refs$PlantI2 <- dl$I2
stopifnot(compare('100*max(0,(Q-(k-1))/Q)', 'PlantI2'))
plant_detected <- !compare('100*max(0,(Q-k)/Q)', 'PlantI2')
stopifnot(plant_detected)
cat('PLANT_DETECTED\n')
cat('R_CHECK_PASS\n')
