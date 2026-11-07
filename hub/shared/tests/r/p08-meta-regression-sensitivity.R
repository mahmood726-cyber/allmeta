# Diagnostic only: never overwrites the retained parity fixture or changes a tolerance.
# Run from wt/: Rscript hub/shared/tests/r/p08-meta-regression-sensitivity.R
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
suppressPackageStartupMessages(library(numDeriv))
ref <- fromJSON("hub/shared/tests/r/p08-meta-regression-reference.json", simplifyVector=FALSE)
vec <- function(x) as.numeric(unlist(x))
# Keep the full transcript in TEMP: the wrapper truncates long console output.
# Only the previously missing constant-scale and small-k evidence goes to stdout.
transcript <- character()
emit <- function(label, x) {
  lines <- c(label, capture.output(print(x, digits=17)))
  transcript <<- c(transcript, lines, "")
  if (grepl("^Versions$|^constant_scale|^k[12]", label))
    cat(paste(lines, collapse=" "), "\n")
}
emit("Versions", c(R=R.version.string, metafor=as.character(packageVersion("metafor")),
  numDeriv=as.character(packageVersion("numDeriv"))))
# Retain the relevant installed implementation and its Hessian defaults.
src <- deparse(get("rma.uni", asNamespace("metafor")))
hits <- grep("hesspack|hessianCtrl|numDeriv::hessian|optimHess|scaleZ", src)
lines <- sort(unique(unlist(lapply(hits, function(i) seq.int(max(1, i-2), min(length(src), i+3))))))
transcript <- c(transcript, "Installed metafor rma.uni Hessian/scaling excerpts:", src[lines], "")

for (case in ref$input$ls) {
  yi <- vec(case$yi); vi <- if(is.null(case$vi)) vec(case$se)^2 else vec(case$vi)
  x <- vec(case$x); X <- cbind(1, x); Z <- X
  retained <- ref$ls[[which(vapply(ref$ls, function(r) r$id == case$id, logical(1)))]]
  profile_nll <- function(alpha) {
    tau2 <- as.numeric(exp(Z %*% alpha)); v <- vi + tau2; w <- 1/v
    b <- solve(crossprod(X, w * X), crossprod(X, w * yi))
    e <- as.numeric(yi - X %*% b)
    sum(log(2*pi*v) + e^2/v)/2
  }
  emit(paste(case$id, "retained alpha / alphaSE / logLik"),
    list(alpha=vec(retained$alpha), alphaSE=vec(retained$alphaSE), logLik=retained$logLik))
  # Different finite-difference steps at the SAME retained optimum isolate
  # curvature calculation from optimizer changes. These are not new baselines.
  for (eps in c(1e-4, 1e-3, 1e-2)) {
    H <- numDeriv::hessian(profile_nll, vec(retained$alpha), method.args=list(eps=eps))
    V <- solve(H)
    emit(paste(case$id, "profile Hessian at retained alpha; eps", eps),
      list(alphaSE=sqrt(diag(V)), alphaVcov=V))
  }
  controls <- list(
    original=ref$provenance$ls_control,
    tighter_BFGS=modifyList(ref$provenance$ls_control, list(reltol=1e-14)),
    Nelder_Mead=modifyList(ref$provenance$ls_control, list(optmethod="Nelder-Mead", reltol=1e-14)))
  for (label in names(controls)) {
    result <- tryCatch({
      m <- rma(yi=yi, vi=vi, mods=~x, scale=~x, link="log", method="ML", test="z", control=controls[[label]])
      list(alpha=as.numeric(m$alpha), alphaSE=as.numeric(m$se.alpha), alphaVcov=unname(m$va),
        logLik=as.numeric(logLik(m)), alpha_delta=as.numeric(m$alpha)-vec(retained$alpha))
    }, error=function(e) list(error=conditionMessage(e)))
    emit(paste(case$id, "metafor optimizer", label), result)
  }
  if (case$id == "constant_scale") {
    # Paired symmetric residuals give a closed-form ML optimum; beta/alpha
    # cross-information vanishes here. Obtain all numbers from the input in R.
    b <- solve(crossprod(X), crossprod(X, yi)); e <- as.numeric(yi-X %*% b)
    stopifnot(max(abs(vi-vi[1])) < 1e-14, max(abs(e^2-mean(e^2))) < 1e-14)
    t2 <- mean(e^2)-vi[1]
    V <- solve(0.5*(t2/(t2+vi[1]))^2 * crossprod(Z))
    emit("constant_scale analytic diagnostic (not a replacement oracle)",
      list(alpha=c(log(t2), 0), tau2=t2, alphaSE=sqrt(diag(V)), alphaVcov=V))
  }
}

# The original oracle wraps fit and predict together. Identify the exact stage
# for k=1/2 without rewriting its refusal entry or treating dropped x as a fit.
for (case in Filter(function(c) c$id %in% c("k1", "k2"), ref$input$pm)) {
  yi <- vec(case$yi); se <- vec(case$se); x <- vec(case$x); warns <- character()
  result <- withCallingHandlers(tryCatch({
    m <- rma(yi=yi, sei=se, mods=~x, method="PM", test="adhoc", control=ref$provenance$pm_control)
    list(fit="returned", k=m$k, p=m$p, test=m$test, beta=as.numeric(m$b),
      prediction=tryCatch({predict(m, newmods=mean(x)); "returned"}, error=function(e) conditionMessage(e)))
  }, error=function(e) list(fit="error", error=conditionMessage(e))), warning=function(w) {
    warns <<- c(warns, conditionMessage(w)); invokeRestart("muffleWarning")
  })
  emit(paste(case$id, "fit/predict stages"), list(result=result, warnings=warns))
}
out <- file.path(dirname(tempdir()), "rpar-p08-sensitivity.txt")
writeLines(transcript, out, useBytes=TRUE)
cat("Full diagnostic transcript:", normalizePath(out, winslash="/"), "\n")
