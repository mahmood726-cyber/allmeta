# From wt/: Rscript hub/shared/tests/r/limit-ma-p12-reference.R
# Separate synthetic edge cases; never rewrite a published validation corpus.
suppressPackageStartupMessages({library(meta); library(metasens); library(metafor); library(jsonlite)})
folder <- "hub/shared/tests/r"
source(file.path(folder, "limit-ma-p12-json.R"))
input_path <- file.path(folder, "limit-ma-p12-input.json")
output_path <- file.path(folder, "limit-ma-p12-reference.json")
stopifnot(!file.exists(output_path)) # Refuse accidental rebaselining.
input <- fromJSON(input_path, simplifyVector = FALSE)
ok <- function(values) list(status = "ok", values = values)
refuse <- function(reason) list(status = "refused", reason = reason)
capture <- function(f) {
  warnings <- character()
  result <- withCallingHandlers(tryCatch(f(), error = function(e) refuse(conditionMessage(e))),
    warning = function(w) { warnings <<- c(warnings, conditionMessage(w)); invokeRestart("muffleWarning") })
  result$warnings <- as.list(warnings)
  result
}
regression <- function(y, s, power) {
  x <- s^power
  if (length(unique(x)) < 2) return(refuse("singular-design"))
  f <- lm(y ~ x, weights = 1/s^2)
  z <- summary(f)$coefficients
  ci <- confint(f)
  if (!is.finite(z[1, 2]) || z[1, 2] <= 0) return(refuse("undefined-regression"))
  ok(list(mu = unname(coef(f)[1]), slope = unname(coef(f)[2]), se = z[1, 2],
    ciLo = ci[1, 1], ciHi = ci[1, 2], t = z[1, 3], p = z[1, 4], df = f$df.residual))
}
primary <- function(m, l) {
  out <- list(k = m$k)
  mapping <- c(fe_est="TE.common",fe_se="seTE.common",fe_ci_lo="lower.common",fe_ci_hi="upper.common",
    re_est="TE.random",re_se="seTE.random",re_ci_lo="lower.random",re_ci_hi="upper.random",tau2_dl="tau2",tau_dl="tau")
  for (key in names(mapping)) out[[key]] <- m[[mapping[[key]], exact = TRUE]]
  mapping <- c(limit_est="TE.adjust",limit_se="seTE.adjust",limit_ci_lo="lower.adjust",limit_ci_hi="upper.adjust",
    slope="beta.r",alpha_r="alpha.r",beta_r="beta.r",Q="Q",Q_small="Q.small",Q_resid="Q.resid",G_squared="G.squared")
  for (key in names(mapping)) out[[key]] <- l[[mapping[[key]], exact = TRUE]]
  out$te_limit <- as.list(l$TE.limit)
  ok(out)
}
cases <- lapply(input$cases, function(c) {
  y <- unlist(c$te); s <- unlist(c$se); k <- length(y)
  m <- meta::metagen(y, s, method.tau="DL", method.random.ci="classic", method.tau.ci="", level=.95, level.ma=.95)
  l <- capture(function() primary(m, metasens::limitmeta(m, method.adjust="beta0")))
  r <- list(RE = ok(list(mu=m$TE.random,se=m$seTE.random,ciLo=m$lower.random,ciHi=m$upper.random,tau2=m$tau2)))
  if (k >= 3) {
    r$PET <- capture(function() regression(y, s, 1))
    r$PEESE <- capture(function() regression(y, s, 2))
    r$trimfill <- capture(function() {
      f <- meta::trimfill(m, type="L", ma.common=TRUE)
      ok(list(mu=f$TE.random,se=f$seTE.random,ciLo=f$lower.random,ciHi=f$upper.random,tau2=f$tau2,
        k0=f$k0,side=if(f$left) "left" else "right",imputed=as.list(unname(f$TE[f$trimfill])),
        imputedSE=as.list(unname(f$seTE[f$trimfill]))))
    })
    r$Egger <- if(k < 10) refuse("k-below-10") else capture(function() {
      e <- meta::metabias(m, method.bias="Egger", k.min=10)
      ok(list(statistic=unname(e$statistic),df=unname(e$df),p=e$pval))
    })
    r$selection <- capture(function() {
      p <- pnorm(y/s, lower.tail=FALSE)
      if (!any(p < .025) || !any(p >= .025)) return(refuse("empty-interval"))
      f <- metafor::selmodel(metafor::rma(y, vi=s^2, method="ML"), type="stepfun", steps=.025)
      ok(list(mu=as.numeric(f$beta[1]),tau2=f$tau2,delta=f$delta[2],se=f$se[1],ciLo=f$ci.lb[1],
        ciHi=f$ci.ub[1],logLik=as.numeric(logLik(f))))
    })
  }
  conditional <- if (k < 3) list() else lapply(unlist(input$alphas), function(alpha) {
    value <- if (r$PET$status != "ok") r$PET else {
      branch <- if(r$PET$values$p < alpha) "PEESE" else "PET"
      list(status="ok",branch=branch,values=r[[branch]]$values)
    }
    list(alpha=alpha,result=value)
  })
  if(l$status == "ok") {
    v <- l$values
    r$Qsmall <- ok(list(statistic=v$Q_small,df=1,p=pchisq(v$Q_small,1,lower.tail=FALSE)))
    r$Qresid <- ok(list(statistic=v$Q_resid,df=k-2,p=pchisq(v$Q_resid,k-2,lower.tail=FALSE)))
  }
  cat(c$id, "primary", l$status, "\n")
  list(id=c$id,te=c$te,se=c$se,primary=l,methods=r,conditional=conditional)
})
binary <- list()
for(measure in c("OR", "RR")) for(kind in c("positive10", "positive9", "zero_cell")) {
  counts <- do.call(rbind, lapply(input$binary_rows, unlist))
  if(kind == "positive9") counts <- counts[1:9, ]
  if(kind == "zero_cell") counts[1, 1] <- 0
  # R's zero-cell correction is recorded as evidence, not imposed on an app
  # that explicitly refuses nonpositive cells.
  b <- meta::metabin(counts[,1],counts[,2],counts[,3],counts[,4],sm=measure,
    method="Inverse",method.tau="DL",method.tau.ci="",incr=.5,method.incr="only0")
  e <- capture(function() {
    if(nrow(counts) < 10) return(refuse("k-below-10"))
    f <- meta::metabias(b, method.bias="Peters", k.min=10)
    ok(list(statistic=unname(f$statistic),df=unname(f$df),p=f$pval))
  })
  binary[[length(binary)+1]] <- list(id=paste(measure,kind,sep="_"),kind=kind,
    input=list(te=as.list(b$TE),se=as.list(b$seTE),binary=list(measure=measure,
      rows=lapply(seq_len(nrow(counts)),function(i) as.list(counts[i,])))),reference=e)
}
chi <- lapply(input$chi_square, function(pair) {
  x <- pair[[1]]; df <- pair[[2]]; list(x=x,df=df,p=pchisq(x,df,lower.tail=FALSE))
})
student <- lapply(input$student_t, function(pair) {
  t <- pair[[1]]; df <- pair[[2]]; list(t=t,df=df,p=2*pt(-abs(t),df),critical=qt(.975,df))
})
versions <- lapply(c("meta","metasens","metafor","jsonlite","metadat","stats"), function(p) as.character(packageVersion(p)))
names(versions) <- c("meta","metasens","metafor","jsonlite","metadat","stats")
result <- list(provenance=list(R=R.version.string,packages=versions,
  generator="hub/shared/tests/r/limit-ma-p12-reference.R",input_md5=unname(tools::md5sum(input_path)),
  methods=list(primary="meta::metagen(DL, classic) + metasens::limitmeta(beta0)",
    regression="stats::lm weighted by 1/se^2; confint and t tests (k-2 df)",
    selection="metafor::selmodel(rma(method=ML), type=stepfun, steps=.025); default optimizer",
    prediction_interval="Not offered by limit-ma; no predict() or PI oracle claimed")),
  cases=cases,binary=binary,chi_square=chi,student_t=student)
payload <- as.character(toJSON(result,auto_unbox=TRUE,digits=NA,pretty=TRUE,null="null",na="null"))
payload <- preserve_input_coordinates(payload, input$chi_square)
writeBin(charToRaw(paste0(payload, "\n")), output_path)
cat("Wrote",output_path,"\n",R.version.string,"\n")
print(versions)
