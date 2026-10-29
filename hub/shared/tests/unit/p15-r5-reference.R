# Run once, before the engine fix: Rscript hub/shared/tests/unit/p15-r5-reference.R
# This writes a required reference fixture, not test logs or a cache.
suppressPackageStartupMessages(library(robumeta))
suppressPackageStartupMessages(library(jsonlite))
invisible(Sys.setlocale("LC_COLLATE", "C"))
invisible(Sys.setlocale("LC_CTYPE", "C"))
dir <- "hub/shared/tests/unit"
out <- file.path(dir, "p15-r5-reference.json")
if (file.exists(out)) stop("Refusing to overwrite the recorded R reference")
inputs <- fromJSON(file.path(dir, "p15-r5-input.json"), simplifyVector = FALSE)
cases <- lapply(inputs, function(rows) list(rows = rows, rho = 0.8))
for (name in c("eigen", "minimal-complex", "complex")) {
  f <- fromJSON(paste0("rve-meta/tests/fixtures/p15-eigen/", name, ".json"), simplifyVector = FALSE)
  cases[[name]] <- f$input
}
results <- lapply(cases, function(input) {
  rows <- input$rows
  d <- data.frame(cluster = vapply(rows, function(r) r$cluster, ""),
                  yi = vapply(rows, function(r) r$yi, 0),
                  vi = vapply(rows, function(r) r$vi, 0))
  p <- length(rows[[1]]$X)
  if (p > 1) for (j in 2:p) d[[paste0("x", j - 1)]] <- vapply(rows, function(r) r$X[[j]], 0)
  formula <- if (p == 1) yi ~ 1 else reformulate(paste0("x", seq_len(p - 1)), response = "yi")
  result <- tryCatch({
    fit <- robu(formula, data = d, studynum = cluster, var.eff.size = vi,
                modelweights = "CORR", rho = input$rho, small = TRUE)
    list(status = "accepted", tau2 = as.numeric(fit$mod_info$tau.sq), table = fit$reg_table)
  }, error = function(e) list(status = "refused", reason = conditionMessage(e)))
  list(input = input, result = result)
})
reference <- list(provenance = list(script = "p15-r5-reference.R", R = R.version.string,
  robumeta = as.character(packageVersion("robumeta")), jsonlite = as.character(packageVersion("jsonlite")),
  LC_COLLATE = Sys.getlocale("LC_COLLATE"), LC_CTYPE = Sys.getlocale("LC_CTYPE"),
  input_md5 = unname(tools::md5sum(file.path(dir, "p15-r5-input.json")))), cases = results)
write_json(reference, out, auto_unbox = TRUE, digits = 17, pretty = TRUE)
cat("Saved fresh R reference:", out, "\n")
cat(R.version.string, "; robumeta", as.character(packageVersion("robumeta")), "\n")
for (name in names(results)) {
  r <- results[[name]]$result
  cat(name, ":", r$status, if (!is.null(r$reason)) r$reason else "", "\n")
}
