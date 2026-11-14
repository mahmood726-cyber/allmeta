# Reference for dev/tests/fragility_same_model.test.cjs (the Fragility Index search re-pools with the main analysis'
# model). Fixed study estimates (log hazard ratios and variances); for each scenario R fits the main analysis
# (metafor rma, method as given; with HKSJ: the page's variant, SE * sqrt(max(1, q)) with
# q = sum(w (y - mu)^2) / (k - 1), w = 1 / (v + tau2), two-sided t with k - 1 df), then runs the page's search: for
# each study, its estimate is moved by 0.05 per step (up to 50 steps) towards the null side opposite to the pooled
# estimate's sign, the studies are re-pooled with THE SAME model, and the index is the first step at which the verdict
# at p < 0.05 differs from the main analysis' (0 = no step up to 50 changes it). Also records the fixed-effect
# z-test re-pool compared with the main analysis' verdict (the page's previous behaviour) for comparison. Writes the JSON next to this file.
#   Rscript --no-environ dev/tests/fragility_same_model_reference.R   (metafor, jsonlite)
suppressPackageStartupMessages({ library(metafor); library(jsonlite) })
fit <- function(yi, vi, method, hksj) {
  # tight convergence (metafor default threshold 1e-5 leaves tau2, hence p, off in the 6th digit)
  r <- rma(yi, vi, method = method, control = list(threshold = 1e-12, maxiter = 10000))
  if (!hksj) return(list(pooled = r$beta[1], se = r$se, p = r$pval, tau2 = r$tau2))
  w <- 1 / (vi + r$tau2); k <- length(yi)
  q <- sum(w * (yi - r$beta[1])^2) / (k - 1)
  se <- r$se * sqrt(max(1, q))
  list(pooled = r$beta[1], se = se, p = 2 * pt(abs(r$beta[1] / se), k - 1, lower.tail = FALSE), tau2 = r$tau2)
}
# main: the analysis whose verdict is compared; method / hksj: the re-pool of the shifted studies
search <- function(yi, vi, method, hksj, main_method = method, main_hksj = hksj) {
  main <- fit(yi, vi, main_method, main_hksj); sig <- main$p < 0.05; dir <- if (main$pooled > 0) -1 else 1
  sapply(seq_along(yi), function(i) {
    for (step in 1:50) { y2 <- yi; y2[i] <- yi[i] + dir * step * 0.05
      if ((fit(y2, vi, method, hksj)$p < 0.05) != sig) return(step) }
    0
  })
}
# A: twelve trials, one with a zero-event arm (huge variance, as runAnalysis gives it), heterogeneous: REML + HKSJ is
# not significant while a fixed-effect z-test is (the situation in which every index of the old search was 1)
A <- data.frame(study = c("T01", "T02", "T03", "T04", "T05", "T06", "T07", "T08", "T09", "T10", "T11", "T12"),
  yi = c(-1.00, -0.15, 0.20, -0.67, -0.10, -0.76, 0.33, -0.35, -0.53, 0.05, -39.7, -0.60),
  vi = c(0.21, 0.035, 0.07, 0.40, 0.11, 0.16, 0.08, 0.33, 0.09, 0.075, 18014398509481984, 0.095),
  n = c(46, 191, 155, 41, 87, 76, 128, 43, 86, 119, 19, 107), events = c(21, 85, 53, 12, 31, 26, 51, 14, 40, 53, 5, 46))
# C: the same trials 0.10 further from the null: significant under REML + HKSJ as well
C <- A; C$yi <- ifelse(C$study == "T11", C$yi, C$yi - 0.10)
# B: five trials, significant under DerSimonian-Laird without HKSJ
B <- data.frame(study = c("B1", "B2", "B3", "B4", "B5"), yi = c(-0.42, -0.31, -0.18, -0.55, -0.05),
  vi = c(0.020, 0.030, 0.025, 0.060, 0.040), n = c(300, 220, 260, 120, 180), events = c(90, 70, 80, 40, 60))
sc <- list(A = list(rows = A, method = "REML", hksj = TRUE), C = list(rows = C, method = "REML", hksj = TRUE), B = list(rows = B, method = "DL", hksj = FALSE))
out <- list(versions = list(R = R.version.string, metafor = as.character(packageVersion("metafor"))))
for (nm in names(sc)) { s <- sc[[nm]]; d <- s$rows
  m <- suppressWarnings(fit(d$yi, d$vi, s$method, s$hksj))
  # (rma warns that the variances span a very large range: the zero-event trial; the fits converge)
  out[[nm]] <- list(rows = d, method = s$method, hksj = s$hksj, main = m, index = suppressWarnings(search(d$yi, d$vi, s$method, s$hksj)),
    index_fixed_effect_z = suppressWarnings(search(d$yi, d$vi, "FE", FALSE, s$method, s$hksj)), fe = suppressWarnings(fit(d$yi, d$vi, "FE", FALSE))) }
args <- commandArgs(trailingOnly = FALSE); me <- sub("^--file=", "", args[grep("^--file=", args)])
writeLines(toJSON(out, digits = NA, auto_unbox = TRUE, dataframe = "rows"), file.path(dirname(me), "fragility_same_model_reference.json"))
for (nm in names(sc)) cat(nm, sc[[nm]]$method, "hksj", sc[[nm]]$hksj, "main p", out[[nm]]$main$p, "FE p", out[[nm]]$fe$p,
  "| index", out[[nm]]$index, "| FE-z search", out[[nm]]$index_fixed_effect_z, "\n")
