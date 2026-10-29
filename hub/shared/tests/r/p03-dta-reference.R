# Additive P03 coverage; never regenerates the publication's validation corpus.
# From wt/: Rscript hub/shared/tests/r/p03-dta-reference.R
suppressPackageStartupMessages(library(mada))
suppressPackageStartupMessages(library(jsonlite))
script <- "hub/shared/tests/r/p03-dta-reference.R"
output <- "hub/shared/tests/fixtures/p03-dta-reference.json"

# Preserve R doubles at 17 significant digits (including very small p-values).
encode <- function(x) {
  if (is.null(x)) return("null")
  if (is.list(x)) {
    values <- vapply(x, encode, "")
    if (!is.null(names(x))) return(paste0("{", paste(paste0(vapply(names(x), encode, ""), ":", values), collapse=","), "}"))
    return(paste0("[", paste(values, collapse=","), "]"))
  }
  if (length(x) != 1L) return(encode(unname(as.list(x))))
  if (is.na(x) || (is.numeric(x) && !is.finite(x))) return("null")
  if (is.character(x)) return(as.character(jsonlite::toJSON(x, auto_unbox=TRUE)))
  if (is.logical(x)) return(if (x) "true" else "false")
  sprintf("%.17g", x)
}
matrix_rows <- function(x) unname(lapply(seq_len(nrow(x)), function(i) unname(as.list(x[i,]))))
rows_of <- function(d) unname(lapply(seq_len(nrow(d)), function(i)
  list(tp=d$TP[i], fp=d$FP[i], fn=d$FN[i], tn=d$TN[i])))
load_data <- function(name) {
  e <- new.env(); data(list=name, package="mada", envir=e); as.data.frame(e[[name]])
}
audit <- load_data("AuditC")
smoking <- load_data("smoking")
ordinary <- data.frame(TP=c(80,35,90,62,22,150), FP=c(12,20,8,38,15,42),
                       FN=c(20,15,10,38,18,50), TN=c(88,80,92,162,45,258))
homogeneous <- data.frame(TP=c(80,160,240,320), FP=c(20,40,60,80),
                          FN=c(20,40,60,80), TN=c(80,160,240,320))
zero <- ordinary; zero$FP[2] <- 0; zero$FN[4] <- 0
ties <- data.frame(TP=c(80,40,70,35,60,30), FN=c(20,10,30,15,40,20),
                   FP=c(10,20,10,30,20,30), TN=c(90,180,90,70,180,70))
correct <- function(d, cc) {
  d <- d[,c("TP","FP","FN","TN")]
  zero_rows <- apply(d == 0, 1, any)
  if (cc == "all" && any(zero_rows)) d <- d + .5
  if (cc == "single") d[zero_rows,] <- d[zero_rows,] + .5
  d
}
methods <- c("fixed","mm","vc","ml","reml")
fit_one <- function(id, d, method, cc="all", regression=FALSE) {
  args <- list(data=d, method=method, correction.control=cc)
  X <- matrix(1, nrow(d), 1)
  if (regression) {
    args$formula <- cbind(tsens,tfpr) ~ type
    X <- model.matrix(~type, d)
  }
  warnings <- character()
  f <- tryCatch(withCallingHandlers(do.call(mada::reitsma, args), warning=function(w) {
    warnings <<- c(warnings, conditionMessage(w)); invokeRestart("muffleWarning")
  }), error=function(e) e)
  out <- list(id=paste(id,method,cc,sep="/"), dataset=id, rows=rows_of(d), method=method,
              correction=cc, regression=regression, X=matrix_rows(X), warnings=as.list(warnings))
  out$ok <- !inherits(f,"error")
  if (!out$ok) { out$error <- conditionMessage(f); return(out) }
  b <- as.numeric(coef(f)); V <- vcov(f); se <- sqrt(diag(V)); z <- b / se
  if (any(!is.finite(c(b,V)))) stop("Nonfinite reference fit: ", out$id)
  out$coef <- as.list(b); out$vcov <- matrix_rows(V)
  Psi <- if (is.null(f$Psi)) matrix(0,2,2) else f$Psi
  out$Psi <- matrix_rows(Psi)
  out$coefTable <- unname(lapply(seq_along(b), function(i) list(estimate=b[i],se=se[i],z=z[i],
    p=2*pnorm(abs(z[i]),lower.tail=FALSE),ci=as.list(b[i]+c(-1,1)*qnorm(.975)*se[i]))))
  if (!regression) {
    sens <- plogis(b[1]); fpr <- plogis(b[2]); spec <- 1-fpr
    # Symbolic differentiation in R keeps the oracle independent of JS's expanded variance formula.
    delta <- function(expr) {
      fun <- deriv(expr,c("a","b"),function(a,b) NULL)
      v <- fun(b[1],b[2]); g <- attr(v,"gradient")
      exp(as.numeric(v)+c(-1,1)*qnorm(.975)*sqrt(as.numeric(g %*% V %*% t(g))))
    }
    out$ratios <- list(lrPos=sens/fpr,lrNeg=(1-sens)/spec,dor=exp(b[1]-b[2]),
      lrPosCI=as.list(delta(expression(log((1/(1+exp(-a)))/(1/(1+exp(-b))))))),
      lrNegCI=as.list(delta(expression(log((1-1/(1+exp(-a)))/(1-1/(1+exp(-b))))))))
    out$summary <- list(sens=sens,spec=spec,fpr=fpr,
      sensCI=as.list(plogis(b[1]+c(-1,1)*qnorm(.975)*se[1])),
      specCI=as.list(1-plogis(b[2]+c(1,-1)*qnorm(.975)*se[2])))
    # mada's bivariate prediction region uses qchisq(.95,2), NOT a univariate t PI.
    out$regions <- lapply(list(confidence=V,prediction=V+Psi), function(C) {
      points <- ellipse::ellipse(C,centre=b,level=.95,npoints=101)
      list(covariance=matrix_rows(C),points=unname(lapply(seq_len(nrow(points)),function(i)
        list(fpr=plogis(points[i,2]),tpr=plogis(points[i,1])))))
    })
  }
  out
}
fits <- list()
add <- function(...) fits[[length(fits)+1]] <<- fit_one(...)
for (m in methods) {
  for (cc in c("all","single","none")) add("AuditC",audit,m,cc)
  add("smoking-type",smoking,m,regression=TRUE)
  add("homogeneous",homogeneous,m,"none")
  for (k in 1:3) add(paste0("k",k),ordinary[seq_len(k),],m,"none")
}
deeks <- lapply(list(ordinary=ordinary,zero=zero,k2=ordinary[1:2,]), function(d) {
  dd <- correct(d,"single")
  n1 <- dd$TP+dd$FN; n0 <- dd$FP+dd$TN
  ess <- 4*n1*n0/(n1+n0); x <- 1/sqrt(ess); y <- log(dd$TP*dd$TN/(dd$FP*dd$FN))
  fit <- lm(y~x,weights=ess); tab <- summary(fit)$coefficients
  list(rows=rows_of(d),df=fit$df.residual,values=if (fit$df.residual<=0) NULL else
    list(intercept=unname(coef(fit)[1]),slope=unname(coef(fit)[2]),t=tab[2,3],p=tab[2,4],df=fit$df.residual,
      x=as.list(x),y=as.list(y)))
})
spearman <- list()
for (id in c("ordinary","ties","zero","homogeneous","k1","k2")) {
  d <- switch(id,ordinary=ordinary,ties=ties,zero=zero,homogeneous=homogeneous,
              k1=ordinary[1,],k2=ordinary[1:2,])
  for (cc in c("all","single","none")) {
    if (id=="zero" && cc=="none") next # engine correctly refuses uncorrected zero cells
    dd <- correct(d,cc)
    rho <- suppressWarnings(cor(qlogis(dd$TP/(dd$TP+dd$FN)),qlogis(dd$FP/(dd$FP+dd$TN)),method="spearman"))
    spearman[[length(spearman)+1]] <- list(id=paste(id,cc,sep="/"),rows=rows_of(d),correction=cc,rho=rho)
  }
}
# Direct probability-form Bayes calculation is stable at prevalence 0 and 1.
fagan <- lapply(c(0,.01,.2,.5,1),function(pre) {
  sens <- .8; spec <- .9
  list(pre=pre,lrPos=sens/(1-spec),lrNeg=(1-sens)/spec,
    values=list(preProb=pre,postPos=pre*sens/(pre*sens+(1-pre)*(1-spec)),
      postNeg=pre*(1-sens)/(pre*(1-sens)+(1-pre)*spec)))
})
out <- list(provenance=list(generator=script,generator_md5=unname(tools::md5sum(script)),
  R=R.version.string,packages=lapply(c("mada","mvmeta","ellipse","jsonlite"),function(p)
    list(package=p,version=as.character(packageVersion(p)))),serialization="base R; 17 significant digits",
  fitting="mada::reitsma defaults; no optimizer tuning",tolerance=1e-6,
  regions="95% bivariate chi-square(2); covariance V or V+Psi; not a univariate prediction interval"),
  fits=fits,deeks=deeks,spearman=spearman,fagan=fagan)
writeLines(encode(out),output,useBytes=TRUE)
cat("Wrote",output,"with",length(fits),"fits; R",as.character(getRversion()),"mada",as.character(packageVersion("mada")),"\n")
