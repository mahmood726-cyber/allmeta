# Diagnostic audit only: native references and parity tolerances stay unchanged.
suppressPackageStartupMessages({library(meta); library(metasens); library(jsonlite)})
inputs <- fromJSON("limit-ma/tests/fixtures/p12-conditioning-input.json")
cat("R:", R.version.string, "meta:", as.character(packageVersion("meta")),
    "metasens:", as.character(packageVersion("metasens")), "\n")
cat("lm.fit default rank tolerance:", deparse(formals(stats::lm.fit)$tol), "\n")
for (name in c("heterogeneous", "heterogeneous_x10", "heterogeneous_x100")) {
  d <- inputs[[name]]
  m <- metagen(d$te, d$se, method.tau = "DL", method.random.ci = "classic")
  fit <- limitmeta(m, method.adjust = "beta0")
  tau2 <- as.numeric(m$tau2); tau <- sqrt(tau2); k <- length(d$te)
  w <- 1 / (d$se^2 + tau2); x <- sqrt(w); Sxx <- sum((x - mean(x))^2)
  terms <- c(1 / var(x) / (k - 1),
             tau2 * mean(w) / var(x) / (k - 1),
             -2 * tau * mean(x) / var(x) / (k - 1))
  centered <- sqrt((1 - tau * mean(x))^2 / Sxx + tau2 / k)
  cat(toJSON(list(name = name, native_se = as.numeric(fit$seTE.adjust),
                 expanded_terms = terms, expanded_se = sqrt(sum(terms)),
                 centered_se = centered,
                 native_centered_normalized_difference = abs(fit$seTE.adjust - centered) / max(1, abs(fit$seTE.adjust))),
             auto_unbox = TRUE, digits = NA), "\n")
}
source <- deparse(getFromNamespace("limitmeta", "metasens"))
cat("Native variance source lines:\n")
hits <- grep("var\\(|cov|seTE.adjust|var.slope|var.intercept", source)
for (i in sort(unique(unlist(lapply(hits, function(j) seq.int(max(1, j - 1), min(length(source), j + 2)))))))
  cat(i, source[i], "\n")
