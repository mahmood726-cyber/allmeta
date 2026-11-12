# Reference values for tests/test_upper_tail.py: R 4.6.0, pchisq(Q, df, lower.tail = FALSE).
# Q and df are the page's own heterogeneity statistics for the built-in sample data (and the same data
# with every SE divided by 4), as printed by tests/upper_tail_harness.cjs; only the p-value is checked against R.
# Run from dosehtml/tests:  Rscript --no-environ upper_tail_reference.R
library(jsonlite)
q <- list(
  sample_solveGLS = c(15.04448811846409, 10), sample_solveGLS_tau0 = c(25.410818592367182, 10),
  sample_fitLinearModel = c(15.347105016194316, 11), sample_fitLinearModel_tau0 = c(26.594146670293014, 11),
  tight_solveGLS = c(5.897134445849327, 10), tight_solveGLS_tau0 = c(1813.533891854999, 10),
  tight_fitLinearModel = c(5.254562176969023, 11), tight_fitLinearModel_tau0 = c(2054.528707866363, 11))
out <- lapply(q, function(v) list(Q = v[1], df = v[2], p = pchisq(v[1], v[2], lower.tail = FALSE)))
out$R <- R.version.string
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE), "upper_tail_r460.json")
