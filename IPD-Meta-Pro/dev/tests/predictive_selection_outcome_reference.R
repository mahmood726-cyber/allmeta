# Reference for dev/tests/predictive_selection_outcome.test.cjs (Predictive Patient Selection estimates the effect on
# the scale runAnalysis pools, for the configured outcome type).
# Three seeded IPD sets (320 patients, 4 studies, numeric covariates age / bmi / hamd_baseline): a continuous outcome
# (hamd_change), a binary outcome (remission) and a time-to-event outcome (time_months, event). Every study has both
# arms (in the earlier version of this file each study had ONE arm, rows alternated treatment with period 2 and study
# with period 4, which only an unstratified estimate could use).
# For each covariate the page splits patients at the median (<= median = low, > median = high). In each half it
# estimates the treatment effect PER STUDY on the scale runAnalysis pools -- Cox log hazard ratio (Efron ties), log
# odds ratio (0.5 added to the four cells only when a cell is zero: escalc default), mean difference with
# SE sqrt(var1/n1 + var0/n0) -- using only studies with both arms (a continuous study needs >= 2 values per arm),
# and pools those with a fixed-effect inverse-variance model (metafor rma(method = "FE")). The interaction is high
# minus low, SE sqrt(SE_low^2 + SE_high^2). Patients are then scored (covariates ordered by |interaction|, weight
# 1/rank, +1 above / -1 at or below the median, times the interaction) and the effect is re-estimated the same way
# in the score > 0 and score <= 0 groups. Writes the JSON next to this file.
#   Rscript --no-environ dev/tests/predictive_selection_outcome_reference.R   (metafor, survival, jsonlite)
suppressPackageStartupMessages({ library(metafor); library(survival); library(jsonlite) })
set.seed(20261113)
n <- 320
base <- data.frame(study_id = paste0("S", rep(1:4, length.out = n)), patient_id = seq_len(n), treatment = rep(c(1, 1, 1, 1, 0, 0, 0, 0), length.out = n),
                   age = round(runif(n, 25, 70)), bmi = round(rnorm(n, 27, 4), 1), hamd_baseline = round(rnorm(n, 23, 3)))
# treatment effect larger in older patients (continuous); remission more likely with treatment and lower baseline
cont <- base; cont$hamd_change <- round(6 + base$treatment * (1 + 0.08 * (base$age - 45)) + rnorm(n, 0, 5), 1)
bin <- base; bin$remission <- rbinom(n, 1, plogis(-0.8 + 0.7 * base$treatment - 0.1 * (base$hamd_baseline - 23)))
# time-to-event (drawn after the two sets above, so they are unchanged): hazard lower with treatment, more so with
# higher bmi; uniform censoring
surv <- base
haz <- 0.06 * exp(base$treatment * (-0.4 - 0.08 * (base$bmi - 27)))
tt <- rexp(n, haz); cens <- runif(n, 4, 30)
surv$time_months <- round(pmin(tt, cens), 2); surv$event <- as.integer(tt <= cens)

study_est <- function(d, y, type) {
  out <- lapply(sort(unique(d$study_id)), function(s) {
    x <- d[d$study_id == s, ]; t1 <- x$treatment == 1; t0 <- x$treatment == 0
    if (!any(t1) || !any(t0)) return(NULL)
    if (type == "continuous") {
      a <- x[[y]][t1]; b <- x[[y]][t0]
      if (length(a) < 2 || length(b) < 2) return(NULL)
      return(c(mean(a) - mean(b), var(a) / length(a) + var(b) / length(b)))
    }
    if (type == "binary") {
      e <- escalc("OR", ai = sum(x[[y]][t1] == 1), n1i = sum(t1), ci = sum(x[[y]][t0] == 1), n2i = sum(t0))
      return(c(as.numeric(e$yi), as.numeric(e$vi)))
    }
    f <- coxph(Surv(time_months, event) ~ treatment, data = x, ties = "efron")
    c(unname(coef(f)), vcov(f)[1, 1])
  })
  do.call(rbind, out[!sapply(out, is.null)])
}
eff <- function(d, y, type) {
  m <- study_est(d, y, type)
  fe <- rma(m[, 1], m[, 2], method = "FE")
  list(effect = fe$beta[1], se = fe$se, k = nrow(m))
}
selection <- function(d, y, type, covs) {
  cate <- lapply(covs, function(v) {
    m <- median(d[[v]]); lo <- d[[v]] <= m; hi <- d[[v]] > m
    L <- eff(d[lo, ], y, type); H <- eff(d[hi, ], y, type)
    list(median = m, low = L$effect, lowSE = L$se, high = H$effect, highSE = H$se, interaction = H$effect - L$effect,
         interactionSE = sqrt(L$se^2 + H$se^2))
  }); names(cate) <- covs
  ord <- covs[order(-abs(sapply(cate, `[[`, "interaction")))]
  score <- Reduce(`+`, lapply(seq_along(ord), function(i) { v <- ord[i]; (1 / i) * ifelse(d[[v]] > cate[[v]]$median, 1, -1) * cate[[v]]$interaction }))
  hiB <- score > 0
  vb <- eff(d[hiB, ], y, type); vn <- eff(d[!hiB, ], y, type)
  list(order = ord, cate = cate, validation = list(nBenefiters = sum(hiB), nNonBenefiters = sum(!hiB), effectInBenefiters = vb$effect, effectInNonBenefiters = vn$effect,
       seInBenefiters = vb$se, seInNonBenefiters = vn$se))
}
covs <- c("age", "bmi", "hamd_baseline")
out <- list(versions = list(R = R.version.string, metafor = as.character(packageVersion("metafor")), survival = as.character(packageVersion("survival"))),
  continuous = list(rows = cont, ref = selection(cont, "hamd_change", "continuous", covs)),
  binary = list(rows = bin, ref = selection(bin, "remission", "binary", covs)),
  survival = list(rows = surv, ref = selection(surv, "event", "survival", covs)))
args <- commandArgs(trailingOnly = FALSE); me <- sub("^--file=", "", args[grep("^--file=", args)])
writeLines(toJSON(out, digits = NA, auto_unbox = TRUE, dataframe = "rows"), file.path(dirname(me), "predictive_selection_outcome_reference.json"))
for (ty in c("continuous", "binary", "survival")) { r <- out[[ty]]$ref
  cat(ty, "best", r$order[1], r$cate[[r$order[1]]]$interaction, "| validation", r$validation$effectInBenefiters, r$validation$effectInNonBenefiters, "\n") }
