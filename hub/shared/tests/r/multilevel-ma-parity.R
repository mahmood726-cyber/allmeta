# Run from wt/: Rscript hub/shared/tests/r/multilevel-ma-parity.R
# Independent native references; never use JavaScript output or alter published corpora.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(clubSandwich))
suppressPackageStartupMessages(library(jsonlite))
fixture_dir <- "hub/shared/tests/fixtures/multilevel-ma-rpar"
script_path <- "hub/shared/tests/r/multilevel-ma-parity.R"
input_path <- file.path(fixture_dir, "input.json")
output_path <- file.path(fixture_dir, "reference.json")
if (file.exists(output_path)) stop("Refusing to overwrite the recorded R reference")
input <- fromJSON(input_path, simplifyVector = FALSE)

results <- lapply(input$cases, function(case) {
  d <- do.call(rbind, lapply(case$rows, as.data.frame))
  d$id <- seq_len(nrow(d))
  J <- length(unique(d$cluster))
  warnings <- character()
  answer <- withCallingHandlers({
    out <- list(id = case$id, k = nrow(d), J = J)
    if (isTRUE(case$reml) || isTRUE(case$cr2)) {
      f <- rma.mv(y, v, random = ~ 1 | cluster/id, data = d,
                  method = "REML", test = "z", control = list(rel.tol = 1e-10))
      out$reml <- list(mu = as.numeric(coef(f)), se = as.numeric(f$se),
                       ciLo = as.numeric(f$ci.lb), ciHi = as.numeric(f$ci.ub),
                       sigma2Between = f$sigma2[1], sigma2Within = f$sigma2[2],
                       logLik = as.numeric(logLik(f)))
      if (isTRUE(case$cr2)) {
        # Conditional oracle: the JS CR2 entry point receives exactly these R-fitted
        # components. This separates sandwich arithmetic from optimizer stopping.
        cr <- coef_test(f, vcov = "CR2", cluster = d$cluster, test = "Satterthwaite")
        ci <- conf_int(f, vcov = "CR2", cluster = d$cluster, test = "Satterthwaite", level = .95)
        out$cr2Sigma2 <- unname(f$sigma2)
        out$cr2 <- list(estimate = unname(cr$beta[1]), se = cr$SE[1], df = cr$df_Satt[1],
                        t = cr$tstat[1], p = cr$p_Satt[1], lower = ci$CI_L[1], upper = ci$CI_U[1])
      }
    }
    if (!is.null(case$mom)) {
      # With one effect per cluster the app's custom MoM reduces to DL; compare
      # against metafor, not an R transcription of the page's iteration.
      # The repeated-row FE design has identical effects, so both components and
      # the residual scale are exactly zero; the app's floor makes seHK = se.
      z <- rma.uni(y, v, data = d, method = case$mom, test = "z")
      if (case$mom == "DL") {
        stopifnot(J == nrow(d))
        hk <- rma.uni(y, v, data = d, method = "DL", test = "adhoc")
        seHK <- as.numeric(hk$se)
        loHK <- as.numeric(hk$ci.lb); hiHK <- as.numeric(hk$ci.ub)
      } else {
        stopifnot(length(unique(d$y)) == 1L, z$tau2 == 0)
        seHK <- as.numeric(z$se)
        loHK <- as.numeric(coef(z)) - qt(.975, J - 1) * seHK
        hiHK <- as.numeric(coef(z)) + qt(.975, J - 1) * seHK
      }
      mu <- as.numeric(coef(z))
      # The app promises t_(J-1), with J independent clusters (not row count).
      # Do not use predict(z): its default normal PI is a different convention.
      halfPI <- qt(.975, J - 1) * sqrt(z$tau2 + seHK^2)
      out$mom <- list(mu = mu, seMu = as.numeric(z$se), seMuHK = seHK,
                      tau2_study = z$tau2, tau2_within = 0,
                      ciLoZ = as.numeric(z$ci.lb), ciHiZ = as.numeric(z$ci.ub),
                      ciLoHK = loHK, ciHiHK = hiHK, tCrit = qt(.975, J - 1),
                      piLo = mu - halfPI, piHi = mu + halfPI,
                      I2_study = as.numeric(z$I2) / 100, I2_within = 0,
                      I2_sampling = 1 - as.numeric(z$I2) / 100)
      out$momMethod <- paste("metafor::rma.uni", case$mom, "; floored scale; PI qt(.975,J-1)")
    }
    out
  }, warning = function(w) {
    warnings <<- c(warnings, conditionMessage(w))
    invokeRestart("muffleWarning")
  })
  answer$warnings <- as.list(warnings)
  numeric_values <- unlist(answer[c("reml", "cr2", "mom")])
  stopifnot(length(numeric_values) > 0, all(is.finite(numeric_values)))
  cat(case$id, "k=", nrow(d), "J=", J, "warnings:", paste(warnings, collapse = "; "), "\n")
  answer
})
packages <- c("metafor", "metadat", "clubSandwich", "jsonlite", "Matrix", "nlme", "numDeriv")
reference <- list(provenance = list(
  R = R.version.string,
  packages = setNames(lapply(packages, function(p) as.character(packageVersion(p))), packages),
  input_md5 = unname(tools::md5sum(input_path)),
  script_md5 = unname(tools::md5sum(script_path)),
  reml = "metafor::rma.mv(y,v,random=~1|cluster/id,method='REML',test='z',control=list(rel.tol=1e-10))",
  cr2 = "clubSandwich::coef_test/conf_int(vcov='CR2',test='Satterthwaite'); conditional on R sigma2",
  tolerance = "absolute 1e-6 for every new numeric comparison",
  serialization = "jsonlite digits=22; native R doubles"), cases = results)
# Required immutable reference fixture, not a test-output log or cache.
bytes <- charToRaw(paste0(toJSON(reference, auto_unbox = TRUE, digits = 22, pretty = TRUE), "\n"))
con <- file(output_path, "wb"); writeBin(bytes, con); close(con)
cat("Recorded", length(results), "cases in", output_path, "\n")
cat(R.version.string, "\n")
print(reference$provenance$packages)
