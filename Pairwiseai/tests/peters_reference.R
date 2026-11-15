# Reference values for tests/playwright/pairwise-rexport-peters.spec.mjs (lane pwrest4): Peters' test as the
# bundle's R export now writes it, against meta::metabias(method.bias = "Peters") (Peters et al. 2006, JAMA
# 295:676), on the bundle's binary demos (peters_input.json, captured from the page).
#   export:  regtest(yi, vi = 1/S + 1/F, ni = n, model = "lm", predictor = "ninv")   (S, F: total events, non-events)
#   meta:    metabias(metabin(...), method.bias = "Peters")   (slope of 1/n, weights 1 / (1/S + 1/F))
#   old:     regtest(rma(yi, vi, ni = n), model = "lm", predictor = "ni")   (what the export printed before)
# Run: Rscript Pairwiseai/tests/peters_reference.R   (R 4.6.0, metafor 5.2.1, meta 8.5-0, jsonlite)
suppressMessages({ library(metafor); library(meta); library(jsonlite) })
here <- dirname(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE)))
inp <- fromJSON(file.path(here, "peters_input.json"), simplifyVector = TRUE)
out <- list()
for (k in names(inp)) {
  d <- inp[[k]]; st <- d$studies
  yi <- d$yi; vi <- d$vi; n <- st$n_t + st$n_c; S <- st$events_t + st$events_c
  ex <- regtest(yi, vi = 1 / S + 1 / (n - S), ni = n, model = "lm", predictor = "ninv")
  old <- regtest(rma(yi, vi, ni = n, method = "DL"), model = "lm", predictor = "ni")
  m <- metabin(st$events_t, st$n_t, st$events_c, st$n_c, sm = d$measure, method = "Inverse")
  mb <- metabias(m, method.bias = "Peters", k.min = 3)
  out[[k]] <- list(measure = d$measure, k = length(yi),
    export = list(t = unname(ex$zval), df = unname(ex$dfs), p = unname(ex$pval)),
    meta = list(t = unname(mb$statistic), df = unname(c(mb$parameter, mb$parameters, mb$df)[1]), p = unname(mb$p.value)),
    old = list(t = unname(old$zval), df = unname(old$dfs), p = unname(old$pval)),
    te_maxdiff = max(abs(m$TE - yi)))
}
out$versions <- list(R = R.version.string, metafor = as.character(packageVersion("metafor")),
                     meta = as.character(packageVersion("meta")))
writeLines(toJSON(out, auto_unbox = TRUE, digits = NA, pretty = TRUE), file.path(here, "peters_r460.json"))
