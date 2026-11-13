# Reference values for tests/test_upper_tail.py: R 4.6.0, pchisq(Q, df, lower.tail = FALSE).
# Q and df are the page's own heterogeneity statistics for the built-in sample data (and the same data
# with every SE divided by 4), as printed by tests/upper_tail_harness.cjs; only the p-value is checked against R.
# The four rows without _tau0 are Q at the page's DL tau2 (the page default). Commit 91268783 (#538) replaced the
# approximate DL denominator by the exact moment equation, so those Q values changed (sample quadratic 15.0445 -> 14.8787,
# linear 15.3471 -> 15.7997; tight quadratic 5.8971 -> 26.8438, linear 5.2546 -> 26.9584); the _tau0 rows did not.
# The new values were reproduced independently in R 4.6.0 (|page - R| / Q < 1e-14): tau2 = (QE - (n - p)) / tr(P0)
# with P0 = W0 - W0 X (X'W0X)^-1 X'W0, W0 = V^-1 (QE = metafor 5.2.1 rma.mv QE), then GLS at that tau2 and
# Q = r'(V + tau2 I)^-1 r. Sample quadratic: tau2 0.080791008951294, Q 14.878738691908355.
# Run from dosehtml/tests:  Rscript --no-environ upper_tail_reference.R
library(jsonlite)
q <- list(
  sample_solveGLS = c(14.878738691908367, 10), sample_solveGLS_tau0 = c(25.410818592367182, 10),
  sample_fitLinearModel = c(15.799667012480906, 11), sample_fitLinearModel_tau0 = c(26.594146670293014, 11),
  tight_solveGLS = c(26.843826881772564, 10), tight_solveGLS_tau0 = c(1813.533891854999, 10),
  tight_fitLinearModel = c(26.958390504218187, 11), tight_fitLinearModel_tau0 = c(2054.528707866363, 11))
out <- lapply(q, function(v) list(Q = v[1], df = v[2], p = pchisq(v[1], v[2], lower.tail = FALSE)))
out$R <- R.version.string
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE), "upper_tail_r460.json")
