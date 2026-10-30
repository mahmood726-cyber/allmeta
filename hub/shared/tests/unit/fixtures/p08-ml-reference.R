# Run from wt/: Rscript hub/shared/tests/unit/fixtures/p08-ml-reference.R
# New regression reference only. Never rewrites the published validation corpus.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
path <- 'hub/shared/tests/unit/fixtures/'
input <- fromJSON(paste0(path, 'p08-ml-input.json'), simplifyVector=FALSE)
cases <- list(balanced=input, heterogeneous=input, interaction=input,
              boundary=input, null=input)
cases$heterogeneous$vi <- as.list(rep(c(.04, .2, .08, .16, .12, .3), 2))
cases$interaction <- cases$heterogeneous
cases$interaction$interaction <- TRUE
cases$interaction$yi <- as.list(unlist(input$yi) + vapply(input$mods, function(r) .07*r[[1]]*r[[2]], 0.0))
cases$boundary$yi <- as.list(rep(.5, length(input$yi)))
cases$null$yi <- as.list(unlist(input$yi) - vapply(input$mods, function(r) .05*r[[2]], 0.0))
reference <- function(c) {
  y <- unlist(c$yi); v <- unlist(c$vi); z <- do.call(rbind, lapply(c$mods, unlist))
  X <- cbind(1, z)
  if (isTRUE(c$interaction)) X <- cbind(X, z[,1]*z[,2])
  reducedX <- if (isTRUE(c$interaction)) X[,-ncol(X),drop=FALSE] else X[,1:2,drop=FALSE]
  # Work in data-derived units so metafor's absolute numerical defaults cannot
  # reproduce the very unit-dependence under test. Transform the fit back below.
  unit <- sqrt(max(var(y), mean(v)))
  fit <- function(M) rma(yi=y/unit, vi=v/unit^2, mods=M[,-1,drop=FALSE],
                         method='ML', test='z',
                         control=list(threshold=1e-13, stepadj=.5, maxiter=10000))
  full <- fit(X); reduced <- fit(reducedX)
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
for (name in names(cases)) for (scale in c(1, 1e-3, 1e-6, 1e-8, 1e6)) {
  c <- cases[[name]]
  c$yi <- as.list(unlist(c$yi)*scale); c$vi <- as.list(unlist(c$vi)*scale^2)
  records[[length(records)+1]] <- list(case=name, scale=scale, input=c, expected=reference(c))
}
result <- list(versions=list(R=R.version.string, platform=R.version$platform,
  metafor=as.character(packageVersion('metafor')), jsonlite=as.character(packageVersion('jsonlite'))),
  method='ML; data-normalized R fit; threshold=1e-13, stepadj=0.5, maxiter=10000',
  scriptMD5=unname(tools::md5sum(paste0(path, 'p08-ml-reference.R'))), records=records)
writeLines(toJSON(result, auto_unbox=TRUE, digits=NA, pretty=TRUE), paste0(path, 'p08-ml-reference.json'))
cat(toJSON(result$versions, auto_unbox=TRUE), '\n')
cat('Generated', length(records), 'independent R reference fits.\n')
for (r in records) if (r$case=='balanced') cat('balanced scale=', r$scale, ' tau2=',
  sprintf('%.17g', r$expected$full$tau2), ' LRT=', sprintf('%.17g', r$expected$comparison$LRT), '\n', sep='')
