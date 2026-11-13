# Run from wt/: Rscript hub/shared/tests/r/p20-reference.R
# Synthetic single-estimate cases. Never use JS results as the oracle.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
folder <- "hub/shared/tests/r"
input_path <- file.path(folder, "p20-input.json")
input <- read_json(input_path, simplifyVector=FALSE)

provenance <- function(script, packages) list(
  R=R.version.string,
  packages=setNames(lapply(packages, function(p) as.character(packageVersion(p))), packages),
  script=script,
  script_md5=unname(tools::md5sum(file.path(folder, script))),
  input="p20-input.json", input_md5=unname(tools::md5sum(input_path)),
  tolerance=1e-6, ci="95% normal/Wald; ratio SE on log scale",
  disclosure="Synthetic software tests; no pooled fit, tau2 or prediction interval")

record <- function(value, name) {
  path <- file.path(folder, name)
  encoded <- toJSON(value, auto_unbox=TRUE, pretty=TRUE, digits=NA, null="null", na="null")
  if (file.exists(path)) {
    # Replays verify the existing reference, never silently replace it.
    stopifnot(identical(paste(readLines(path, warn=FALSE), collapse="\n"), as.character(encoded)))
    cat("Verified unchanged", name, "\n")
  } else {
    writeLines(encoded, path, useBytes=TRUE)
    cat("Recorded", name, "\n")
  }
}

summary_smd <- function(x, n1, n2, d, pooledSd=NULL) {
  s <- summary(x, level=95)
  list(d=as.numeric(d), g=as.numeric(x$yi), vi=as.numeric(x$vi),
       se=as.numeric(s$sei), J=cmicalc(n1+n2-2, method="exact"),
       df=n1+n2-2, pooledSd=pooledSd,
       lo=as.numeric(s$ci.lb), hi=as.numeric(s$ci.ub))
}
means <- lapply(input$means, function(c) {
  args <- list(measure="SMD", m1i=c$m1, sd1i=c$sd1, n1i=c$n1,
               m2i=c$m2, sd2i=c$sd2, n2i=c$n2, vtype="LS")
  g <- do.call(escalc, c(args, list(correct=TRUE)))
  d <- do.call(escalc, c(args, list(correct=FALSE)))
  sd <- sqrt(((c$n1-1)*c$sd1^2 + (c$n2-1)*c$sd2^2)/(c$n1+c$n2-2))
  list(id=c$id, input=c, expected=summary_smd(g, c$n1, c$n2, d$yi, sd))
})
stat_case <- function(c, is_f=FALSE) {
  # F has numerator df=1; its direction is supplied separately by the user.
  ti <- if (is_f) c$sign * sqrt(c$f) else c$t
  args <- list(measure="SMD", ti=ti, n1i=c$n1, n2i=c$n2, vtype="LS")
  g <- do.call(escalc, c(args, list(correct=TRUE)))
  d <- do.call(escalc, c(args, list(correct=FALSE)))
  list(id=c$id, input=c, expected=summary_smd(g, c$n1, c$n2, d$yi))
}

wald <- lapply(input$wald, function(c) {
  ratio <- c$type %in% c("OR", "RR", "HR", "IRR")
  transform <- if (ratio) log else identity
  if (!is.null(c$p)) {
    ref <- conv.wald(out=c$est, pval=c$p, transf=transform)
    supplied <- list(lo=NULL, hi=NULL, p=c$p)
  } else {
    ci <- transform(c$est) + c(-1,1)*qnorm(.975)*c$se
    if (ratio) ci <- exp(ci)
    ref <- conv.wald(out=c$est, ci.lb=ci[1], ci.ub=ci[2], transf=transform)
    supplied <- list(lo=ci[1], hi=ci[2], p=NULL)
  }
  ci <- as.numeric(ref$yi) + c(-1,1)*qnorm(.975)*sqrt(ref$vi)
  if (ratio) ci <- exp(ci)
  list(id=c$id, input=c, supplied=supplied,
       expected=list(yi=as.numeric(ref$yi), vi=as.numeric(ref$vi),
                     se=sqrt(as.numeric(ref$vi)), lo=ci[1], hi=ci[2]))
})

# Transform on the analysis scale; canonical conv.delta supplies the variance.
row <- function(scale, yi, vi, ratio=FALSE) {
  pt <- if (ratio) exp(yi) else yi
  if (is.null(vi)) return(list(scale=scale, point=pt, se=NULL, lo=NULL, hi=NULL))
  se <- sqrt(vi)
  ci <- yi+c(-1,1)*qnorm(.975)*se
  if (ratio) ci <- exp(ci)
  list(scale=scale, point=pt, se=se, lo=ci[1], hi=ci[2])
}
delta_row <- function(scale, yi, vi, fun, ratio=FALSE) {
  r <- conv.delta(yi, vi, transf=fun)
  row(scale, as.numeric(r$yi), as.numeric(r$vi), ratio)
}
conversions <- lapply(input$convert, function(c) {
  e <- c$est; v <- c$se^2; p <- c$p0; sd <- c$sd
  rows <- list()
  add <- function(r) rows[[length(rows)+1L]] <<- r
  if (c$type %in% c("OR", "RR", "HR", "IRR")) {
    add(row(c$type, log(e), v, TRUE))
    add(row(paste0("ln(", c$type, ")"), log(e), v))
  }
  if (c$type == "OR") {
    add(delta_row("RR", log(e), v, function(x) log(transf.lnortorr(x, pc=p)), TRUE))
    add(row("RD", transf.lnortord(log(e), pc=p), NULL))
    add(delta_row("SMD (Cox)", log(e), v, transf.lnortod.logis))
  } else if (c$type == "RR") {
    log_or <- function(x) qlogis(exp(x)*p)-qlogis(p)
    add(delta_row("OR", log(e), v, log_or, TRUE))
    add(row("RD", exp(log(e))*p-p, NULL))
    add(delta_row("SMD (Cox via OR)", log(e), v, function(x) transf.lnortod.logis(log_or(x))))
  } else if (c$type == "RD") {
    add(row("RD", e, v))
    add(row("RR (implied)", log((p+e)/p), NULL, TRUE))
    add(row("OR (implied)", qlogis(p+e)-qlogis(p), NULL, TRUE))
  } else if (c$type == "SMD") {
    J <- cmicalc(c$n1+c$n2-2, method="exact")
    if (c$kind == "g") {
      add(row("SMD (Hedges' g)", e, v))
      add(delta_row("SMD (Cohen's d, recovered)", e, v, function(x) x/J))
      add(delta_row("MD", e, v, function(x) transf.dtomd(x/J, targs=sd)))
    } else {
      add(row("SMD (Cohen's d)", e, v))
      add(delta_row("SMD (Hedges' g)", e, v, function(x) x*J))
      add(delta_row("MD", e, v, function(x) transf.dtomd(x, targs=sd)))
    }
    add(delta_row("OR (Cox approximation)", e, v, transf.dtolnor.logis, TRUE))
  } else if (c$type == "MD") {
    add(row("MD", e, v))
    add(delta_row("SMD", e, v, function(x) x/sd))
  }
  list(id=c$id, input=c, expected=rows)
})
reference <- list(provenance=provenance("p20-reference.R", c("metafor", "jsonlite", "numDeriv")),
  methods=list(smd="escalc(SMD, correct=TRUE/FALSE, vtype=LS); summary.escalc(level=95); cmicalc(exact)",
               wald="conv.wald(transf=log or identity); stats::qnorm",
               conversions="conv.delta; transf.lnortorr/lnortord/lnortod.logis/dtolnor.logis/dtomd; stats::qlogis/qnorm",
               assumptions="Fixed p0 and SD; supplied d/g SE is transformed, not recomputed as a fresh escalc variance"),
  means=means, t=lapply(input$t, stat_case), f=lapply(input$f, stat_case, is_f=TRUE),
  wald=wald, convert=conversions)
record(reference, "p20-reference.json")
cat(R.version.string, "metafor", as.character(packageVersion("metafor")), "\n")
