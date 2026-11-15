# Reference NNTs for the Pairwise AI bundle's R export, Section 10 (lane pwrest3), computed independently of the
# exported script: R 4.6 + metafor on the bundle's demo data (nnt_input.json, captured from the page), with the
# page's default fit (DerSimonian-Laird, Knapp-Hartung with the scale factor floored at 1 = test "adhoc").
#   RR: risk_t = p0 RR;  OR: risk_t = OR p0 / (1 - p0 + OR p0);  HR: risk_t = 1 - (1 - p0)^HR;  ARR = p0 - risk_t
#   RD: ARR = -RD;  NNT = 1 / |ARR|;  p0 = pooled control-group risk (sum events_c / sum n_c), HR: p0 = 0.10 (user)
# Rscript nnt_reference.R  ->  nnt_r460.json
suppressMessages({library(metafor); library(jsonlite)})
inp <- fromJSON("nnt_input.json", simplifyVector = TRUE)
out <- list(R = R.version.string, metafor = as.character(packageVersion("metafor")), cases = list())
for (cs in list(c("SGLT2_ACM", "OR"), c("BINARY_RR", "RR"), c("BINARY_RD", "RD"), c("SGLT2_HR", "HR"))) {
  s <- inp[[cs[1]]]$studies; m <- cs[2]
  if (m == "HR") {
    yi <- log(s$hr); vi <- ((log(s$ci_upper) - log(s$ci_lower)) / (2 * qnorm(0.975)))^2; p0 <- 0.10
  } else {
    es <- escalc(m, ai = s$events_t, n1i = s$n_t, ci = s$events_c, n2i = s$n_c); yi <- es$yi; vi <- es$vi
    p0 <- sum(s$events_c) / sum(s$n_c)
  }
  f <- rma(yi, vi, method = "DL", test = "adhoc")
  est <- c(as.numeric(coef(f)), f$ci.lb, f$ci.ub)
  arr <- switch(m, RD = -est, RR = p0 - p0 * exp(est), OR = p0 - exp(est) * p0 / (1 - p0 + exp(est) * p0),
                HR = p0 - (1 - (1 - p0)^exp(est)))
  out$cases[[length(out$cases) + 1]] <- list(set = cs[1], measure = m, p0 = p0, est = est, arr = arr, nnt = 1 / abs(arr))
}
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE), "nnt_r460.json")
