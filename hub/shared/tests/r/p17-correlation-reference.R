# From wt/: Rscript hub/shared/tests/r/p17-correlation-reference.R
# Independent native-R oracle. Never overwrite a recorded reference.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
script <- "hub/shared/tests/r/p17-correlation-reference.R"
input_path <- "hub/shared/tests/r/p17-correlation-input.json"
output_path <- "hub/shared/tests/r/p17-correlation-reference.json"
if (file.exists(output_path)) stop("Refusing to overwrite the recorded R reference")
input <- fromJSON(input_path, simplifyVector=FALSE)
ctrl <- list(threshold=1e-12, maxiter=10000, stepadj=0.5,
             tol=.Machine$double.eps^0.75)

# Base-R serialization preserves binary64 reference values (17 significant digits).
encode <- function(x) {
  if (is.null(x)) return("null")
  if (is.list(x)) {
    values <- vapply(x, encode, character(1))
    if (!is.null(names(x))) {
      values <- paste0(encodeString(names(x), quote='"'), ":", values)
      return(paste0("{", paste(values, collapse=","), "}"))
    }
    return(paste0("[", paste(values, collapse=","), "]"))
  }
  if (length(x) != 1L) return(encode(as.list(x)))
  if (is.na(x)) return("null")
  if (is.numeric(x)) return(if (is.finite(x)) sprintf("%.17g", x) else "null")
  if (is.logical(x)) return(if (x) "true" else "false")
  encodeString(as.character(x), quote='"')
}

fit_record <- function(fit, k, method, test) {
  mu <- as.numeric(coef(fit)); se <- as.numeric(fit$se)
  pi <- if (method == "FE") c(NA_real_, NA_real_) else
    mu + c(-1,1)*qt(.975, k-1)*sqrt(fit$tau2 + se^2)
  pred <- predict(fit)
  values <- list(mu_z=mu, se_z=se, tau2_z=fit$tau2, tau_z=sqrt(fit$tau2),
    Q=fit$QE, I2=fit$I2, df=k-1, ciLo=fit$ci.lb, ciHi=fit$ci.ub,
    piLo=pi[1], piHi=pi[2], r=tanh(mu), r_lo=tanh(fit$ci.lb),
    r_hi=tanh(fit$ci.ub), r_pi_lo=tanh(pi[1]), r_pi_hi=tanh(pi[2]))
  list(method=method, test=test, k=k, values=values,
    weights=as.list(as.numeric(weights(fit))),
    # Stored for transparency; the app does not expose these p-values/statistics.
    diagnostics=list(effect_stat=fit$zval, effect_p=fit$pval, Q_p=fit$QEp),
    predict_pi=if (method == "FE") list(NULL,NULL) else
      as.list(c(pred$pi.lb, pred$pi.ub)),
    quantile=if (k>=2) qt(.975,k-1) else NULL)
}

records <- lapply(input$cases, function(case) {
  r <- as.numeric(unlist(case$r)); n <- as.numeric(unlist(case$n)); k <- length(r)
  z <- v <- numeric()
  if (k > 0) {
    es <- escalc(measure="ZCOR", ri=r, ni=n)
    z <- as.numeric(es$yi); v <- as.numeric(es$vi)
  }
  rec <- list(id=case$id, group=case$group, k=k,
    z=as.list(z), v=as.list(v),
    study_lo=as.list(tanh(z-qnorm(.975)*sqrt(v))),
    study_hi=as.list(tanh(z+qnorm(.975)*sqrt(v))), fits=list(), loo=list())
  # The app refuses k<2 by policy; this is not a claim that metafor refuses k=1.
  if (k < 2) return(rec)
  for (method in c("REML","PM","DL","FE")) for (test in c("z","knha","adhoc")) {
    if (method == "FE" && test != "z") next # not offered by correlation-ma
    warnings <- character()
    fit <- withCallingHandlers(
      rma(yi=z, vi=v, method=method, test=test, control=ctrl),
      warning=function(w) { warnings <<- c(warnings,conditionMessage(w)); invokeRestart("muffleWarning") })
    fr <- fit_record(fit,k,method,test); fr$warnings <- as.list(warnings)
    rec$fits[[length(rec$fits)+1]] <- fr
    if (isTRUE(case$loo)) {
      # leave1out() is the independent package path, not a copy of the JS loop.
      l <- leave1out(fit)
      rows <- lapply(seq_len(k), function(i) {
        mu <- as.numeric(l$estimate[i]); se <- as.numeric(l$se[i]); tau2 <- as.numeric(l$tau2[i])
        pi <- if (method == "FE") c(NA_real_,NA_real_) else
          mu+c(-1,1)*qt(.975,k-2)*sqrt(tau2+se^2)
        list(omitted_index=i, mu_z=mu, se_z=se, tau2_z=tau2, Q=l$Q[i],
          I2=if(method=="FE") NULL else l$I2[i], ciLo=l$ci.lb[i], ciHi=l$ci.ub[i],
          piLo=pi[1], piHi=pi[2], r=tanh(mu), r_lo=tanh(l$ci.lb[i]),
          r_hi=tanh(l$ci.ub[i]), r_pi_lo=tanh(pi[1]), r_pi_hi=tanh(pi[2]),
          delta_r=tanh(mu)-fr$values$r)
      })
      rec$loo[[length(rec$loo)+1]] <- list(method=method,test=test,rows=rows)
    }
  }
  cat(case$id, ":", length(rec$fits), "fits;", length(rec$loo)*k, "omissions\n")
  rec
})
reference <- list(schema="p17-correlation-reference-v1",
  provenance=list(R=R.version.string,
    packages=lapply(c("metafor","metadat","Matrix","nlme","numDeriv","jsonlite"),
      function(p) list(package=p,version=as.character(packageVersion(p)))),
    script=script, script_md5=unname(tools::md5sum(script)),
    input=input_path, input_md5=unname(tools::md5sum(input_path)),
    serialization="base R; 17 significant digits", control=ctrl,
    oracle="metafor::escalc(ZCOR), rma(test=z/knha/adhoc), leave1out",
    pi_rule="mu +/- qt(.975,k-1)*sqrt(tau2+se^2); LOO uses k-2; FE has no PI"),
  input=input, cases=records)
writeLines(encode(reference), output_path, useBytes=TRUE)
cat("Recorded", length(records), "cases in", output_path, "\n")
cat(R.version.string, "; metafor", as.character(packageVersion("metafor")), "\n")
