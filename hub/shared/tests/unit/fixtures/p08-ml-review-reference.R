# Run from wt/. Generated evidence goes to the system temporary directory.
# The committed fixture is copied from this real R run, never hand-calculated.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
path <- 'hub/shared/tests/unit/fixtures/'
input <- fromJSON(paste0(path, 'p08-ml-input.json'), simplifyVector=FALSE)
source('meta-regression/validate/reference.R')
original <- plus_reference

# Independent fit with a data unit unaffected by an arbitrarily large variance.
# metafor's absolute numerical defaults then operate in informative-study units.
reference <- function(c) {
  y <- unlist(c$yi); v <- unlist(c$vi)
  z <- do.call(rbind, lapply(c$mods, unlist))
  unit <- sqrt(min(v))
  fit <- function(z) rma(yi=y/unit, vi=v/unit^2, mods=z, method='ML', test='z',
    control=list(threshold=1e-13, stepadj=.5, maxiter=10000))
  full <- fit(z); reduced <- fit(z[,1,drop=FALSE])
  values <- function(m) list(tau2=unname(m$tau2)*unit^2,
    beta=as.numeric(m$b)*unit, se=as.numeric(m$se)*unit,
    z=as.numeric(m$zval), pval=as.numeric(m$pval),
    ciLo=as.numeric(m$ci.lb)*unit, ciHi=as.numeric(m$ci.ub)*unit,
    logLik=as.numeric(logLik(m))-length(y)*log(unit),
    AIC=as.numeric(AIC(m))+2*length(y)*log(unit),
    BIC=as.numeric(BIC(m))+2*length(y)*log(unit))
  a <- anova(reduced, full)
  list(full=values(full), reduced=values(reduced),
    comparison=list(LRT=unname(a$LRT), df=unname(full$p-reduced$p), pval=unname(a$pval)))
}
records <- list()
for (name in c('ordinary', 'imprecise')) for (scale in c(1, 1e-3, 1e-6, 1e-8, 1e6)) {
  c <- input
  if (name=='imprecise') c$vi[[12]] <- 1e14
  c$yi <- as.list(unlist(c$yi)*scale); c$vi <- as.list(unlist(c$vi)*scale^2)
  expected <- reference(c)
  # Match the adapter's mods=list(c(...), ...) input, not jsonlite's nested lists.
  liveInput <- c
  liveInput$mods <- lapply(c$mods, unlist)
  actual <- tryCatch(original(liveInput),
    error=function(e) list(status='error', reason=conditionMessage(e)))
  live <- actual[c('status', 'reason', 'full', 'reduced', 'comparison')]
  live <- live[!vapply(live, is.null, logical(1))]
  records[[length(records)+1]] <- list(case=name, scale=scale, input=c,
    expected=expected, currentInput=live)
  cat('CURRENT_INPUT ', name, ' scale=', scale, ' status=', actual$status,
      ' tau2=', sprintf('%.17g', actual$full$tau2),
      ' LRT=', sprintf('%.17g', actual$comparison$LRT),
      ' independent_tau2=', sprintf('%.17g', expected$full$tau2),
      ' independent_LRT=', sprintf('%.17g', expected$comparison$LRT),
      ' reason=', actual$reason, '\n', sep='')
}
result <- list(versions=list(R=R.version.string, platform=R.version$platform,
  metafor=as.character(packageVersion('metafor')), jsonlite=as.character(packageVersion('jsonlite'))),
  method='ML; min(vi) normalized independent metafor fit; threshold=1e-13, stepadj=0.5, maxiter=10000',
  records=records)
destination <- file.path(tempdir(), 'p08-ml-review-reference.json')
writeLines(toJSON(result, auto_unbox=TRUE, digits=NA, pretty=TRUE), destination)
cat('REFERENCE_JSON_BEGIN\n', toJSON(result, auto_unbox=TRUE, digits=NA), '\nREFERENCE_JSON_END\n', sep='')
