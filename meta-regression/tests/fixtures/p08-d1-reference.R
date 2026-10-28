# Run from the tree root: Rscript meta-regression/tests/fixtures/p08-d1-reference.R
# Print an oracle fixture for review and retention; never overwrite a reference.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
root <- "meta-regression/tests/fixtures"
values <- function(r) list(
  intercept = r$b[1,1], intercept_se = r$se[1], intercept_pval = r$pval[1],
  intercept_ci_lb = r$ci.lb[1], intercept_ci_ub = r$ci.ub[1],
  slope = r$b[2,1], slope_se = r$se[2], slope_pval = r$pval[2],
  slope_ci_lb = r$ci.lb[2], slope_ci_ub = r$ci.ub[2],
  tau2 = r$tau2, R2 = r$R2, QM = r$QM, QMp = r$QMp, k = r$k
)
cases <- lapply(c("mr-tiny.csv", "mr-heterogeneous.csv"), function(name) {
  path <- file.path(root, name)
  d <- read.csv(path)
  a <- rma.uni(yi = d$yi, vi = d$vi, mods = ~ d$year, method = "PM",
               test = "adhoc", control = list(tol = 1e-12))
  k <- rma.uni(yi = d$yi, vi = d$vi, mods = ~ d$year, method = "PM",
               test = "knha", control = list(tol = 1e-12))
  list(file = name, md5 = unname(tools::md5sum(path)),
       raw_q = sum(residuals(k)^2 / (d$vi + k$tau2)) / (k$k - k$p),
       adhoc = values(a), knha = values(k))
})
reference <- list(
  provenance = list(R = R.version.string, metafor = as.character(packageVersion("metafor")),
                    jsonlite = as.character(packageVersion("jsonlite")),
                    script = "p08-d1-reference.R",
                    script_md5 = unname(tools::md5sum(file.path(root, "p08-d1-reference.R")))),
  method = "PM", test = "adhoc", control = list(tol = 1e-12), cases = cases
)
cat("P08_D1_REFERENCE_BEGIN\n")
cat(toJSON(reference, auto_unbox = TRUE, digits = NA, pretty = TRUE))
cat("\nP08_D1_REFERENCE_END\n")
