# Additional sampled reference; never overwrites the original 252-fit fixture.
suppressPackageStartupMessages({ library(metafor); library(jsonlite) })
script <- sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value=TRUE))
here <- dirname(normalizePath(script))
input_path <- file.path(here,"../fixtures/gosh-r-parity-duplicates-input.json")
draws_path <- file.path(here,"../fixtures/gosh-r-parity-duplicates-draws.json")
output_path <- file.path(here,"../fixtures/gosh-r-parity-duplicates-reference.json")
stopifnot(file.exists(input_path),file.exists(draws_path))
input <- fromJSON(input_path,simplifyVector=FALSE)
draws <- fromJSON(draws_path,simplifyVector=FALSE)
num <- function(x) unname(as.numeric(x))
warnings <- character()
capture <- function(expr) withCallingHandlers(expr,warning=function(w) {
  warnings <<- unique(c(warnings,conditionMessage(w)))
  invokeRestart("muffleWarning")
})
fits <- list()
for (cfg in input$cases) for (model in unlist(input$models)) {
  selected <- Filter(function(x) x$id==cfg$id && x$model==model,draws)
  stopifnot(length(selected)==1)
  members <- lapply(selected[[1]]$members,unlist)
  stopifnot(length(members)==cfg$draws)
  stopifnot(anyDuplicated(vapply(members,function(ix) paste(sort(ix),collapse=","),character(1)))>0)
  y <- unlist(cfg$te); se <- unlist(cfg$se)
  stopifnot(all(vapply(members,function(ix) length(ix)>0 && !anyDuplicated(ix) && all(ix>=1 & ix<=length(y)),logical(1))))
  points <- lapply(members,function(ix) {
    r <- capture(rma.uni(yi=y[ix],sei=se[ix],method=model))
    list(members=as.list(ix),k=length(ix),mu=num(coef(r)),se=num(r$se),Q=num(r$QE),I2=num(r$I2),tau2=num(r$tau2))
  })
  values <- function(q) vapply(points,function(p) p[[q]],numeric(1))
  est <- values("mu"); i2 <- values("I2")
  stopifnot(all(is.finite(c(est,i2,values("Q"),values("tau2"),values("se")))))
  summary <- list(n_subsets=length(points),median_est=median(est),median_i2=median(i2),
    min_est=min(est),max_est=max(est),q25_est=num(quantile(est,.25,type=7)),q75_est=num(quantile(est,.75,type=7)))
  fits[[length(fits)+1]] <- list(id=cfg$id,model=model,sampled=TRUE,points=points,summary=summary)
}
reference <- list(schema="gosh-r-parity-reference-v1",provenance=list(
  R=R.version.string,metafor=as.character(packageVersion("metafor")),jsonlite=as.character(packageVersion("jsonlite")),
  metadat=as.character(packageVersion("metadat")),input_md5=unname(tools::md5sum(input_path)),
  draws_md5=unname(tools::md5sum(draws_path)),script_md5=unname(tools::md5sum(script)),
  oracle="metafor::rma.uni on every captured membership, including repeated draws",
  serialization="jsonlite digits=NA",warnings=as.list(warnings)),input=input,fits=fits)
writeLines(toJSON(reference,auto_unbox=TRUE,digits=NA,pretty=TRUE,na="null"),output_path,useBytes=TRUE)
cat(R.version.string,"metafor",as.character(packageVersion("metafor")),"jsonlite",as.character(packageVersion("jsonlite")),"\n")
cat("Wrote",length(fits),"additional FE/DL runs and",sum(vapply(fits,function(f)length(f$points),integer(1))),"subset fits.\n")
