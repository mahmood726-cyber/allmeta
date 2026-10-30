# Fresh native references; output is retained from tempdir after the requested run.
# Centered diagnostics are explicitly separate from native limitmeta outputs.
suppressPackageStartupMessages({library(meta); library(metasens); library(jsonlite)})
inputs <- fromJSON("limit-ma/tests/fixtures/p12-conditioning-input.json", simplifyVector = TRUE)
cases <- lapply(inputs, function(d) {
  m <- metagen(TE = d$te, seTE = d$se, method.tau = "DL", method.random.ci = "classic")
  tau2 <- as.numeric(m$tau2); tau <- sqrt(tau2)
  x <- 1 / sqrt(d$se^2 + tau2)
  Sxx <- sum((x - mean(x))^2)
  native <- tryCatch({
    fit <- limitmeta(m, method.adjust = "beta0")
    list(status = "ok", limit_est = as.numeric(fit$TE.adjust), limit_se = as.numeric(fit$seTE.adjust),
         ci_lo = as.numeric(fit$lower.adjust), ci_hi = as.numeric(fit$upper.adjust))
  }, error = function(e) list(status = "refused", reason = conditionMessage(e)))
  list(input = d, tau2 = tau2, native = native,
       diagnostic = list(rank = lm.fit(cbind(1, x), d$te * x)$rank,
                         raw_rank = lm.fit(cbind(1, 1 / d$se), d$te / d$se)$rank,
                         rank_ratio = sqrt(Sxx / sum(x^2)),
                         centered_se = sqrt((1 - tau * mean(x))^2 / Sxx + tau2 / length(x)),
                         lower_bound = tau2 / length(x)))
})
out <- list(provenance = list(R = R.version.string, meta = as.character(packageVersion("meta")),
                             metasens = as.character(packageVersion("metasens")),
                             metafor = as.character(packageVersion("metafor")),
                             jsonlite = as.character(packageVersion("jsonlite"))), cases = cases)
# Stable parent temp directory, not the per-session R subdirectory removed on exit.
destination <- file.path(dirname(tempdir()), "p12-conditioning-reference.json")
writeLines(toJSON(out, auto_unbox = TRUE, digits = NA, pretty = TRUE, null = "null"), destination)
cat("Reference saved to:", destination, "\n")
cat(toJSON(out, auto_unbox = TRUE, digits = NA, pretty = TRUE, null = "null"), "\n")
cat("Native radial regression source:\n")
print(getFromNamespace("radialregression", "metasens"))
