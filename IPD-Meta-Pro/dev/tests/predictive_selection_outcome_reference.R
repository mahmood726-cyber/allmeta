# Reference for dev/tests/predictive_selection_outcome.test.cjs (Predictive Patient Selection reads the outcome type).
# Two seeded IPD sets (320 patients, 4 studies, numeric covariates age / bmi / hamd_baseline): one with a continuous
# outcome (hamd_change) and one with a binary outcome (remission). For each covariate the page splits patients at the
# median (<= median = low, > median = high) and estimates the treatment effect in each half; the interaction is high
# minus low. Patients are then scored (covariates ordered by |interaction|, weight 1/rank, +1 above / -1 at or below
# the median, times the interaction) and the effect is re-estimated in the score > 0 and score <= 0 groups.
# Effect, per outcome type: continuous = mean difference (treated - control) with SE sqrt(var1/n1 + var0/n0), sample
# variances; binary = risk difference with SE sqrt(p1(1-p1)/n1 + p0(1-p0)/n0). Writes the JSON next to this file.
#   Rscript --no-environ dev/tests/predictive_selection_outcome_reference.R   (jsonlite)
suppressPackageStartupMessages(library(jsonlite))
set.seed(20261113)
n <- 320
base <- data.frame(study_id = paste0("S", rep(1:4, length.out = n)), patient_id = seq_len(n), treatment = rep(c(1, 0), length.out = n),
                   age = round(runif(n, 25, 70)), bmi = round(rnorm(n, 27, 4), 1), hamd_baseline = round(rnorm(n, 23, 3)))
# treatment effect larger in older patients (continuous); remission more likely with treatment and lower baseline
cont <- base; cont$hamd_change <- round(6 + base$treatment * (1 + 0.08 * (base$age - 45)) + rnorm(n, 0, 5), 1)
bin <- base; bin$remission <- rbinom(n, 1, plogis(-0.8 + 0.7 * base$treatment - 0.1 * (base$hamd_baseline - 23)))
eff <- function(t, c, type) {
  if (type == "continuous") list(effect = mean(t) - mean(c), se = sqrt(var(t) / length(t) + var(c) / length(c)))
  else { p1 <- mean(t == 1); p0 <- mean(c == 1); list(effect = p1 - p0, se = sqrt(p1 * (1 - p1) / length(t) + p0 * (1 - p0) / length(c))) }
}
selection <- function(d, y, type, covs) {
  cate <- lapply(covs, function(v) {
    m <- median(d[[v]]); lo <- d[[v]] <= m; hi <- d[[v]] > m
    L <- eff(d[[y]][lo & d$treatment == 1], d[[y]][lo & d$treatment == 0], type)
    H <- eff(d[[y]][hi & d$treatment == 1], d[[y]][hi & d$treatment == 0], type)
    list(median = m, low = L$effect, lowSE = L$se, high = H$effect, highSE = H$se, interaction = H$effect - L$effect,
         interactionSE = sqrt(L$se^2 + H$se^2))
  }); names(cate) <- covs
  ord <- covs[order(-abs(sapply(cate, `[[`, "interaction")))]
  score <- Reduce(`+`, lapply(seq_along(ord), function(i) { v <- ord[i]; (1 / i) * ifelse(d[[v]] > cate[[v]]$median, 1, -1) * cate[[v]]$interaction }))
  hiB <- score > 0
  vb <- eff(d[[y]][hiB & d$treatment == 1], d[[y]][hiB & d$treatment == 0], type)
  vn <- eff(d[[y]][!hiB & d$treatment == 1], d[[y]][!hiB & d$treatment == 0], type)
  list(order = ord, cate = cate, validation = list(nBenefiters = sum(hiB), nNonBenefiters = sum(!hiB), effectInBenefiters = vb$effect, effectInNonBenefiters = vn$effect))
}
covs <- c("age", "bmi", "hamd_baseline")
out <- list(R = R.version.string,
  continuous = list(rows = cont, ref = selection(cont, "hamd_change", "continuous", covs)),
  binary = list(rows = bin, ref = selection(bin, "remission", "binary", covs)))
args <- commandArgs(trailingOnly = FALSE); me <- sub("^--file=", "", args[grep("^--file=", args)])
writeLines(toJSON(out, digits = NA, auto_unbox = TRUE, dataframe = "rows"), file.path(dirname(me), "predictive_selection_outcome_reference.json"))
cat("continuous best", out$continuous$ref$order[1], out$continuous$ref$cate[[out$continuous$ref$order[1]]]$interaction,
    "| binary best", out$binary$ref$order[1], out$binary$ref$cate[[out$binary$ref$order[1]]]$interaction, "\n")
