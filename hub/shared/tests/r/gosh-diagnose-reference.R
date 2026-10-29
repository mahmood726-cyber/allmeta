# Diagnostic companion only: retain the original R fixture byte-for-byte.
# 17-digit strings expose R doubles independently of jsonlite numeric formatting.
suppressPackageStartupMessages({ library(metafor); library(jsonlite) })
script <- sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value=TRUE))
here <- dirname(normalizePath(script))
reference_path <- file.path(here,"../fixtures/gosh-r-parity-reference.json")
output_path <- file.path(here,"../fixtures/gosh-r-parity-numeric-audit.json")
reference <- fromJSON(reference_path,simplifyVector=FALSE)
records <- list()
for (id in c("heterogeneous","separated-cluster")) for (model in c("FE","DL")) {
  cfg <- Filter(function(x) x$id==id,reference$input$cases)[[1]]
  old <- Filter(function(x) x$id==id && x$model==model,reference$fits)[[1]]
  y <- unlist(cfg$te); se <- unlist(cfg$se)
  for (point in old$points) {
    ix <- unlist(point$members)
    if (id=="heterogeneous" && !identical(as.integer(ix),c(2L,4L))) next
    r <- rma.uni(yi=y[ix],sei=se[ix],method=model)
    actual <- c(mu=as.numeric(coef(r)),se=as.numeric(r$se),Q=as.numeric(r$QE),I2=as.numeric(r$I2),tau2=as.numeric(r$tau2))
    direct <- as.list(setNames(sprintf("%.17g",actual),names(actual)))
    stored <- vapply(names(actual),function(q) point[[q]],numeric(1))
    stored17 <- as.list(setNames(sprintf("%.17g",stored),names(actual)))
    records[[length(records)+1]] <- list(id=id,model=model,members=point$members,
      direct_R_17=direct,stored_R_17=stored17)
    for (q in names(actual)) if (abs(actual[[q]]-stored[[q]])>1e-6 || (id=="heterogeneous" && q %in% c("Q","I2","tau2"))) {
      cat(id,model,paste(ix,collapse=","),q,"direct=",direct[[q]],"stored=",stored17[[q]],"\n")
    }
  }
}
audit <- list(schema="gosh-r-parity-numeric-audit-v1",provenance=list(R=R.version.string,
  metafor=as.character(packageVersion("metafor")),jsonlite=as.character(packageVersion("jsonlite")),
  script_md5=unname(tools::md5sum(script)),original_reference_md5=unname(tools::md5sum(reference_path)),
  purpose="Diagnostic only: original expectations and absolute 1e-6 assertions are unchanged"),records=records)
writeLines(toJSON(audit,auto_unbox=TRUE,pretty=TRUE),output_path,useBytes=TRUE)
cat("Wrote",length(records),"diagnostic records; the original reference was not rewritten.\n")
