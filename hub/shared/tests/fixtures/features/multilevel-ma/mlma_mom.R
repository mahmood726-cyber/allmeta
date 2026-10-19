# Method-of-moments reference for multilevel-ma (lane fc, item 11).
# The MoM algorithm is the one in multilevel-ma/tests/fixtures/mlma-tiny.R (R replica of the page's
# iterated MoM), wrapped as a function and extended with the cluster-df HKSJ interval
#   mu +/- qt(0.975, J-1) * seMuHK
# and the prediction interval mu +/- qt(0.975, J-1) * sqrt(tau2_study + tau2_within + seMuHK^2).
# Usage: Rscript mlma_mom.R corpus.json out.json
suppressPackageStartupMessages(library(jsonlite))
cat(R.version.string, '\n'); cat('libPaths:', .libPaths(), '\n')
cat('jsonlite', as.character(packageVersion('jsonlite')), '\n')
args <- commandArgs(TRUE)
corpus <- fromJSON(args[1], simplifyVector = FALSE)

mom <- function(rows) {
  studies <- unique(rows$study); J <- length(studies)
  byStudy <- lapply(studies, function(s) rows[rows$study == s, ]); names(byStudy) <- studies
  feGroup <- function(grp) { w <- 1 / grp$se^2; sw <- sum(w); list(mean = sum(w * grp$te) / sw, se = sqrt(1 / sw)) }
  pools <- lapply(byStudy, feGroup)
  ws <- sapply(pools, function(p) 1 / p$se^2); sws <- sum(ws)
  mu0 <- sum(ws * sapply(pools, function(p) p$mean)) / sws
  Q0 <- sum(ws * (sapply(pools, function(p) p$mean) - mu0)^2)
  dfS0 <- J - 1; sW2 <- sum(ws^2)
  tau2_study <- if (dfS0 > 0) max(0, (Q0 - dfS0) / (sws - sW2 / sws)) else 0
  withinQs <- c()
  for (s in studies) {
    grp <- byStudy[[s]]; if (nrow(grp) < 2) next
    w <- 1 / grp$se^2; sw <- sum(w); m <- sum(w * grp$te) / sw
    Q <- sum(w * (grp$te - m)^2); df <- nrow(grp) - 1; sW2g <- sum(w^2)
    withinQs <- c(withinQs, if (df > 0) max(0, (Q - df) / (sw - sW2g / sw)) else 0)
  }
  tau2_within <- if (length(withinQs) > 0) mean(withinQs) else 0
  for (it in 1:30) {
    studyMeans <- lapply(byStudy, function(grp) { wg <- 1 / (grp$se^2 + tau2_within); swg <- sum(wg)
      list(mean = sum(wg * grp$te) / swg, se = sqrt(1 / swg)) })
    wsN <- sapply(studyMeans, function(p) 1 / p$se^2); swsN <- sum(wsN)
    muS <- sum(wsN * sapply(studyMeans, function(p) p$mean)) / swsN
    Qs <- sum(wsN * (sapply(studyMeans, function(p) p$mean) - muS)^2)
    dfSN <- J - 1; sW2N <- sum(wsN^2)
    new_tau2_study <- if (dfSN > 0) max(0, (Qs - dfSN) / (swsN - sW2N / swsN)) else 0
    Qw <- 0; dfw <- 0; sumWw <- 0; sumW2w <- 0
    for (s in studies) {
      grp <- byStudy[[s]]; if (nrow(grp) < 2) next
      wg <- 1 / grp$se^2; swg <- sum(wg); mg <- sum(wg * grp$te) / swg
      Qw <- Qw + sum(wg * (grp$te - mg)^2); dfw <- dfw + nrow(grp) - 1
      sumWw <- sumWw + swg; sumW2w <- sumW2w + sum(wg^2)
    }
    new_tau2_within <- if (dfw > 0) max(0, (Qw - dfw) / (sumWw - sumW2w / sumWw)) else 0
    if (abs(new_tau2_study - tau2_study) < 1e-6 && abs(new_tau2_within - tau2_within) < 1e-6) {
      tau2_study <- new_tau2_study; tau2_within <- new_tau2_within; break }
    tau2_study <- new_tau2_study; tau2_within <- new_tau2_within
  }
  wFinal <- 1 / (rows$se^2 + tau2_within + tau2_study); swFinal <- sum(wFinal)
  mu <- sum(wFinal * rows$te) / swFinal; seMu <- sqrt(1 / swFinal)
  dfHK <- max(1L, J - 1L)
  qStar <- sum(wFinal * (rows$te - mu)^2) / dfHK
  seMuHK <- sqrt(max(1, qStar) / swFinal)
  tc <- qt(0.975, dfHK)
  sePred <- sqrt(tau2_study + tau2_within + seMuHK^2)
  list(k = nrow(rows), J = J, mu = mu, seMu = seMu, seMuHK = seMuHK, tCrit = tc,
       tau2_study = tau2_study, tau2_within = tau2_within,
       ci_lb_z = mu - qnorm(0.975) * seMu, ci_ub_z = mu + qnorm(0.975) * seMu,
       ci_lb_hk = mu - tc * seMuHK, ci_ub_hk = mu + tc * seMuHK,
       pi_lb = if (J >= 2) mu - tc * sePred else NA, pi_ub = if (J >= 2) mu + tc * sePred else NA)
}
out <- list()
for (nm in names(corpus)) {
  d <- corpus[[nm]]
  rows <- data.frame(study = vapply(d, function(r) as.character(r$cluster), ''),
                     te = vapply(d, function(r) as.numeric(r$y), 0),
                     se = sqrt(vapply(d, function(r) as.numeric(r$v), 0)), stringsAsFactors = FALSE)
  out[[nm]] <- tryCatch(mom(rows), error = function(e) list(error = conditionMessage(e)))
}
writeLines(toJSON(list(R = R.version.string, results = out), auto_unbox = TRUE, digits = NA, na = 'null'), args[2])
cat(length(out), 'configurations written\n')
