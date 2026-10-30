# Run from wt: Rscript hub/shared/tests/r/gosh-reference.R
# Inputs and this script are fingerprinted; existing published corpora are untouched.
# Every numeric reference comes from this native R run, not the JavaScript engine.
suppressPackageStartupMessages({ library(metafor); library(jsonlite) })
script <- sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value=TRUE))
here <- dirname(normalizePath(script))
input_path <- file.path(here, "../fixtures/gosh-r-parity-input.json")
draws_path <- file.path(here, "../fixtures/gosh-r-parity-draws.json")
output_path <- file.path(here, "../fixtures/gosh-r-parity-reference.json")
# jsonlite otherwise treats a missing filename as literal JSON, hiding the cause.
for (path in c(input_path, draws_path)) {
  if (!file.exists(path)) stop("Missing reference input: ", path,
    ". Run node hub/shared/tests/r/gosh-capture-draws.mjs first.")
}
input <- fromJSON(input_path, simplifyVector=FALSE)
draws <- fromJSON(draws_path, simplifyVector=FALSE)
warnings <- character()
capture <- function(expr) withCallingHandlers(expr, warning=function(w) {
  warnings <<- unique(c(warnings, conditionMessage(w)))
  invokeRestart("muffleWarning")
})
num <- function(x) unname(as.numeric(x))
fits <- list()
for (cfg in input$cases) for (model in unlist(input$models)) {
  message("Reference: ", cfg$id, " / ", model)
  y <- unlist(cfg$te); se <- unlist(cfg$se); k <- length(y)
  sampled <- !is.null(cfg$draws)
  if (sampled) {
    selected <- Filter(function(x) x$id == cfg$id && x$model == model, draws)
    stopifnot(length(selected) == 1)
    members <- lapply(selected[[1]]$members, unlist)
    stopifnot(length(members) == cfg$draws)
  } else {
    members <- lapply(seq_len(2^k - 1), function(mask) which(as.logical(intToBits(mask)[seq_len(k)])))
  }
  stopifnot(all(vapply(members, function(ix) length(ix) > 0 && !anyDuplicated(ix) && all(ix >= 1 & ix <= k), logical(1))))
  # rma supplies SE as well as estimate/Q/I2/tau2. For k=1 metafor fixes tau2=0.
  points <- lapply(members, function(ix) {
    r <- capture(rma.uni(yi=y[ix], sei=se[ix], method=model))
    list(members=as.list(ix), k=length(ix), mu=num(coef(r)), se=num(r$se),
         Q=num(r$QE), I2=num(r$I2), tau2=num(r$tau2))
  })
  # Independently cross-check rma fits against canonical gosh for complete small sets.
  # gosh requires a multi-study parent. Singleton input is checked directly by rma.
  if (!sampled && k >= 2) {
    g <- capture(gosh(rma.uni(yi=y, sei=se, method=model), subsets=2^k-1, progbar=FALSE, parallel="no"))
    masks <- drop(g$incl %*% 2^(0:(k-1)))
    stopifnot(nrow(g$res) == 2^k-1, !anyDuplicated(masks), all(g$fit))
    for (i in seq_along(points)) {
      row <- g$res[match(i, masks), ]
      p <- points[[i]]
      # This is an oracle consistency guard, not a replacement/relaxation of app tolerance.
      for (q in c("mu", "Q", "I2")) {
        expected <- row[[switch(q, mu="estimate", Q="QE", I2="I2")]]
        stopifnot(is.finite(expected), abs(p[[q]]-expected)/max(1,abs(expected)) <= 1e-9)
      }
      if (model == "DL") stopifnot(abs(p$tau2-row$tau2)/max(1,abs(row$tau2)) <= 1e-9)
    }
  }
  values <- function(q) vapply(points, function(p) p[[q]], numeric(1))
  est <- values("mu"); i2 <- values("I2"); Q <- values("Q"); tau <- values("tau2")
  stopifnot(all(is.finite(c(est,i2,Q,tau,values("se")))))
  summary <- list(n_subsets=length(points), median_est=median(est), median_i2=median(i2),
    min_est=min(est), max_est=max(est), q25_est=num(quantile(est,.25,type=7)), q75_est=num(quantile(est,.75,type=7)),
    mean_est=mean(est), mean_i2=mean(i2), min_i2=min(i2), max_i2=max(i2),
    mean_q=mean(Q), min_q=min(Q), max_q=max(Q), zero_i2=sum(i2 == 0),
    q25_i2=num(quantile(i2,.25,type=7)), q75_i2=num(quantile(i2,.75,type=7)))
  if (model == "DL") summary <- c(summary, list(mean_tau2=mean(tau), min_tau2=min(tau), max_tau2=max(tau), tau2_positive=sum(tau > 0)))
  fits[[length(fits)+1]] <- list(id=cfg$id, model=model, sampled=sampled, points=points, summary=summary)
}
reference <- list(schema="gosh-r-parity-reference-v1", provenance=list(
  R=R.version.string, metafor=as.character(packageVersion("metafor")),
  jsonlite=as.character(packageVersion("jsonlite")), metadat=as.character(packageVersion("metadat")),
  input_md5=unname(tools::md5sum(input_path)), draws_md5=unname(tools::md5sum(draws_path)),
  script_md5=unname(tools::md5sum(script)),
  oracle="metafor::rma.uni on every membership; metafor::gosh cross-check for complete k>=2 cases",
  serialization="jsonlite digits=NA", warnings=as.list(warnings)), input=input, fits=fits)
writeLines(toJSON(reference, auto_unbox=TRUE, digits=NA, pretty=TRUE, na="null"), output_path, useBytes=TRUE)
cat(R.version.string, "metafor", as.character(packageVersion("metafor")), "jsonlite", as.character(packageVersion("jsonlite")), "\n")
cat("Wrote", length(fits), "FE/DL runs and", sum(vapply(fits,function(f)length(f$points),integer(1))), "subset fits.\n")
if (length(warnings)) cat("Recorded R warnings:", paste(warnings,collapse=" | "), "\n")
