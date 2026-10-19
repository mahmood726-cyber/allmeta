# Reference values for HTA Egger's test and trim-and-fill.
#
# Run from the repository root:
#   Rscript HTA/tests/reference/egger_trimfill_reference.R
# Writes HTA/tests/reference/egger_trimfill_oracle.json, which is read by
# HTA/tests/engine/eggerTrimFillReference.test.js and
# HTA/tests/ui/advancedUI2.test.js (tolerance 1e-6).
#
# Recorded with R 4.6.0 / metafor 5.0.1 / jsonlite.
#   Egger:        regtest(rma(yi, vi, method = "FE"), model = "lm")
#                 (t/p of the sei coefficient = classical Egger intercept;
#                  intercept/SE taken from the equivalent OLS of yi/sei on 1/sei)
#   Trim-and-fill: trimfill(rma(yi, vi, method = "FE"), estimator = ...)
#                 (the HTA panel labels trim-and-fill a fixed-effect adjustment)
suppressMessages({ library(metafor); library(jsonlite) })

datasets <- list(
  # Small studies report larger effects: missing studies on the LEFT.
  asymmetric_left = data.frame(
    study = paste0("S", 1:10),
    yi  = c(0.10, 0.32, 0.45, 0.62, 0.05, 0.71, 0.88, 0.25, 0.54, 0.95),
    sei = c(0.08, 0.12, 0.18, 0.25, 0.10, 0.30, 0.38, 0.15, 0.22, 0.42)),
  # Small studies report more negative effects: missing studies on the RIGHT.
  asymmetric_right = data.frame(
    study = paste0("R", 1:8),
    yi  = c(-0.05, -0.20, -0.41, -0.12, -0.66, -0.30, -0.83, -0.02),
    sei = c( 0.07,  0.14,  0.21,  0.11,  0.33,  0.17,  0.40,  0.09)),
  # Mild asymmetry for which the Q0 estimator is defined (k = 11).
  mild_left = data.frame(
    study = paste0("M", 1:11),
    yi  = c(0.30, 0.18, 0.42, 0.25, 0.55, 0.12, 0.38, 0.60, 0.22, 0.48, 0.35),
    sei = c(0.10, 0.12, 0.20, 0.09, 0.30, 0.15, 0.18, 0.35, 0.11, 0.26, 0.14))
)

out <- list(
  r_version = R.version.string,
  metafor_version = as.character(packageVersion("metafor")),
  cases = lapply(names(datasets), function(nm) {
    d <- datasets[[nm]]
    vi <- d$sei^2
    fe <- rma(d$yi, vi, method = "FE")
    rt <- regtest(fe, model = "lm")
    ols <- summary(lm(I(d$yi / d$sei) ~ I(1 / d$sei)))$coefficients
    stopifnot(abs(ols[1, 3] - rt$zval) < 1e-10)  # same test, two forms
    tf <- lapply(c("L0", "R0", "Q0"), function(e) {
      t <- tryCatch(trimfill(fe, estimator = e), error = function(err) NULL,
                    warning = function(w) NULL)  # Q0: sqrt of a negative -> undefined
      if (is.null(t)) return(list(estimator = e, error = "undefined"))
      list(estimator = e, k0 = t$k0, side = t$side,
           original = as.numeric(coef(fe)),
           adjusted = as.numeric(coef(t)),
           adjusted_ci_lower = t$ci.lb, adjusted_ci_upper = t$ci.ub,
           imputed = if (t$k0 > 0) as.numeric(t$yi[t$fill]) else numeric(0))
    })
    list(name = nm, studies = lapply(seq_len(nrow(d)), function(i)
           list(study = d$study[i], effect = d$yi[i], se = d$sei[i])),
         egger = list(intercept = ols[1, 1], se = ols[1, 2], t = rt$zval,
                      df = rt$dfs, p = rt$pval),
         trimfill = tf)
  })
)
write(toJSON(out, auto_unbox = TRUE, digits = NA, pretty = TRUE),
      "HTA/tests/reference/egger_trimfill_oracle.json")
cat("wrote HTA/tests/reference/egger_trimfill_oracle.json\n")
