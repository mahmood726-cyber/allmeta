# Run from wt. Emit the fresh oracle to the OS temporary directory; retain it
# as a fixture only after inspecting the real run. Never replace an old oracle.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
inputs <- fromJSON("tests/fixtures/rev-p05-pm-input.json", simplifyVector = TRUE)
out <- list(provenance = list(R = R.version.string,
  metafor = as.character(packageVersion("metafor")),
  jsonlite = as.character(packageVersion("jsonlite")),
  script = "tests/fixtures/rev-p05-pm-reference.R",
  tol = 1e-13, threshold = 1e-13, maxiter = 100000), cases = list())
for (nm in names(inputs)) {
  d <- inputs[[nm]]
  methods <- if (startsWith(nm, "large_")) "PM" else c("DL", "PM", "REML", "ML", "HE", "HS", "SJ", "EB")
  refs <- list()
  for (method in methods) {
    # PM uses tol for uniroot, NOT threshold (the iterative estimators use it).
    fit <- rma(yi = d$yi, sei = d$sei, method = method,
      control = list(tol = 1e-13, threshold = 1e-13, maxiter = 100000,
                     tau2.max = 100 * max(1, var(d$yi), d$sei^2)))
    refs[[method]] <- list(tau2 = fit$tau2, mu = as.numeric(fit$b), se = fit$se)
    if (method == "PM") {
      w <- 1 / (d$sei^2 + fit$tau2)
      mu <- sum(w * d$yi) / sum(w)
      residual <- sum(w * (d$yi - mu)^2) - (length(d$yi) - 1)
      stopifnot(abs(residual) < 1e-10)
      refs[[method]]$q_minus_df <- residual
      if (length(unique(d$sei)) == 1L) {
        exact <- max(0, var(d$yi) - d$sei[1]^2)
        stopifnot(abs(fit$tau2 - exact) <= 1e-10 * max(1, exact))
      }
    }
  }
  out$cases[[nm]] <- list(yi = d$yi, sei = d$sei, estimates = refs)
}
dest <- file.path(dirname(tempdir()), "rev-p05-pm-reference.json")
json <- toJSON(out, auto_unbox = TRUE, digits = NA, pretty = TRUE)
writeLines(json, dest, useBytes = TRUE)
cat("ORACLE_PATH:", dest, "\n", json, "\n")
