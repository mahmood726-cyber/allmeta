## km-oracle.R — reference for the (simplified) KM IPD reconstructor.
## Synthetic exponential KM: S(t)=exp(-lambda t), lambda=0.05, N0=200,
## ~no censoring. Reference = IPDfromKM (the canonical full Guyot 2012
## implementation). The app is a SIMPLIFIED heuristic, so the test
## checks: (a) reconstructed KM tracks the digitized input, (b) total
## events hits the forced value, (c) median/events are CLOSE to
## full-Guyot within a documented band — NOT IPD-level parity.
suppressPackageStartupMessages({library(IPDfromKM); library(survival); library(jsonlite)})

lambda <- 0.05; N0 <- 200
tcurve <- seq(0, 30, by = 2)
S      <- exp(-lambda * tcurve)
trisk  <- seq(0, 30, by = 5)
nrisk  <- round(N0 * exp(-lambda * trisk))
true_median <- log(2) / lambda                       # 13.863
tot_events  <- N0 - tail(nrisk, 1)                   # ~no censoring

## App-format fixture strings.
curve_txt <- paste(sprintf("%g, %.4f", tcurve, S), collapse = "\n")
risk_txt  <- paste(sprintf("%g, %d",  trisk,  nrisk), collapse = "\n")

## IPDfromKM full-Guyot reconstruction.
dat  <- data.frame(time = tcurve, surv = S)
prep <- preprocess(dat = dat, trisk = trisk, nrisk = nrisk, maxy = 1)
ipd  <- getIPD(prep = prep, armID = 1, tot.events = tot_events)$IPD
fit  <- survfit(Surv(time, status) ~ 1, data = ipd)
gm   <- summary(fit)$table["median"]
gev  <- sum(ipd$status == 1)
## Full-Guyot survival at each digitized curve time (step function).
sg <- sapply(tcurve, function(tt) { i <- which(fit$time <= tt)
  if (length(i)) fit$surv[max(i)] else 1 })

oracle <- list(
  curve_txt = curve_txt, risk_txt = risk_txt,
  tot_events = tot_events, true_median = true_median,
  guyot = list(median = as.numeric(gm), events = gev,
               survAt = data.frame(t = tcurve, s = round(sg, 6))),
  digitized = data.frame(t = tcurve, s = round(S, 6)))
writeLines(toJSON(oracle, auto_unbox = TRUE, digits = 8, dataframe = "rows"),
  "C:/Projects/allmeta/km-reconstructor/tests/fixtures/km-oracle.json")
cat("wrote km-oracle.json\n")
cat("true median=", true_median, " Guyot median=", gm, " Guyot events=", gev,
    " tot_events=", tot_events, "\n")
