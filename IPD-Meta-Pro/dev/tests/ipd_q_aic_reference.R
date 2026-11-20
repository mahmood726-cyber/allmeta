# Reference for ipd_q_aic.test.cjs (metafor 5.2.1, R 4.6.0).
#  (1) Clustered-IPD panel (runTwoStageIPD): Cochran's Q is the fixed-effect statistic metafor reports as QE,
#      sum w_i (y_i - mu_FE)^2, for every tau^2 method; I^2 is Higgins-Thompson max(0, (QE - df) / QE), the
#      definition the page uses throughout (equal to metafor's I2 for method = "DL").
#  (2) Automatic model selection (fitModelToStudies): log-likelihood, AIC and BIC are metafor's fit.stats "ML"
#      column, i.e. the marginal normal log-likelihood -1/2 sum[log(2 pi (v_i + tau^2)) + (y_i - mu)^2 / (v_i + tau^2)]
#      at each method's own (mu, tau^2), with 1 parameter for the common-effect model and 2 for the random-effects
#      models. FE is metafor method = "EE".
# Data: the sets of tau2_duplicates_reference.json (studies_examples.json sets, k = 2, a tau^2 = 0 boundary, x 1e4 and
# x 1e-4 units) and its 256 IPD rows (k = 7), plus the BCG trials (dat.bcg, log RR).
# Control as tau2_duplicates_reference.R. Run: Rscript ipd_q_aic_reference.R (writes ipd_q_aic_reference.json)
suppressMessages({library(metafor); library(jsonlite)})
td <- fromJSON("tau2_duplicates_reference.json", simplifyVector = TRUE)
sets <- list()
for (i in seq_len(nrow(td$sets))) sets[[td$sets$name[i]]] <- list(yi = td$sets$yi[[i]], vi = td$sets$vi[[i]])
b <- escalc(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = dat.bcg)
sets[["bcg"]] <- list(yi = as.numeric(b$yi), vi = as.numeric(b$vi))
fit <- function(yi, vi, meth) {
  cc <- sqrt(mean(vi))
  rma(yi, vi, method = meth, control = list(threshold = 1e-14 * cc^2, tol = 1e-15 * cc^2, maxiter = 10000, tau2.max = 1e3 * cc^2))
}
cases <- list()
for (nm in names(sets)) {
  d <- sets[[nm]]; k <- length(d$yi)
  ref <- list(name = nm, yi = d$yi, vi = d$vi, k = k)
  ee <- fit(d$yi, d$vi, "EE")
  ref$QE <- ee$QE; ref$I2 <- if (ee$QE > 0) 100 * max(0, (ee$QE - (k - 1)) / ee$QE) else 0
  for (meth in c("FE", "DL", "REML", "PM", "SJ")) {
    f <- fit(d$yi, d$vi, if (meth == "FE") "EE" else meth)
    fs <- f$fit.stats
    ref[[meth]] <- list(tau2 = f$tau2, mu = as.numeric(f$beta), ll = fs["ll", "ML"], AIC = fs["AIC", "ML"], BIC = fs["BIC", "ML"],
                        QE = f$QE, I2_metafor = f$I2)
  }
  cases[[length(cases) + 1]] <- ref
}
# IPD rows -> per-study mean differences exactly as runTwoStageIPD forms them (Welch variance)
rows <- td$ipd$rows
st <- do.call(rbind, lapply(split(rows, factor(rows$study, levels = unique(rows$study))), function(x) {
  t <- x$y[x$treat == 1]; c <- x$y[x$treat == 0]
  data.frame(yi = mean(t) - mean(c), vi = var(t) / length(t) + var(c) / length(c)) }))
k <- nrow(st); ee <- fit(st$yi, st$vi, "EE")
ipd <- list(yi = st$yi, vi = st$vi, QE = ee$QE, QEp = ee$QEp, I2 = 100 * max(0, (ee$QE - (k - 1)) / ee$QE))
for (meth in c("DL", "REML", "PM")) { f <- fit(st$yi, st$vi, meth); ipd[[meth]] <- list(tau2 = f$tau2, QE = f$QE, I2_metafor = f$I2) }
out <- list(R = R.version.string, metafor = as.character(packageVersion("metafor")), sets = cases, ipd = ipd)
writeLines(toJSON(out, digits = NA, auto_unbox = TRUE, pretty = TRUE), "ipd_q_aic_reference.json")
cat("wrote", length(cases), "sets + ipd\n")
