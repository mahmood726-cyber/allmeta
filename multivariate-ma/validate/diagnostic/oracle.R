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
