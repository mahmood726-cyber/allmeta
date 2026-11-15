# Reference values for tests/test_nmapro6_modules.py (R 4.6.0, netmeta 3.7.0).
# Regenerate from nma-pro-v2/tests (after `node nmapro6_harness.cjs --write-scripts`):
#   Rscript --no-environ nmapro6_reference.R nmapro6_r460.json
#
#  blank : item 1. netmeta(TE, seTE) on Senn 2013 (fixtures/nmapro3-senn2013-full.csv) with Kipnes2001's TE = NA, or
#          Davidson2007's seTE = NA (netmeta drops "comparisons with missing TE / seTE"), method.tau DL and common;
#          painkillers arm data (fixtures/nmapro6-painkillers-arms.csv) by pairwise(sm = "MD") -> netmeta DL / REML,
#          complete and with Pain-4's sd1 = NA; pairwise(sm = "SMD") with Pain-4's sd1 = NA: which studies keep a TE.
#          TE / seTE vs the reference, tau2, Q, k (comparisons used).
#  webr  : item 2. Each script in fixtures/nmapro6-webr/<case>.R -- exactly the netmeta script the page's in-browser
#          "Validate with R" check runs (WebRValidation.buildNetmetaCode) -- evaluated as is; its JSON is stored and
#          the harness feeds it to the page's compareResults. old_<case>: the same script with the netmeta call the
#          check made until 2026-11-15 (method.tau = "REML" whatever the page's estimator).
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[1] else "nmapro6_r460.json"
.libPaths(c("C:/Users/mahmo/wt/rlib2", "C:/Users/mahmo/wt/rlib", "C:/Users/mahmo/AppData/Local/R/win-library/4.6", .libPaths()))
suppressMessages({library(netmeta); library(jsonlite)})
res <- list(versions = list(R = R.version.string, netmeta = as.character(packageVersion("netmeta"))))
here <- getwd()
fx <- function(f) file.path(here, "fixtures", f)

vsref <- function(net, ref, common) {
  TE <- if (common) net$TE.common else net$TE.random
  se <- if (common) net$seTE.common else net$seTE.random
  o <- list()
  for (t in setdiff(net$trts, ref)) o[[t]] <- list(TE = TE[t, ref], seTE = se[t, ref])
  o
}
fitnet <- function(p, ref, est) {
  common <- est == "FE"
  net <- suppressWarnings(if (common) netmeta(p, reference.group = ref, common = TRUE, random = FALSE)
         else netmeta(p, reference.group = ref, common = FALSE, random = TRUE, method.tau = est))
  list(tau2 = if (common) 0 else net$tau^2, Q = net$Q, k = net$k, m = net$m, effects = vsref(net, ref, common))
}

# ---------------------------------------------------------------- blank (item 1)
senn <- read.csv(fx("nmapro3-senn2013-full.csv"))
pain <- read.csv(fx("nmapro6-painkillers-arms.csv"))
res$blank <- list()
sTE <- senn; sTE$yi[sTE$study == "Kipnes2001"] <- NA
sSE <- senn; sSE$sei[sSE$study == "Davidson2007"] <- NA
for (est in c("DL", "FE")) {
  for (nm in c("blankTE", "blankSE")) {
    d <- if (nm == "blankTE") sTE else sSE
    p <- suppressWarnings(netmeta(d$yi, d$sei, d$treat1, d$treat2, d$study, sm = "MD", reference.group = "plac",
                                  common = est == "FE", random = est != "FE", method.tau = if (est == "FE") "DL" else est))
    common <- est == "FE"
    res$blank[[paste0("senn_", nm, "_", est)]] <- list(tau2 = if (common) 0 else p$tau^2, Q = p$Q, k = p$k, m = p$m,
      kept = unique(p$studlab), effects = vsref(p, "plac", common))
  }
}
pw <- function(d, sm) suppressWarnings(pairwise(treat = list(d$treat1, d$treat2), mean = list(d$mean1, d$mean2),
        sd = list(d$sd1, d$sd2), n = list(d$n1, d$n2), studlab = d$study, sm = sm))
pB <- pain; pB$sd1[pB$study == "Pain-4"] <- NA
for (est in c("DL", "REML")) {
  res$blank[[paste0("pain_MD_", est)]] <- fitnet(pw(pain, "MD"), "Placebo", est)
  res$blank[[paste0("pain_MD_blankSD_", est)]] <- fitnet(pw(pB, "MD"), "Placebo", est)
}
ps <- pw(pB, "SMD")
res$blank$pain_SMD_blankSD <- list(withTE = as.character(ps$studlab[!is.na(ps$TE)]), noTE = as.character(ps$studlab[is.na(ps$TE)]))

# ---------------------------------------------------------------- webr (item 2)
res$webr <- list()
run_script <- function(code) tryCatch(fromJSON(eval(parse(text = code), envir = new.env())),
                                      error = function(e) list(error = conditionMessage(e)))
for (f in sort(list.files(fx("nmapro6-webr"), pattern = "\\.R$", full.names = TRUE))) {
  nm <- sub("\\.R$", "", basename(f))
  code <- paste(readLines(f, warn = FALSE), collapse = "\n")
  res$webr[[nm]] <- run_script(code)
  if (grepl("^senn_PM", nm)) {
    old <- sub("common=FALSE, random=TRUE, tau.preset=sqrt\\([^)]*\\)", "common=FALSE, random=TRUE, method.tau=\"REML\"", code)
    stopifnot(old != code)
    res$webr[[paste0("old_", nm)]] <- run_script(old)
  }
}
writeLines(toJSON(res, auto_unbox = TRUE, digits = NA, null = "null", na = "null"), out)
cat("wrote", out, "\n")
