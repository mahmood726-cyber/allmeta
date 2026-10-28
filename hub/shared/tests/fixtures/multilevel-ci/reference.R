# Run from the repository root: Rscript hub/shared/tests/fixtures/multilevel-ci/reference.R
# New evidence for PR #258; does not replace any historical MoM reference.
suppressPackageStartupMessages(library(jsonlite))
suppressPackageStartupMessages(library(metafor))
folder <- "hub/shared/tests/fixtures/multilevel-ci"

# Reuse ONLY the historical moment estimator, without executing its CLI wrapper.
# The independent oracle below replaces its diagonal final pooling with dense GLS.
legacy_file <- "hub/shared/tests/fixtures/features/multilevel-ma/mlma_mom.R"
for (expr in parse(legacy_file)) {
  if (is.call(expr) && identical(expr[[1]], as.name("<-")) &&
      identical(expr[[2]], as.name("mom"))) eval(expr)
}
stopifnot(exists("mom"))
html <- paste(readLines("multilevel-ma/index.html", warn = FALSE, encoding = "UTF-8"), collapse = "\n")
sample <- regmatches(html, regexec("<textarea[^>]*>([\\s\\S]*?)</textarea>", html, perl = TRUE))[[1]][2]
parse_rows <- function(text) {
  d <- read.csv(text = text, header = FALSE, strip.white = TRUE)
  data.frame(study = as.character(d[[1]]), te = d[[2]], se = d[[3]])
}
tiny <- read.csv("multilevel-ma/tests/fixtures/mlma-tiny.csv")
corpus <- fromJSON("multilevel-ma/validate/corpus/corpus.json", simplifyVector = FALSE)
kon_name <- grep("^dat[.]konstantopoulos2011", names(corpus), value = TRUE)
stopifnot(length(kon_name) == 1)
kon <- corpus[[kon_name]]
inputs <- list(
  bundled = parse_rows(sample),
  tiny = data.frame(study = as.character(tiny$study), te = tiny$effect, se = tiny$SE),
  singleton = parse_rows("1,0.1,0.1\n2,0.5,0.12\n3,-0.3,0.15"),
  zero_study_variance = parse_rows("1,0.2,0.1\n1,0.2,0.12\n2,0.2,0.13\n3,0.2,0.15"),
  konstantopoulos = data.frame(study = vapply(kon, function(r) as.character(r$cluster), ""),
    te = vapply(kon, function(r) r$y, 0), se = sqrt(vapply(kon, function(r) r$v, 0)))
)
configs <- lapply(names(inputs), function(name) {
  rows <- inputs[[name]]
  legacy <- mom(rows)
  V <- diag(rows$se^2 + legacy$tau2_within) +
    legacy$tau2_study * outer(rows$study, rows$study, "==")
  one <- rep(1, nrow(rows))
  info <- as.numeric(crossprod(one, solve(V, one)))
  mu <- as.numeric(crossprod(one, solve(V, rows$te))) / info
  se <- sqrt(1 / info)
  residual <- rows$te - mu
  df <- max(1, length(unique(rows$study)) - 1)
  q <- as.numeric(crossprod(residual, solve(V, residual))) / df
  se_scaled <- sqrt(max(1, q) / info)
  tcrit <- qt(0.975, df)
  pred_se <- sqrt(legacy$tau2_study + legacy$tau2_within + se_scaled^2)
  gls <- list(mu = mu, seMu = se, seMuHK = se_scaled,
    tau2_study = legacy$tau2_study, tau2_within = legacy$tau2_within,
    ci_lb_hk = mu - tcrit * se_scaled, ci_ub_hk = mu + tcrit * se_scaled,
    pi_lb = mu - tcrit * pred_se, pi_ub = mu + tcrit * pred_se)
  reml <- NULL
  if (name %in% c("bundled", "tiny", "konstantopoulos")) {
    rows$id <- seq_len(nrow(rows))
    fit <- rma.mv(yi = te, V = se^2, random = ~ 1 | study/id,
      data = rows, method = "REML", control = list(rel.tol = 1e-10))
    reml <- list(mu = as.numeric(coef(fit)), se = as.numeric(fit$se),
      ciLo = as.numeric(fit$ci.lb), ciHi = as.numeric(fit$ci.ub),
      sigma2Between = fit$sigma2[1], sigma2Within = fit$sigma2[2],
      logLik = as.numeric(logLik(fit)))
  }
  list(id = name, rows = rows[c("study", "te", "se")], legacy = legacy, gls = gls, reml = reml)
})
out <- list(generator = paste0(folder, "/reference.R"),
  versions = list(R = R.version.string, metafor = as.character(packageVersion("metafor")),
    jsonlite = as.character(packageVersion("jsonlite"))),
  oracle = "Unchanged historical moment components; dense solve(V) GLS and full residual quadratic form. REML: metafor::rma.mv.",
  configs = configs)
writeLines(toJSON(out, auto_unbox = TRUE, digits = NA, pretty = TRUE, null = "null"),
  paste0(folder, "/reference.json"))
cat(toJSON(out$versions, auto_unbox = TRUE), "\n")
for (cfg in configs) cat(cfg$id, "legacy MoM mu", cfg$legacy$mu, "GLS MoM mu", cfg$gls$mu,
  "legacy SE", cfg$legacy$seMu, "GLS SE", cfg$gls$seMu, "\n")
