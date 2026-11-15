# Reference values for tests/playwright/pairwise-mcid-verdict.spec.mjs (lane pwrest3): the optimal information
# size (OIS) of the TruthCert verdict / GRADE imprecision check, in R 4.6 + metafor, on the bundle's demo data
# (ois_input.json, captured from the page) with a user MCID.
#   sigma2_i = v_i * n_t n_c / (n_t + n_c)   (per-participant variance implied by the study's sampling variance)
#   sigma2   = sum(n_i sigma2_i) / sum(n_i)
#   OIS      = ceiling(4 (z_.975 + z_.80)^2 sigma2 / delta^2 / (1 - I2/100)),  I2 from the DerSimonian-Laird fit
#   delta    = |log(MCID)| for a ratio measure, |MCID| for a difference
# Rscript ois_reference.R  ->  ois_r460.json
suppressMessages({library(metafor); library(jsonlite)})
inp <- fromJSON("ois_input.json", simplifyVector = TRUE)
cases <- list(
  list(set = "SGLT2_ACM", measure = "OR", mcid = 0.90),
  list(set = "SGLT2_ACM", measure = "OR", mcid = 0.80),
  list(set = "BP_REDUCTION", measure = "MD", mcid = 5),
  list(set = "BP_REDUCTION", measure = "MD", mcid = 2))
out <- list(R = R.version.string, metafor = as.character(packageVersion("metafor")), cases = list())
for (cs in cases) {
  s <- inp[[cs$set]]$studies
  es <- if (cs$measure == "OR") escalc("OR", ai = s$events_t, n1i = s$n_t, ci = s$events_c, n2i = s$n_c) else
    escalc("MD", m1i = s$mean_t, sd1i = s$sd_t, n1i = s$n_t, m2i = s$mean_c, sd2i = s$sd_c, n2i = s$n_c)
  ni <- s$n_t + s$n_c
  sigma2 <- sum(ni * es$vi * s$n_t * s$n_c / ni) / sum(ni)
  I2 <- rma(es$yi, es$vi, method = "DL")$I2
  delta <- if (cs$measure == "OR") abs(log(cs$mcid)) else abs(cs$mcid)
  ois <- ceiling(4 * (qnorm(0.975) + qnorm(0.80))^2 * sigma2 / delta^2 / (1 - I2 / 100))
  out$cases[[length(out$cases) + 1]] <- list(set = cs$set, measure = cs$measure, mcid = cs$mcid, delta = delta,
    yi = as.numeric(es$yi), sigma2 = sigma2, I2 = I2, totalN = sum(ni), ois = ois)
}
writeLines(toJSON(out, digits = I(17), auto_unbox = TRUE, pretty = TRUE), "ois_r460.json")
