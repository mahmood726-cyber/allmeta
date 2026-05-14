## mlma-tiny.R  — R-parity for multilevel-ma
## Mirrors the iterated moment-of-moments algorithm in multilevel-ma/index.html.
## The JS engine uses a custom MoM estimator (Cheung 2014 / Raudenbush style),
## NOT REML. This R script replicates that algorithm exactly so the test
## asserts genuine JS<->R numeric equivalence.
##
## Usage (called by _r_parity.py):
##   Rscript --vanilla mlma-tiny.R mlma-tiny.csv

suppressPackageStartupMessages(library(jsonlite))

args <- commandArgs(trailingOnly = TRUE)
d <- read.csv(args[1])
# columns: study, effect, SE, label
rows <- data.frame(study = as.character(d$study),
                   te    = as.numeric(d$effect),
                   se    = as.numeric(d$SE),
                   stringsAsFactors = FALSE)

studies   <- unique(rows$study)
J         <- length(studies)
byStudy   <- lapply(studies, function(s) rows[rows$study == s, ])
names(byStudy) <- studies

## ---- helper: FE pool within a group ----
feGroup <- function(grp) {
  w  <- 1 / grp$se^2
  sw <- sum(w)
  list(mean = sum(w * grp$te) / sw, se = sqrt(1/sw))
}

## ---- Initial tau2_study: DL across study-level FE pools ----
pools <- lapply(byStudy, feGroup)
ws    <- sapply(pools, function(p) 1/p$se^2)
sws   <- sum(ws)
mu0   <- sum(ws * sapply(pools, function(p) p$mean)) / sws
Q0    <- sum(ws * (sapply(pools, function(p) p$mean) - mu0)^2)
dfS0  <- J - 1
sW2   <- sum(ws^2)
tau2_study  <- if (dfS0 > 0) max(0, (Q0 - dfS0) / (sws - sW2/sws)) else 0

## ---- Initial tau2_within: per-study DL, averaged ----
withinQs <- c()
for (s in studies) {
  grp <- byStudy[[s]]
  if (nrow(grp) < 2) next
  w  <- 1/grp$se^2
  sw <- sum(w)
  m  <- sum(w * grp$te) / sw
  Q  <- sum(w * (grp$te - m)^2)
  df <- nrow(grp) - 1
  sW2g <- sum(w^2)
  t2   <- if (df > 0) max(0, (Q - df) / (sw - sW2g/sw)) else 0
  withinQs <- c(withinQs, t2)
}
tau2_within <- if (length(withinQs) > 0) mean(withinQs) else 0

## ---- Iterate to convergence ----
for (it in 1:30) {
  ## Update tau2_study using within-study weights = 1/(se^2 + tau2_within)
  studyMeans <- lapply(byStudy, function(grp) {
    wg  <- 1/(grp$se^2 + tau2_within)
    swg <- sum(wg)
    list(mean = sum(wg * grp$te) / swg, se = sqrt(1/swg))
  })
  wsN  <- sapply(studyMeans, function(p) 1/p$se^2)
  swsN <- sum(wsN)
  muS  <- sum(wsN * sapply(studyMeans, function(p) p$mean)) / swsN
  Qs   <- sum(wsN * (sapply(studyMeans, function(p) p$mean) - muS)^2)
  dfSN <- J - 1
  sW2N <- sum(wsN^2)
  new_tau2_study <- if (dfSN > 0) max(0, (Qs - dfSN) / (swsN - sW2N/swsN)) else 0

  ## Update tau2_within from within-study residual Q
  Qw <- 0; dfw <- 0; sumWw <- 0; sumW2w <- 0
  for (s in studies) {
    grp <- byStudy[[s]]
    if (nrow(grp) < 2) next
    wg  <- 1/grp$se^2
    swg <- sum(wg)
    mg  <- sum(wg * grp$te) / swg
    Qw  <- Qw  + sum(wg * (grp$te - mg)^2)
    dfw <- dfw + nrow(grp) - 1
    sumWw  <- sumWw  + swg
    sumW2w <- sumW2w + sum(wg^2)
  }
  new_tau2_within <- if (dfw > 0) max(0, (Qw - dfw) / (sumWw - sumW2w/sumWw)) else 0

  if (abs(new_tau2_study - tau2_study) < 1e-6 &&
      abs(new_tau2_within - tau2_within) < 1e-6) {
    tau2_study  <- new_tau2_study
    tau2_within <- new_tau2_within
    break
  }
  tau2_study  <- new_tau2_study
  tau2_within <- new_tau2_within
}

## ---- Final pooled estimate ----
wFinal <- 1 / (rows$se^2 + tau2_within + tau2_study)
swFinal <- sum(wFinal)
mu     <- sum(wFinal * rows$te) / swFinal
seMu   <- sqrt(1/swFinal)

## ---- HKSJ SE (cluster df = J-1, q-floor at 1) ----
dfHK  <- max(1L, J - 1L)
qStar <- sum(wFinal * (rows$te - mu)^2) / dfHK
qF    <- max(1, qStar)
seMuHK <- sqrt(qF / swFinal)

ci_lb_z <- mu - 1.96 * seMu
ci_ub_z <- mu + 1.96 * seMu

cat(toJSON(list(
  mu          = as.numeric(mu),
  seMu        = as.numeric(seMu),
  seMuHK      = as.numeric(seMuHK),
  tau2_study  = as.numeric(tau2_study),
  tau2_within = as.numeric(tau2_within),
  ci_lb_z     = as.numeric(ci_lb_z),
  ci_ub_z     = as.numeric(ci_ub_z),
  k           = nrow(rows),
  J           = as.integer(J)
), auto_unbox = TRUE, digits = 15))
cat("\n")
