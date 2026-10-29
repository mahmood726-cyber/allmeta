# Run from wt/. This writes a new reference fixture, never validation corpora.
suppressPackageStartupMessages({library(meta); library(metasens); library(jsonlite)})
here <- "hub/shared/tests/unit"
destination <- file.path(here, "p12-rank-reference.json")
if (file.exists(destination)) stop("Refusing to overwrite the native R fixture")
input_path <- file.path(here, "p12-rank-input.json")
input <- fromJSON(input_path, simplifyVector = FALSE)
diagnostic <- function(te, se) {
  m <- metagen(te, se, method.tau = "DL", method.random.ci = "classic")
  inflated <- sqrt(se^2 + m$tau2)
  rank <- function(s) {
    precision <- 1/s
    design <- cbind(1, precision)
    list(rank = lm.fit(design, te/s)$rank,
         relative_residual_norm = sqrt(sum((precision - mean(precision))^2) / sum(precision^2)))
  }
  fit <- tryCatch({
    f <- limitmeta(m, method.adjust = "beta0")
    list(status = "ok", values = list(limit_est = f$TE.adjust, limit_se = f$seTE.adjust,
      re_est = f$TE.random, tau2 = f$tau^2, alpha_r = f$alpha.r, beta_r = f$beta.r,
      Q = f$Q, Q_small = f$Q.small, Q_resid = f$Q.resid, G_squared = f$G.squared,
      te_limit = as.list(f$TE.limit)))
  }, error = function(e) list(status = "refused", reason = conditionMessage(e)))
  list(raw = rank(se), inflated = rank(inflated), tau2 = m$tau2, fit = fit)
}
fits <- lapply(input$cases, function(c) {
  te <- unlist(c$te); se <- unlist(c$se)
  result <- c(list(id = c$id), diagnostic(te, se))
  if (c$id == "loo_rescue") result$deletions <- lapply(seq_along(te), function(i) diagnostic(te[-i], se[-i]))
  result
})
# Serialize doubles at 17 significant digits, including tiny rank diagnostics.
json <- function(x) {
  if (is.null(x)) return("null")
  if (is.list(x)) {
    parts <- vapply(x, json, character(1))
    if (!is.null(names(x))) return(paste0("{", paste(paste0(encodeString(names(x), quote='"'), ":", parts), collapse=","), "}"))
    return(paste0("[", paste(parts, collapse=","), "]"))
  }
  if (length(x) != 1L) return(json(as.list(x)))
  if (is.character(x)) return(encodeString(x, quote='"'))
  if (is.logical(x)) return(if (x) "true" else "false")
  if (is.numeric(x) && is.finite(x)) return(trimws(formatC(x, digits=17, format="g", decimal.mark=".")))
  stop("Non-finite or unsupported native fixture value")
}
reference <- list(provenance = list(R = R.version.string,
  packages = lapply(c("meta", "metasens", "metafor", "jsonlite"), function(p) list(package=p, version=as.character(packageVersion(p)))),
  input_md5 = unname(tools::md5sum(input_path)),
  lm_fit_tolerance = formals(stats::lm.fit)$tol,
  radialregression_source = paste(deparse(getFromNamespace("radialregression", "metasens")), collapse="\n"),
  serialization = "base R; 17 significant digits"), input=input, fits=fits)
writeLines(json(reference), destination, useBytes=TRUE)
cat(R.version.string, "\n")
print(reference$provenance$packages)
cat("Native metasens radialregression source:\n", reference$provenance$radialregression_source, "\n")
for (f in fits) cat(f$id, "raw rank", f$raw$rank, "inflated rank", f$inflated$rank,
  "relative norm", f$inflated$relative_residual_norm, f$fit$status, f$fit$reason, "\n")
