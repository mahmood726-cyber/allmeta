# Run from wt/: Rscript hub/shared/tests/r/p08-meta-regression-reference.R
# Only R computes the oracle. Output goes to TEMP for review before retention.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
here <- "hub/shared/tests/r"
input_path <- file.path(here, "p08-meta-regression-input.json")
script_path <- file.path(here, "p08-meta-regression-reference.R")
input <- fromJSON(input_path, simplifyVector=FALSE)
vec <- function(x) as.numeric(unlist(x))
warnings <- character()
capture <- function(expr) withCallingHandlers(expr, warning=function(w) {
  warnings <<- c(warnings, conditionMessage(w)); invokeRestart("muffleWarning")
})
pm_control <- list(tol=1e-12, maxiter=10000)
ls_control <- list(optimizer="optim", optmethod="BFGS", reltol=1e-12, maxit=10000)
pm <- lapply(input$pm, function(c) {
  yi <- vec(c$yi); se <- vec(c$se); x <- vec(c$x)
  tryCatch(capture({
    m <- rma(yi=yi, sei=se, mods=~x, method="PM", test="adhoc", control=pm_control)
    n <- rma(yi=yi, sei=se, method="PM", test="adhoc", control=pm_control)
    kn <- rma(yi=yi, sei=se, mods=~x, method="PM", test="knha", control=pm_control)
    z <- rma(yi=yi, sei=se, mods=~x, method="PM", test="z", control=pm_control)
    pr <- predict(m, newmods=mean(x)); pr_z <- predict(z, newmods=mean(x))
    # Explicit conventions, independently from base R qt and metafor's prediction SE.
    width_k1 <- qt(.975, length(yi)-1) * sqrt(m$tau2 + pr$se^2)
    list(id=c$id, status="ok", k=m$k, df=m$ddf,
      beta=as.numeric(m$b), se=as.numeric(m$se), t=as.numeric(m$zval),
      p=as.numeric(m$pval), ciLo=as.numeric(m$ci.lb), ciHi=as.numeric(m$ci.ub),
      tau2=m$tau2, tau2Null=n$tau2, q=m$s2w, QE=m$QE, QEp=m$QEp, R2=m$R2/100,
      pi=list(xbar=mean(x), pred=pr$pred, se=pr$se, lo=pr$pi.lb, hi=pr$pi.ub),
      pi_k1=list(lo=pr$pred-width_k1, hi=pr$pred+width_k1),
      pi_z=list(lo=pr_z$pi.lb, hi=pr_z$pi.ub),
      knha=list(q=kn$s2w, se=as.numeric(kn$se)), tcrit=qt(.975, m$ddf))
  }), error=function(e) list(id=c$id, status="refused", reason=conditionMessage(e)))
})
ls <- lapply(input$ls, function(c) {
  yi <- vec(c$yi); vi <- if(is.null(c$vi)) vec(c$se)^2 else vec(c$vi); x <- vec(c$x)
  m <- capture(rma(yi=yi, vi=vi, mods=~x, scale=~x, link="log", method="ML", test="z", control=ls_control))
  list(id=c$id, beta=as.numeric(m$b), betaSE=as.numeric(m$se),
    betaVcov=unname(m$vb), alpha=as.numeric(m$alpha), alphaSE=as.numeric(m$se.alpha),
    alphaVcov=unname(m$va), tau2=as.numeric(m$tau2), logLik=as.numeric(logLik(m)),
    alphaZ=as.numeric(m$zval.alpha), alphaP=as.numeric(m$pval.alpha),
    betaCiLo=as.numeric(m$ci.lb), betaCiHi=as.numeric(m$ci.ub))
})
reference <- list(provenance=list(
  R=R.version.string, metafor=as.character(packageVersion("metafor")),
  jsonlite=as.character(packageVersion("jsonlite")),
  numDeriv=as.character(packageVersion("numDeriv")),
  input_md5=unname(tools::md5sum(input_path)), script_md5=unname(tools::md5sum(script_path)),
  pm_control=pm_control, ls_control=ls_control,
  pm_method="metafor::rma(method='PM', test='adhoc'); predict(newmods=mean(x))",
  ls_method="metafor::rma(mods=~x, scale=~x, link='log', method='ML', test='z')",
  pi_conventions="App: t(k-2), matching predict(adhoc). Simple pool/task convention: t(k-1). Also record predict(z).",
  serialization="base R; 17 significant digits", warnings=as.list(warnings)),
  input=input, pm=pm, ls=ls)
# Preserve all native double precision, vector shapes, and matrix rows.
json <- function(x) {
  if(is.matrix(x)) return(json(lapply(seq_len(nrow(x)), function(i) as.list(x[i,]))))
  if(is.list(x)) {
    values <- vapply(x, json, character(1))
    if(!is.null(names(x))) return(paste0("{", paste(paste0(encodeString(names(x), quote='"'), ":", values), collapse=","), "}"))
    return(paste0("[", paste(values, collapse=","), "]"))
  }
  if(length(x)!=1L) return(json(as.list(x)))
  if(is.character(x)) return(encodeString(x, quote='"'))
  if(is.logical(x)) return(if(x) "true" else "false")
  if(is.numeric(x) && is.finite(x)) return(trimws(formatC(x, digits=17, format="g", decimal.mark=".")))
  stop("Non-finite or unsupported oracle value")
}
out <- file.path(dirname(tempdir()), "rpar-p08-reference.json")
writeLines(json(reference), out, useBytes=TRUE)
cat("Reference:", normalizePath(out, winslash="/"), "\n")
cat(R.version.string, "; metafor", as.character(packageVersion("metafor")), "\n")
cat("PM:", paste(vapply(pm, function(m) paste(m$id, m$status), character(1)), collapse="; "), "\n")
cat("LS:", paste(vapply(ls, function(m) m$id, character(1)), collapse=", "), "\n")
