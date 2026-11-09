# R provenance for the rare-events GLMM one-click example (shared/canonical-datasets.js key "nissen2007").
# Run from this folder: Rscript hero-nissen2007-reference.R > hero-nissen2007-reference.out
# Writes hero-nissen2007-rows.json (metadat::dat.nissen2007, myocardial infarction counts, row for row).
suppressMessages({library(metafor); library(metadat); library(jsonlite)})
expected <- c(metafor = "5.2.1", metadat = "1.6.0")
for (pkg in names(expected)) stopifnot(as.character(packageVersion(pkg)) == expected[[pkg]])
cat("R", R.version.string, "metafor", as.character(packageVersion("metafor")), "metadat",
    as.character(packageVersion("metadat")), "lme4", as.character(packageVersion("lme4")), "\n")
d <- dat.nissen2007
rows <- data.frame(label = d$study, events_T = d$treat.infarction, n_T = d$treat.total,
                   events_C = d$cont.infarction, n_C = d$cont.total, stringsAsFactors = FALSE)
writeLines(toJSON(rows, dataframe = "rows", pretty = FALSE), "hero-nissen2007-rows.json", useBytes = TRUE)
cat(sprintf("rows k=%d zero_cell_studies=%d double_zero_studies=%d\n", nrow(rows),
    sum(rows$events_T == 0 | rows$events_C == 0), sum(rows$events_T == 0 & rows$events_C == 0)))
fit <- function(model, drop00) suppressWarnings(rma.glmm(measure = "OR", ai = events_T, n1i = n_T,
  ci = events_C, n2i = n_C, data = rows, model = model, method = "ML", drop00 = drop00))
for (dz in c(TRUE, FALSE)) {
  r <- fit("UM.FS", dz)
  cat(sprintf("UM.FS drop00=%s k=%d theta=%.17g se=%.17g OR=%.17g OR_lo=%.17g OR_hi=%.17g tau2=%.17g\n",
      dz, r$k, r$b[1], r$se, exp(r$b[1]), exp(r$ci.lb), exp(r$ci.ub), r$tau2))
}
r <- fit("CM.AL", TRUE)
cat(sprintf("CM.AL drop00=TRUE k=%d theta=%.17g se=%.17g tau2=%.17g\n", r$k, r$b[1], r$se, r$tau2))
