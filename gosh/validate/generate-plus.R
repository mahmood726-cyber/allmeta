# Run from the repository root with R_LIBS_USER pointing to the pinned library.
.libPaths(c(strsplit(Sys.getenv("R_LIBS_USER"),.Platform$path.sep,fixed=TRUE)[[1]], .libPaths()))
stopifnot(as.character(packageVersion("metafor")) == "5.2.1")
stopifnot(as.character(getRversion()) == "4.6.0")
library(jsonlite)
root <- "gosh/validate"
pins <- fromJSON(file.path(root,"MANIFEST.json"),simplifyVector=FALSE)$files
for(p in pins) stopifnot(digest::digest(file.path("gosh",p$path),algo="sha256",file=TRUE,serialize=FALSE)==p$sha256)
src <- fromJSON(file.path(root, "corpus/corpus.json"), simplifyVector=FALSE)
refs <- fromJSON(file.path(root, "corpus/reference.json"), simplifyVector=FALSE)
names(refs) <- vapply(refs, function(x) x$key, "")
corpus <- Filter(function(x) x$k >= 3 && x$k <= 100, src)
out <- list()
for (c in corpus) for (model in c("FE", "DL")) {
  key <- paste(c$id, model, sep="::")
  old <- refs[[key]]
  stopifnot(!is.null(old), !old$refused)
  members <- lapply(old$points, function(p) as.integer(unlist(p$members)))
  keys <- vapply(members, function(m) paste(sort(m), collapse=","), "")
  if (c$k <= 15) {
    fit <- metafor::rma(unlist(c$te), unlist(c$se)^2, method=model)
    sav <- metafor::gosh(fit, progbar=FALSE)
    rk <- apply(sav$incl, 1, function(m) paste(which(m), collapse=","))
    ix <- match(keys, rk)
    stopifnot(!anyNA(ix), !anyDuplicated(keys), length(ix)==nrow(sav$res))
    res <- sav$res[ix, , drop=FALSE]
    incl <- sav$incl[ix, , drop=FALSE]
  } else {
    # These are archived R fits on the app's exact draws, including duplicates.
    # No new subset fits or new sampling are performed. gosh's H2 is QE/(k-1).
    res <- data.frame(estimate=vapply(old$points,function(p)p$mu,0),
      I2=vapply(old$points,function(p)p$I2,0), QE=vapply(old$points,function(p)p$Q,0),
      k=vapply(old$points,function(p)p$k,0), tau2=vapply(old$points,function(p)p$tau2,0))
    res$H2 <- res$QE/(res$k-1)
    res$tau <- sqrt(res$tau2)
    incl <- t(vapply(members, function(m) seq_len(c$k) %in% m, logical(c$k)))
  }
  stopifnot(all(is.finite(as.matrix(res))))
  rows <- lapply(seq_len(c$k), function(i) {
    with <- incl[,i]; without <- !with
    stopifnot(any(with),any(without))
    a <- c(mean(res$estimate[with]),median(res$estimate[with]),mean(res$I2[with]))
    b <- c(mean(res$estimate[without]),median(res$estimate[without]),mean(res$I2[without]))
    list(study=i, with_n=sum(with), without_n=sum(without),
      with_mean=a[1], without_mean=b[1], diff_mean=a[1]-b[1],
      with_median=a[2], without_median=b[2], diff_median=a[2]-b[2],
      with_i2=a[3], without_i2=b[3], diff_i2=a[3]-b[3])
  })
  points <- lapply(seq_along(members), function(i) list(members=I(members[[i]]),
    mu=res$estimate[i], I2=res$I2[i], H2=res$H2[i], Q=res$QE[i],
    tau2=res$tau2[i], tau=res$tau[i]))
  out[[length(out)+1]] <- list(key=key, sampled=c$k>15, rows=rows, points=points)
  cat(key, length(points), "points\n")
}
target <- Sys.getenv("GOSH_PLUS_OUTPUT_DIR",file.path(root,"plus"))
dir.create(target,showWarnings=FALSE,recursive=TRUE)
write_json(corpus,file.path(target,"corpus.json"),auto_unbox=TRUE,digits=NA)
con <- file(file.path(target,"reference.json"), "wb")
cat("[", file=con)
for(i in seq_along(out)) {
  if(i>1) cat(",",file=con)
  cat(toJSON(out[[i]],auto_unbox=TRUE,digits=NA),file=con)
  flush(con)
  cat("Wrote reference", i, "of", length(out), "\n")
}
cat("]\n",file=con)
close(con)
