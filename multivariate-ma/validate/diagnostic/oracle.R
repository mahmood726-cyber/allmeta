# Run from this directory. Reuse the pinned corpus's independent R estimator,
# evaluating only definitions, never its corpus execution.
options(warn=1)
suppressPackageStartupMessages({library(mvmeta); library(metafor); library(jsonlite)})
for (ex in parse("../generate-plus.R")) {
  if (is.call(ex) && identical(ex[[1]], as.name("<-")) && identical(ex[[2]], as.name("corpus"))) break
  eval(ex)
}
mat <- function(x) do.call(rbind, lapply(x, unlist))
read <- function(p) fromJSON(p, simplifyVector=FALSE)
write <- function(x,p) writeLines(json17(x),p)
setup <- function(studies) {
  Y <<- do.call(rbind,lapply(studies,function(s) unlist(s$y)))
  S <<- lapply(studies,function(s) mat(s$S)); k <<- nrow(Y)
  dat <<- data.frame(yi=c(t(Y)), outcome=factor(rep(1:2,k)), study=rep(seq_len(k),each=2))
  Xl <<- rep(list(diag(2)),k); yl <<- lapply(seq_len(k),function(i) Y[i,]); nal <<- rep(list(c(FALSE,FALSE)),k)
}
atG <- function(G) remlfn(numeric(), Xl, yl, S, nal, 2, k, 1, 2*k, "fixed", list(Psifix=G)) + log(k)
capture <- function(fun) {
  warns <- character(); printed <- character()
  z <- tryCatch(withCallingHandlers({
    printed <- capture.output({ z <- fun(); print(z) }); z
  },warning=function(w){warns<<-c(warns,conditionMessage(w));invokeRestart("muffleWarning")}),error=function(e)e)
  list(value=z, warnings=as.list(warns), printed=as.list(printed),
       error=if(inherits(z,"error")) conditionMessage(z) else NULL)
}
metadata <- list(R=R.version.string, mvmeta=as.character(packageVersion("mvmeta")),metafor=as.character(packageVersion("metafor")),
                 libPaths=as.list(.libPaths()), defaults="No optimizer control or starting covariance supplied.")
# 2026-10-21 addendum: exact R verdict per fit (Rscript --vanilla oracle.R verdicts [mutation-controls]).
# Runs only this stage, then stops; the historical stages below are not re-run.
# "verdicts": 69 hard fits + 30 controls at x1, x10, x0.1 -> oracle-verdicts.json (297 fits).
# "verdicts mutation-controls": the added mutation controls at x1 -> oracle-mutation-controls.json.
# Uses R's own multistart fits, never the JavaScript verdict or candidates.
if (identical(commandArgs(trailingOnly=TRUE)[1], "verdicts")) {
  sdTol <- 1e-4; rhoTol <- 1e-4; llTol <- 1e-8; rhoBoundary <- 1e-6
  distinct <- function(a, b) {
    sa <- sqrt(pmax(0, diag(a))); sb <- sqrt(pmax(0, diag(b)))
    if (any(abs(sa - sb) > sdTol * pmax(sa, sb))) return(TRUE)
    if (all(c(sa, sb) > 0) && abs(a[1,2]/prod(sa) - b[1,2]/prod(sb)) > rhoTol) return(TRUE)
    FALSE
  }
  mutationStage <- identical(commandArgs(trailingOnly=TRUE)[2], "mutation-controls")
  population <- if (mutationStage) lapply(read("mutation-controls.json"), function(f) list(id=f$id, set="mutation-control", studies=f$studies)) else
                c(lapply(read("hard.json"), function(f) list(id=f$id, set="hard", studies=f$studies)),
                  lapply(read("controls.json")$selected, function(f) list(id=f$id, set="control", studies=f$studies)))
  scales <- if (mutationStage) 1 else c(1, 10, 0.1)
  outFile <- if (mutationStage) "oracle-mutation-controls.json" else "oracle-verdicts.json"
  stopifnot(length(population) == if (mutationStage) 4 else 99)
  mvctl <- MV_CONTROL
  mfctl <- list(NULL,
    list(rel.tol=1e-12,x.tol=1e-12,iter.max=10000,eval.max=20000),
    list(optimizer="optim",optmethod="BFGS",reltol=1e-12,maxit=10000),
    list(rel.tol=1e-10,x.tol=1e-10,iter.max=10000,eval.max=20000))
  out <- list(); t0 <- Sys.time()
  for (c in scales) for (f in population) {
    studies <- lapply(f$studies, function(s) list(y=lapply(s$y, function(v) v*c), S=lapply(s$S, function(r) lapply(r, function(v) v*c*c))))
    setup(studies)
    ref <- fit_mv(Y, S)
    cand <- list(list(source="fit_mv refined", G=mat(ref$G), logLik=ref$logLik))
    start <- diag(pmax(apply(Y, 2, var) - colMeans(t(vapply(S, diag, numeric(2)))), 1e-4))
    corr <- function(r) { x <- start; x[1,2] <- x[2,1] <- r*sqrt(start[1,1]*start[2,2]); x }
    starts <- list(NULL, start, start*.1, start*10, corr(0.9), corr(-0.9))
    names(starts) <- c("mvmeta default", "mvmeta moment", "mvmeta moment x0.1", "mvmeta moment x10", "mvmeta rho 0.9", "mvmeta rho -0.9")
    for (nm in names(starts)) {
      ctl <- mvctl; ctl$initPsi <- starts[[nm]]
      z <- tryCatch(suppressWarnings(mvmeta(Y~1, S=S, method="reml", bscov="unstr", control=ctl)), error=function(e) NULL)
      if (!is.null(z) && isTRUE(z$converged)) cand[[length(cand)+1]] <- list(source=nm, G=unname(z$Psi), logLik=as.numeric(logLik(z))+log(k))
    }
    for (i in seq_along(mfctl)) {
      z <- tryCatch(suppressWarnings(if (is.null(mfctl[[i]])) rma.mv(yi,V=bldiag(S),mods=~outcome-1,random=~outcome|study,struct="UN",method="REML",data=dat)
             else rma.mv(yi,V=bldiag(S),mods=~outcome-1,random=~outcome|study,struct="UN",method="REML",data=dat,control=mfctl[[i]])), error=function(e) NULL)
      if (!is.null(z)) cand[[length(cand)+1]] <- list(source=paste("metafor control", i), G=unname(z$G), logLik=as.numeric(logLik(z)))
    }
    G <- mat(ref$G); best <- max(vapply(cand, function(x) x$logLik, 0))
    threshold <- 1e-10*pmax(1, Reduce("+", lapply(S, diag))/k)
    zero <- which(diag(G) <= threshold) - 1
    rho <- if (all(diag(G) > 0)) max(-1, min(1, G[1,2]/sqrt(G[1,1]*G[2,2]))) else NULL
    boundary <- length(zero) > 0 || (!is.null(rho) && abs(rho) >= 1 - rhoBoundary)
    near <- Filter(function(x) is.finite(x$logLik) && abs(x$logLik - best) <= llTol, cand)
    clusters <- list()
    for (x in near) if (!any(vapply(clusters, function(d) !distinct(x$G, d$G), TRUE))) clusters[[length(clusters)+1]] <- x
    verdict <- if (boundary) "boundary maximum" else if (length(clusters) > 1) "multiple near-equal optima" else "interior maximum"
    id <- if (mutationStage) f$id else paste0(f$id, "@x", c)
    out[[length(out)+1]] <- list(id=id, base=f$id, set=f$set, scale=c, verdict=verdict, boundary=boundary,
      zeroVariances=as.list(zero), rho=rho, bestLogLik=best, nearBest=length(near), distinctOptima=length(clusters),
      candidates=lapply(cand, function(x) list(source=x$source, logLik=x$logLik, G=rows_of(x$G), nearBest=abs(x$logLik-best)<=llTol)))
    cat("VERDICT", length(out), id, verdict, "near", length(near), "clusters", length(clusters), "\n"); flush.console()
  }
  n <- length(population) * length(scales)
  stopifnot(length(out) == n, length(unique(vapply(out, function(x) x$id, ""))) == n)
  write(list(metadata=c(metadata, list(stage="verdicts", seconds=as.numeric(difftime(Sys.time(), t0, units="secs")),
    tolerances=list(logLik=llTol, distinctSDRelative=sdTol, distinctCorrelation=rhoTol, correlationBoundary=rhoBoundary, zeroVariance="1e-10*max(1, mean S_ii)"))),
    fits=out), outFile)
  tab <- table(vapply(out, function(x) paste(x$set, x$verdict), ""))
  for (n in names(tab)) cat("R VERDICTS", n, tab[[n]], "\n")
  cat("R ORACLE", length(out), "fits\n")
  quit(save="no", status=0)
}
hard <- read("hard.json"); defaults <- list(); done <- integer()
if(file.exists("default-warnings.json")) {
  cached <- read("default-warnings.json")
  if(length(cached$fits)==69 && length(cached$jobs)==32) {
    defaults <- cached$jobs; done <- vapply(defaults,function(z) z$job,0)
  }
}
for (f in hard) {
  if (f$job %in% done) next
  setup(f$studies)
  mv <- capture(function() mvmeta(Y~1,S=S,method="reml",bscov="unstr"))
  mf <- capture(function() rma.mv(yi,V=bldiag(S),mods=~outcome-1,random=~outcome|study,struct="UN",method="REML",data=dat))
  record <- function(z,type) {
    list(warnings=z$warnings, printed=z$printed, error=z$error,
         converged=if(is.null(z$error)) if(type=="mvmeta") isTRUE(z$value$converged) else TRUE else FALSE,
         logLik=if(is.null(z$error)) as.numeric(logLik(z$value))+if(type=="mvmeta")log(k) else 0 else NULL)
  }
  defaults[[length(defaults)+1]] <- list(job=f$job, mvmeta=record(mv,"mvmeta"),metafor=record(mf,"metafor"))
  done <- c(done,f$job); cat("DEFAULT", f$job, "mvmeta warnings",length(mv$warnings),"metafor warnings",length(mf$warnings),"\n")
  write(list(metadata=metadata,jobs=defaults),"default-warnings.json")
}
# Full fit-level coverage, including duplicated numerical inputs.
expanded <- lapply(hard,function(f) {
  z <- defaults[[match(f$job,vapply(defaults,function(z)z$job,0))]]
  c(list(id=f$id,classification=f$classification),z)
})
write(list(metadata=metadata,jobs=defaults,fits=expanded),"default-warnings.json")

candidates <- read("control-candidates.json"); selected <- list(); audit <- list()
for (f in candidates) {
  setup(f$studies)
  z <- capture(function() fit_mv(Y,S))
  entry <- list(id=f$id, selected=FALSE, warnings=z$warnings, error=z$error)
  if(is.null(z$error) && identical(z$value$status,"ok")) {
    ref <- z$value; G <- mat(ref$G)
    threshold <- 1e-10*pmax(1,Reduce("+",lapply(S,diag))/k)
    boundary <- any(diag(G)<=threshold) || abs(ref$rho)>=1-1e-6
    entry$boundary <- boundary
    if(!boundary) {
      base <- atG(G)
      profile <- lapply(1:2,function(j) {
        v <- G[j,j]; h <- 1e-4*max(1,v)
        points <- lapply(c(max(0,v-h),v+h),function(fixed) {
          other <- 3-j
          objective <- function(x) {
            gg <- matrix(0,2,2); gg[j,j] <- fixed; gg[other,other] <- x[1]^2
            gg[1,2] <- gg[2,1] <- sqrt(fixed)*abs(x[1])*max(-1,min(1,x[2]))
            -atG(gg)
          }
          fits <- lapply(c(ref$rho,-1,1),function(r) optim(c(sqrt(G[other,other]),r),objective,method="Nelder-Mead",
                                       control=list(maxit=3000,reltol=1e-13,parscale=c(max(1,sqrt(G[other,other])),1))))
          best <- fits[[which.min(vapply(fits,function(x)x$value,0))]]
          list(variance=fixed,deltaLogLik=-best$value-base,converged=best$convergence==0)
        })
        list(component=j-1, offset=h, points=points, flat=all(vapply(points,function(p)abs(p$deltaLogLik)<1e-6,TRUE)))
      })
      entry$profiles <- profile
      flat <- any(vapply(profile,function(p)p$flat,TRUE))
      entry$flat <- flat
      if(!flat) {
        # Observed information on the free covariance entries, independent of JS.
        fn <- function(x) {
          gg <- matrix(c(x[1],x[2],x[2],x[3]),2)
          if(min(eigen(gg,symmetric=TRUE,only.values=TRUE)$values)<=0) return(1e100)
          -atG(gg)
        }
        H <- optimHess(c(G[1,1],G[1,2],G[2,2]),fn,control=list(ndeps=rep(1e-5,3)))
        entry$informationEigenvalues <- as.list(eigen(H,symmetric=TRUE,only.values=TRUE)$values)
        secondAttempts <- list()
        controls <- list(
          list(rel.tol=1e-12,x.tol=1e-12,iter.max=10000,eval.max=20000),
          list(optimizer="optim",optmethod="BFGS",reltol=1e-12,maxit=10000),
          list(rel.tol=1e-10,x.tol=1e-10,iter.max=10000,eval.max=20000))
        for(ctl in controls) {
          second <- capture(function() rma.mv(yi,V=bldiag(S),mods=~outcome-1,random=~outcome|study,struct="UN",method="REML",data=dat,control=ctl))
          ll <- if(is.null(second$error)) as.numeric(logLik(second$value)) else NULL
          secondAttempts[[length(secondAttempts)+1]] <- list(control=ctl,warnings=second$warnings,error=second$error,logLik=ll)
          if(!is.null(ll) && abs(ll-ref$logLik)<=1e-6) break
        }
        entry$metaforAttempts <- secondAttempts
        entry$metaforWarnings <- second$warnings; entry$metaforError <- second$error
        if(is.null(second$error)) {
          entry$metaforLogLik <- as.numeric(logLik(second$value))
          entry$likelihoodGap <- abs(entry$metaforLogLik-ref$logLik)
          if(min(unlist(entry$informationEigenvalues))>0 && entry$likelihoodGap<=1e-6 &&
             all(vapply(profile,function(p) all(vapply(p$points,function(q)q$converged,TRUE)),TRUE))) {
            entry$selected <- TRUE
            selected[[length(selected)+1]] <- c(f,list(expected=list("unique interior maximum"),classification="control",oracle=ref,evidence=entry))
          }
        }
      }
    }
  }
  audit[[length(audit)+1]] <- entry
  write(list(metadata=metadata,attempted=audit,selected=selected),"controls.json")
  cat("CONTROL",length(audit),"selected",length(selected),f$id,"\n");flush.console()
  if(length(selected)==30) break
}
stopifnot(length(selected)==30)
cat("R CONTROLS",length(selected),"/ 30; attempted",length(audit),"\n")
