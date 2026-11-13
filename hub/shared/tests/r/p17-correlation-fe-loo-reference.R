# From wt/: Rscript hub/shared/tests/r/p17-correlation-fe-loo-reference.R
# Additive oracle: preserve the first reference, including its missing FE tau2.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
script <- "hub/shared/tests/r/p17-correlation-fe-loo-reference.R"
input_path <- "hub/shared/tests/r/p17-correlation-input.json"
original_path <- "hub/shared/tests/r/p17-correlation-reference.json"
output_path <- "hub/shared/tests/r/p17-correlation-fe-loo-reference.json"
if (file.exists(output_path)) stop("Refusing to overwrite the recorded FE reference")
input <- fromJSON(input_path, simplifyVector=FALSE)
original <- fromJSON(original_path, simplifyVector=FALSE)
ctrl <- original$provenance$control

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

records <- lapply(Filter(function(x) isTRUE(x$loo), input$cases), function(case) {
  es <- escalc(measure="ZCOR", ri=unlist(case$r), ni=unlist(case$n))
  k <- nrow(es)
  fit <- rma(yi=es$yi, vi=es$vi, method="FE", test="z", control=ctrl)
  l <- leave1out(fit)
  # Contrast the two package APIs explicitly. Do not substitute a JS expectation.
  dl <- leave1out(rma(yi=es$yi, vi=es$vi, method="DL", test="z", control=ctrl))
  rows <- lapply(seq_len(k), function(i) {
    refit <- rma(yi=es$yi[-i], vi=es$vi[-i], method="FE", test="z", control=ctrl)
    stopifnot(length(refit$tau2) == 1L, is.finite(refit$tau2))
    mu <- as.numeric(coef(refit))
    # The direct refit must reproduce every numeric field that leave1out exposes.
    stopifnot(isTRUE(all.equal(
      c(mu, refit$se, refit$QE, refit$ci.lb, refit$ci.ub),
      c(l$estimate[i], l$se[i], l$Q[i], l$ci.lb[i], l$ci.ub[i]),
      tolerance=1e-12, check.attributes=FALSE)))
    list(omitted_index=i, mu_z=mu, se_z=refit$se, tau2_z=refit$tau2, Q=refit$QE,
      I2=NULL, ciLo=refit$ci.lb, ciHi=refit$ci.ub, piLo=NULL, piHi=NULL,
      r=tanh(mu), r_lo=tanh(refit$ci.lb), r_hi=tanh(refit$ci.ub),
      r_pi_lo=NULL, r_pi_hi=NULL, delta_r=tanh(mu)-tanh(as.numeric(coef(fit))))
  })
  cat(case$id, ": FE leave1out tau2 field =", "tau2" %in% names(l),
      "; length =", length(l$tau2), "; direct-refit tau2 =",
      paste(vapply(rows, function(x) x$tau2_z, numeric(1)), collapse=","), "\n")
  cat("DL control: leave1out tau2 length =", length(dl$tau2), "\n")
  list(id=case$id, method="FE", test="z", k=k, rows=rows,
    package_contract=list(fe_tau2_present="tau2" %in% names(l),
      fe_tau2_length=length(l$tau2), dl_tau2_present="tau2" %in% names(dl),
      dl_tau2_length=length(dl$tau2), dl_tau2=as.list(as.numeric(dl$tau2))))
})
reference <- list(schema="p17-correlation-fe-loo-reference-v1",
  provenance=list(R=R.version.string,
    packages=lapply(c("metafor","metadat","Matrix","nlme","numDeriv","jsonlite"),
      function(p) list(package=p,version=as.character(packageVersion(p)))),
    script=script, script_md5=unname(tools::md5sum(script)),
    input=input_path, input_md5=unname(tools::md5sum(input_path)),
    original_reference=original_path, original_reference_md5=unname(tools::md5sum(original_path)),
    serialization="base R; 17 significant digits", control=ctrl,
    oracle="metafor::escalc(ZCOR), rma(FE,z) for each omission; cross-check leave1out",
    policy="FE has no PI; app withholds FE LOO I2"), cases=records)
writeLines(encode(reference), output_path, useBytes=TRUE)
cat("Recorded", length(records), "FE case(s) in", output_path, "\n")
cat(R.version.string, "; metafor", as.character(packageVersion("metafor")), "\n")
