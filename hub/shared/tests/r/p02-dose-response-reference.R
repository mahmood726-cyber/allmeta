# Run from wt/: Rscript hub/shared/tests/r/p02-dose-response-reference.R
# Synthetic data only. This adds a fixture; it never rewrites the published corpus.
suppressPackageStartupMessages({ library(dosresmeta); library(metafor) })
destination <- "hub/shared/tests/fixtures/p02-dose-response-reference.json"
if (file.exists(destination)) stop("Refusing to overwrite the recorded R reference")

# Base-R JSON, preserving 17 significant digits and array dimensions, including
# length-one vectors. Undefined R statistics are represented explicitly as null.
arr <- function(x) unname(as.list(x))
mat <- function(x) lapply(seq_len(nrow(x)), function(i) arr(x[i, ]))
json <- function(x) {
  if (is.null(x)) return("null")
  if (is.list(x)) {
    fields <- vapply(x, json, character(1))
    if (!is.null(names(x))) return(paste0("{", paste(paste0(encodeString(names(x), quote='"'), ":", fields), collapse=","), "}"))
    return(paste0("[", paste(fields, collapse=","), "]"))
  }
  if (length(x) != 1L) return(json(arr(x)))
  if (is.na(x)) return("null")
  if (is.character(x)) return(encodeString(x, quote='"'))
  if (is.logical(x)) return(if (x) "true" else "false")
  if (is.numeric(x) && is.finite(x)) return(trimws(formatC(x, digits=17, format="g", decimal.mark=".")))
  stop("Unsupported JSON value")
}
make_data <- function(slopes, exact=FALSE) {
  do.call(rbind, lapply(seq_along(slopes), function(i) {
    dose <- c(2, 3, 5, 8)
    data.frame(id=i, dose=dose, cases=c(35, 42, 38, 47) + 3*i,
      n=c(1000, 1100, 1050, 1200) * if (i %% 3 == 0) 10 else 1,
      logrr=slopes[i]*(dose-2) + if (exact) 0 else c(0, .015, -.025, .01),
      se=c(0, .19, .23, .27) + c(0, 1, 1, 1)*i*.007,
      type=c("cc", "ci", "ir")[(i-1) %% 3 + 1], moderator=i-3.5)
  }))
}
heterogeneous <- make_data(c(-.18, -.02, .07, .23, .12, -.10))
two <- heterogeneous[heterogeneous$id <= 2, ]
boundary <- make_data(rep(.08, 4), exact=TRUE)
zero <- heterogeneous[heterogeneous$id <= 3, ]
zero$cases[zero$id == 1 & zero$dose == 3] <- 0
positive <- heterogeneous[heterogeneous$id <= 3, ]
studies <- function(d) lapply(unique(d$id), function(id) {
  s <- d[d$id == id, ]
  list(id=as.character(id), mod=s$moderator[1], rows=lapply(seq_len(nrow(s)), function(i) {
    row <- as.list(s[i, c("dose", "cases", "n", "logrr", "se", "type")])
    if (row$se == 0) row$se <- NA_real_
    row
  }))
})

fit_r <- function(d, opts) {
  formula <- if (opts$model == "quadratic") logrr ~ dose + I(dose^2) else logrr ~ dose
  args <- list(formula=formula, id=d$id, type=d$type, se=d$se, cases=d$cases, n=d$n,
               data=d, covariance=opts$covariance, proc=opts$proc, method=opts$method)
  if (isTRUE(opts$mod)) args$mod <- ~ moderator
  do.call(dosresmeta, args)
}
options_for <- function(method="fixed", proc="2stage", covariance="gl", model="linear", mod=FALSE) {
  list(method=method, proc=proc, covariance=covariance, model=model, mod=mod)
}
capture <- function(fn, allow_refusal=FALSE) {
  warnings <- character()
  result <- tryCatch(withCallingHandlers(fn(), warning=function(w) {
    warnings <<- c(warnings, conditionMessage(w)); invokeRestart("muffleWarning")
  }), error=function(e) {
    if (!allow_refusal) stop(e)
    list(ok=FALSE, error=conditionMessage(e))
  })
  result$warnings <- arr(warnings)
  result
}
wald <- function(f, terms) {
  w <- dosresmeta::waldtest(Sigma=vcov(f), b=coef(f), Terms=terms)$chitest
  list(chi2=unname(w[1]), df=unname(w[2]), p=unname(w[3]))
}
cases <- list()
add_dr <- function(id, gap, d, opts) {
  cat("Computing", id, "\n")
  grid <- c(1, 2, 4, 7); xref <- 4
  fitted <- capture(function() list(ok=TRUE, fit=fit_r(d, opts)), allow_refusal=TRUE)
  reference <- if (!fitted$ok) fitted else capture(function() {
    f <- fitted$fit
    b <- coef(f); V <- vcov(f); q <- f$dim$q
    # mixmeta exports the generic; dosresmeta registers its S3 method.
    qt <- if (opts$proc == "2stage") mixmeta::qtest(f) else NULL
    g <- dosresmeta::gof(f)
    # predict.dosresmeta supplies z-based confidence intervals, not PIs.
    # Moderator predictions remain an explicit coverage gap; this case checks
    # coefficient, covariance, Wald and goodness-of-fit output only.
    prediction <- NULL
    if (!opts$mod) {
      p <- predict(f, data.frame(dose=grid), xref=xref, expo=FALSE, order=FALSE)
      prediction <- lapply(seq_along(grid), function(i) list(dose=grid[i], logRR=p$pred[i],
        se=(p$ci.ub[i]-p$pred[i])/qnorm(.975), ciLo=p$ci.lb[i], ciHi=p$ci.ub[i],
        rr=exp(p$pred[i]), rrLo=exp(p$ci.lb[i]), rrHi=exp(p$ci.ub[i])))
    }
    list(ok=TRUE, coef=arr(b), vcov=mat(V), Psi=if (is.null(f$Psi)) NULL else mat(f$Psi),
      logLik=if (is.null(f$logLik)) NULL else as.numeric(f$logLik),
      qtest=if (is.null(qt)) NULL else list(Q=arr(qt$Q), df=arr(qt$df), p=arr(qt$pvalue)),
      wald=wald(f, seq_along(b)), waldNonlin=if (q > 1 && !opts$mod) wald(f, 2:q) else NULL,
      gof=list(D=g$deviance$D, df=g$deviance$df, p=g$deviance$p, R2=g$R2, R2adj=g$R2adj,
               residuals=arr(g$tdata$tresiduals)), predictions=prediction)
  })
  reference$warnings <- c(fitted$warnings, reference$warnings)
  cases[[length(cases)+1]] <<- list(id=id, gap=gap, api="fitDR", studies=studies(d),
    options=opts, prediction=list(doses=arr(grid), xref=xref), reference=reference)
}
add_pool <- function(id, d, method) {
  cat("Computing", id, "\n")
  reference <- capture(function() {
    # Canonical GL reconstruction and GLS within each study, independent of JS.
    per <- lapply(unique(d$id), function(i) {
      f <- fit_r(d[d$id == i, ], options_for(proc="1stage"))
      list(beta=unname(coef(f)[1]), varBeta=unname(vcov(f)[1,1]))
    })
    f <- metafor::rma.uni(yi=vapply(per, function(s) s$beta, 0),
      vi=vapply(per, function(s) s$varBeta, 0), method=method, test="z",
      control=list(threshold=1e-12, maxiter=1000))
    list(ok=TRUE, slope=unname(coef(f)[1]), se=unname(f$se), tau2=f$tau2,
      ciLo=unname(f$ci.lb), ciHi=unname(f$ci.ub), perStudy=per, k=f$k)
  })
  cases[[length(cases)+1]] <<- list(id=id, gap="PM/DL pooling", api="fit", studies=studies(d),
    options=list(method=method), reference=reference)
}
for (method in c("PM", "DL", "FE")) {
  add_pool(paste0("pool-heterogeneous-", method), heterogeneous, method)
  add_pool(paste0("pool-k2-", method), two, method)
  add_pool(paste0("pool-boundary-", method), boundary, method)
}
for (proc in c("2stage", "1stage")) {
  add_dr(paste0("k1-", proc, "-fixed"), "small k", two[two$id == 1, ], options_for(proc=proc))
  for (method in c("fixed", "reml", "ml", if (proc == "2stage") "mm")) {
    add_dr(paste0("k2-", proc, "-", method), "small k", two, options_for(method, proc))
    add_dr(paste0("boundary-", proc, "-", method), "zero heterogeneity", boundary, options_for(method, proc, "indep"))
  }
}
for (covariance in c("gl", "h", "indep")) {
  add_dr(paste0("zero-cell-", covariance), "zero cells", zero, options_for(covariance=covariance))
  add_dr(paste0("positive-control-", covariance), "zero cells", positive, options_for(covariance=covariance))
}
for (proc in c("2stage", "1stage")) for (covariance in c("gl", "indep")) {
  add_dr(paste0("quadratic-", proc, "-", covariance), "intervals and inference", heterogeneous,
         options_for(proc=proc, covariance=covariance, model="quadratic"))
}
add_dr("moderator-linear-fixed", "intervals and inference", heterogeneous, options_for(mod=TRUE))
reference <- list(schema="p02-dose-response-r-parity-v1", provenance=list(
  script="hub/shared/tests/r/p02-dose-response-reference.R", R=R.version.string,
  packages=lapply(c("dosresmeta", "mixmeta", "metafor", "metadat", "Matrix", "nlme", "numDeriv"),
    function(p) list(package=p, version=as.character(packageVersion(p)))),
  serialization="base R; 17 significant digits", data="Synthetic, nonclinical inputs defined in this script",
  intervals="95% z confidence intervals; dose-response app exposes no prediction intervals"), cases=cases)
writeLines(json(reference), destination, useBytes=TRUE)
cat("Wrote", destination, "with", length(cases), "cases\n")
cat("R:", R.version.string, "\n")
for (p in reference$provenance$packages) cat(p$package, p$version, "\n")
for (case in cases) cat(case$id, if (case$reference$ok) "FIT" else paste("REFUSED:", case$reference$error), "\n")
