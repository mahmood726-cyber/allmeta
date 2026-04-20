# ============================================================================
# Dose Response Pro v18.1 - R Validation Script
# ============================================================================
# Purpose: Validate the CLI implementation directly against dosresmeta.
# Optional companion package versions (metafor, mvmeta) are reported when available.
#
# Usage:
#   "C:/Program Files/R/R-4.5.2/bin/Rscript.exe" tests/validate_dose_response_pro.R
#
# Outputs:
#   tests/r_validation_results.json
#   tests/r_validation_results.txt
# ============================================================================

required_packages <- c("dosresmeta", "jsonlite")
optional_packages <- c("metafor", "mvmeta")
missing_packages <- required_packages[!vapply(required_packages, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing_packages) > 0) {
  stop(sprintf("Missing required packages: %s", paste(missing_packages, collapse = ", ")))
}
invisible(lapply(required_packages, function(pkg) library(pkg, character.only = TRUE)))
invisible(lapply(optional_packages, function(pkg) {
  if (requireNamespace(pkg, quietly = TRUE)) {
    library(pkg, character.only = TRUE)
  }
}))

VALIDATION_BETA_TOLERANCE <- 0.02
VALIDATION_SE_TOLERANCE <- 0.05
VALIDATION_TAU2_TOLERANCE <- 0.02
VALIDATION_GRID_LOGRR_TOLERANCE <- 0.02
VALIDATION_GRID_SE_TOLERANCE <- 0.05

# ============================================================================
# TEST DATASETS
# ============================================================================

create_test_data_1 <- function() {
  data.frame(
    study = rep(c("Study1", "Study2", "Study3"), each = 4),
    dose = rep(c(0, 1, 2, 3), 3),
    cases = c(45, 52, 61, 58, 38, 44, 51, NA, 52, 58, 63, 71),
    n = c(50000, 48000, 45000, 40000, 42000, 40000, 38000, NA, 55000, 52000, 48000, 45000),
    stringsAsFactors = FALSE
  )
}

create_test_data_2 <- function() {
  data.frame(
    study = rep(c("Study1", "Study2", "Study3", "Study4"), each = 5),
    dose = rep(c(0, 1, 2, 3, 4), 4),
    cases = c(
      30, 35, 45, 50, 55,
      25, 30, 38, 42, 48,
      28, 33, 40, 46, 52,
      22, 28, 35, 40, 45
    ),
    n = rep(40000, 20),
    stringsAsFactors = FALSE
  )
}

create_test_data_3 <- function() {
  data.frame(
    study = rep(c("Study1", "Study2", "Study3", "Study4", "Study5"), each = 3),
    dose = rep(c(0, 1, 2), 5),
    cases = c(
      20, 40, 60,
      15, 25, 35,
      25, 35, 50,
      30, 50, 75,
      18, 30, 45
    ),
    n = c(
      30000, 30000, 30000,
      25000, 25000, 25000,
      35000, 35000, 35000,
      40000, 40000, 40000,
      28000, 28000, 28000
    ),
    stringsAsFactors = FALSE
  )
}

# ============================================================================
# PATH + CLI HELPERS
# ============================================================================

get_script_dir <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- grep("^--file=", args, value = TRUE)

  if (length(file_arg) == 0) return(getwd())
  normalizePath(dirname(sub("^--file=", "", file_arg[1])), winslash = "/", mustWork = FALSE)
}

get_project_root <- function() {
  normalizePath(file.path(get_script_dir(), ".."), winslash = "/", mustWork = TRUE)
}

package_version_or_na <- function(pkg) {
  if (requireNamespace(pkg, quietly = TRUE)) {
    return(as.character(packageVersion(pkg)))
  }
  NA_character_
}

discover_python <- function() {
  py <- Sys.which("python")
  if (!identical(py, "")) return(py)

  py3 <- Sys.which("python3")
  if (!identical(py3, "")) return(py3)

  stop("Python executable not found in PATH (python/python3).")
}

roundtrip_helper_script <- function() {
  helper <- file.path(get_script_dir(), "strict_r_batch_dosresmeta.R")
  if (!file.exists(helper)) {
    stop(sprintf("Round-trip helper script not found: %s", helper))
  }
  helper
}

source(roundtrip_helper_script(), local = TRUE)

run_cli_analysis <- function(test_data, model = "quadratic") {
  project_root <- get_project_root()
  cli_script <- file.path(project_root, "dose-response-cli.py")
  if (!file.exists(cli_script)) {
    stop(sprintf("CLI script not found: %s", cli_script))
  }

  python_bin <- discover_python()
  input_csv <- tempfile(pattern = "dose_cli_input_", fileext = ".csv")
  output_json <- tempfile(pattern = "dose_cli_output_", fileext = ".json")
  on.exit(unlink(c(input_csv, output_json), force = TRUE), add = TRUE)

  cli_input <- data.frame(
    study_id = test_data$study,
    dose = test_data$dose,
    cases = test_data$cases,
    n = test_data$n,
    stringsAsFactors = FALSE
  )
  write.csv(cli_input, input_csv, row.names = FALSE, na = "")

  old_wd <- getwd()
  on.exit(setwd(old_wd), add = TRUE)
  setwd(project_root)

  args <- c(
    "dose-response-cli.py",
    "--input", input_csv,
    "--output", output_json,
    "--model", model
  )
  cmd_out <- system2(python_bin, args = args, stdout = TRUE, stderr = TRUE)
  status <- attr(cmd_out, "status")
  if (is.null(status)) status <- 0L

  if (!identical(status, 0L)) {
    stop(sprintf(
      "CLI execution failed (status=%d): %s",
      as.integer(status),
      paste(tail(cmd_out, 20), collapse = "\n")
    ))
  }
  if (!file.exists(output_json)) {
    stop("CLI did not produce expected output JSON.")
  }

  parsed <- jsonlite::fromJSON(output_json, simplifyVector = TRUE)
  if (is.null(parsed$beta) || length(parsed$beta) < 3) {
    stop("CLI output missing expected quadratic coefficients.")
  }
  if (is.null(parsed$se) || length(parsed$se) < 3) {
    stop("CLI output missing expected quadratic standard errors.")
  }
  if (is.null(parsed$var)) {
    stop("CLI output missing coefficient variance matrix.")
  }
  parsed
}

# ============================================================================
# PREDICTION GRID HELPERS
# ============================================================================

build_prediction_grid <- function(test_data, reference_dose = 0) {
  max_dose <- max(test_data$dose, na.rm = TRUE)
  upper <- max(reference_dose, max_dose * 1.1)
  seq(reference_dose, upper, length.out = 41)
}

cli_contrast_basis <- function(dose, reference_dose, model = "quadratic") {
  if (identical(model, "linear")) {
    return(c(0, dose - reference_dose))
  }
  c(0, dose - reference_dose, dose^2 - reference_dose^2)
}

compute_cli_prediction_grid <- function(cli_results, prediction_grid, reference_dose = 0, model = "quadratic") {
  beta <- as.numeric(cli_results$beta)
  vcov_matrix <- as.matrix(cli_results$var)
  z_value <- stats::qnorm(0.975)

  rows <- lapply(prediction_grid, function(dose_value) {
    delta <- cli_contrast_basis(dose_value, reference_dose, model)
    logrr <- as.numeric(sum(beta * delta))
    variance <- as.numeric(t(delta) %*% vcov_matrix %*% delta)
    se_logrr <- sqrt(max(variance, 0))

    data.frame(
      dose = as.numeric(dose_value),
      cli_logrr = logrr,
      cli_se_logrr = se_logrr,
      cli_rr = exp(logrr),
      cli_ci_lower = exp(logrr - z_value * se_logrr),
      cli_ci_upper = exp(logrr + z_value * se_logrr),
      stringsAsFactors = FALSE
    )
  })

  do.call(rbind, rows)
}

as_prediction_grid_df <- function(grid_rows) {
  if (is.null(grid_rows) || length(grid_rows) == 0) {
    stop("Prediction grid is empty.")
  }

  if (is.data.frame(grid_rows)) {
    out <- grid_rows
  } else {
    out <- do.call(rbind, lapply(grid_rows, function(row) {
      data.frame(
        dose = as.numeric(row$dose),
        r_logrr = as.numeric(row$logrr),
        r_se_logrr = as.numeric(row$se_logrr),
        r_rr = as.numeric(row$rr),
        r_ci_lower = as.numeric(row$ci_lower),
        r_ci_upper = as.numeric(row$ci_upper),
        stringsAsFactors = FALSE
      )
    }))
  }

  out$dose <- as.numeric(out$dose)
  out$r_logrr <- as.numeric(out$r_logrr %||% out$logrr)
  out$r_se_logrr <- as.numeric(out$r_se_logrr %||% out$se_logrr)
  out$r_rr <- as.numeric(out$r_rr %||% out$rr)
  out$r_ci_lower <- as.numeric(out$r_ci_lower %||% out$ci_lower)
  out$r_ci_upper <- as.numeric(out$r_ci_upper %||% out$ci_upper)
  out
}

compare_prediction_grids <- function(cli_grid, r_grid) {
  cli_grid$key <- sprintf("%.12f", cli_grid$dose)
  r_grid$key <- sprintf("%.12f", r_grid$dose)
  merged <- merge(cli_grid, r_grid, by = "key", all = FALSE, suffixes = c("_cli", "_r"))
  if (nrow(merged) == 0) {
    stop("No overlapping prediction-grid doses between CLI and R outputs.")
  }

  merged$dose <- merged$dose_cli
  merged$logrr_diff <- merged$cli_logrr - merged$r_logrr
  merged$abs_logrr_diff <- abs(merged$logrr_diff)
  merged$se_diff <- merged$cli_se_logrr - merged$r_se_logrr
  merged$abs_se_diff <- abs(merged$se_diff)
  merged$pass <- merged$abs_logrr_diff <= VALIDATION_GRID_LOGRR_TOLERANCE &
    merged$abs_se_diff <= VALIDATION_GRID_SE_TOLERANCE

  list(
    pass = all(merged$pass),
    total_points = nrow(merged),
    passed_points = sum(merged$pass),
    max_abs_logrr_diff = max(merged$abs_logrr_diff, na.rm = TRUE),
    max_abs_se_diff = max(merged$abs_se_diff, na.rm = TRUE),
    points = merged[, c(
      "dose",
      "cli_logrr", "r_logrr", "logrr_diff", "abs_logrr_diff",
      "cli_se_logrr", "r_se_logrr", "se_diff", "abs_se_diff",
      "pass"
    )]
  )
}

# ============================================================================
# VALIDATION FUNCTIONS
# ============================================================================

validate_dosresmeta <- function(test_name, test_data) {
  cat(sprintf("\n--- %s ---\n", test_name))

  tryCatch({
    prediction_grid <- build_prediction_grid(test_data, reference_dose = 0)
    cli_results <- run_cli_analysis(test_data, model = "quadratic")
    roundtrip_payload <- list(
      datasets = list(
        list(
          dataset_id = gsub("[^A-Za-z0-9]+", "_", tolower(test_name)),
          analysis_label = test_name,
          model_type = "quadratic",
          reference_dose = 0,
          ci_level = 0.95,
          prediction_grid = as.numeric(prediction_grid),
          rows = data.frame(
            study = test_data$study,
            type = rep("ir", nrow(test_data)),
            dose = test_data$dose,
            cases = test_data$cases,
            n = test_data$n,
            stringsAsFactors = FALSE
          )
        )
      )
    )
    roundtrip_results <- run_dosresmeta_batch(roundtrip_payload)
    r_fit <- roundtrip_results$results[[1]]
    if (!isTRUE(r_fit$ok)) {
      stop(r_fit$error %||% "dosresmeta round-trip fit failed.")
    }

    our_beta <- as.numeric(cli_results$beta[2:3])
    our_se <- as.numeric(cli_results$se[2:3])
    our_tau2 <- as.numeric(cli_results$tau2)
    r_beta <- as.numeric(unlist(r_fit$beta))
    r_se <- as.numeric(unlist(r_fit$se))

    if (length(r_beta) != 2 || length(r_se) != 2) {
      stop("Unexpected dosresmeta output shape; expected 2 coefficients")
    }

    beta_diff <- our_beta - r_beta
    se_diff <- our_se - r_se

    comparison <- data.frame(
      parameter = c("linear", "quadratic"),
      our_beta = our_beta,
      r_beta = r_beta,
      beta_diff = beta_diff,
      abs_beta_diff = abs(beta_diff),
      our_se = our_se,
      r_se = r_se,
      se_diff = se_diff,
      abs_se_diff = abs(se_diff),
      stringsAsFactors = FALSE
    )

    beta_match <- all(comparison$abs_beta_diff <= VALIDATION_BETA_TOLERANCE)
    se_match <- all(comparison$abs_se_diff <= VALIDATION_SE_TOLERANCE)

    r_tau2 <- as.numeric(r_fit$tau2)
    tau2_diff <- if (is.finite(r_tau2) && is.finite(our_tau2)) as.numeric(our_tau2 - r_tau2) else NA_real_
    tau2_abs_diff <- if (is.finite(tau2_diff)) abs(tau2_diff) else NA_real_
    tau2_match <- isTRUE(is.finite(tau2_abs_diff) && tau2_abs_diff <= VALIDATION_TAU2_TOLERANCE)

    cli_grid <- compute_cli_prediction_grid(cli_results, prediction_grid, reference_dose = 0, model = "quadratic")
    r_grid <- as_prediction_grid_df(r_fit$prediction_grid)
    grid_comparison <- compare_prediction_grids(cli_grid, r_grid)
    grid_match <- isTRUE(grid_comparison$pass)

    pass <- isTRUE(beta_match && se_match && tau2_match && grid_match)

    cat(sprintf("  Beta match (tol %.3f): %s\n", VALIDATION_BETA_TOLERANCE, ifelse(beta_match, "PASS", "FAIL")))
    cat(sprintf("  SE match (tol %.3f): %s\n", VALIDATION_SE_TOLERANCE, ifelse(se_match, "PASS", "FAIL")))
    cat(sprintf("  Tau2 match (tol %.3f): %s\n", VALIDATION_TAU2_TOLERANCE, ifelse(tau2_match, "PASS", "FAIL")))
    cat(sprintf(
      "  Grid match (|logRR|<=%.3f, |SE|<=%.3f): %s\n",
      VALIDATION_GRID_LOGRR_TOLERANCE,
      VALIDATION_GRID_SE_TOLERANCE,
      ifelse(grid_match, "PASS", "FAIL")
    ))

    list(
      name = test_name,
      pass = pass,
      fit_ok = TRUE,
      beta_match = isTRUE(beta_match),
      se_match = isTRUE(se_match),
      tau2_match = isTRUE(tau2_match),
      grid_match = grid_match,
      n_studies = as.integer(r_fit$n_studies),
      n_rows = as.integer(r_fit$n_rows),
      tolerance = list(
        beta = VALIDATION_BETA_TOLERANCE,
        se = VALIDATION_SE_TOLERANCE,
        tau2 = VALIDATION_TAU2_TOLERANCE,
        grid_logrr = VALIDATION_GRID_LOGRR_TOLERANCE,
        grid_se = VALIDATION_GRID_SE_TOLERANCE
      ),
      tau2 = list(
        our = our_tau2,
        r = r_tau2,
        diff = as.numeric(tau2_diff),
        abs_diff = as.numeric(tau2_abs_diff)
      ),
      comparison = comparison,
      grid_comparison = list(
        total_points = grid_comparison$total_points,
        passed_points = grid_comparison$passed_points,
        max_abs_logrr_diff = grid_comparison$max_abs_logrr_diff,
        max_abs_se_diff = grid_comparison$max_abs_se_diff,
        points = grid_comparison$points
      ),
      cli_metadata = list(
        model = cli_results$model,
        n_studies = as.integer(cli_results$n_studies),
        estimation_mode = cli_results$estimation_mode
      ),
      r_metadata = list(
        covariance_mode = r_fit$covariance_mode,
        runtime_ms = as.numeric(r_fit$runtime_ms)
      ),
      message = "PASS requires joint agreement on beta, SE, tau2, and pooled prediction-grid contrasts."
    )
  }, error = function(e) {
    cat(sprintf("  ERROR: %s\n", conditionMessage(e)))
    list(
      name = test_name,
      pass = FALSE,
      fit_ok = FALSE,
      beta_match = FALSE,
      se_match = FALSE,
      tau2_match = FALSE,
      grid_match = FALSE,
      error = conditionMessage(e)
    )
  })
}

run_all_tests <- function() {
  cat("============================================================\n")
  cat("Dose Response Pro v18.1 - R Validation Test Suite\n")
  cat("============================================================\n")

  test_definitions <- list(
    list(name = "Test 1: Simple Linear Trend", data = create_test_data_1()),
    list(name = "Test 2: Quadratic Trend", data = create_test_data_2()),
    list(name = "Test 3: High Heterogeneity", data = create_test_data_3())
  )

  test_results <- lapply(test_definitions, function(td) {
    validate_dosresmeta(td$name, td$data)
  })

  test_pass <- vapply(test_results, function(x) isTRUE(x$pass), logical(1))
  overall_pass <- all(test_pass)

  cat("\n=== VALIDATION SUMMARY ===\n")
  for (i in seq_along(test_definitions)) {
    label <- test_definitions[[i]]$name
    status <- ifelse(test_pass[i], "PASS", "FAIL")
    cat(sprintf("%s: %s\n", label, status))
  }
  cat(sprintf("Overall: %s\n", ifelse(overall_pass, "ALL TESTS PASSED", "SOME TESTS FAILED")))

  list(
    timestamp = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
    r_version = R.version.string,
    comparators = list(
      primary = "dosresmeta",
      companion_versions_reported = optional_packages,
      shared_helper = "tests/strict_r_batch_dosresmeta.R"
    ),
    package_versions = list(
      dosresmeta = as.character(packageVersion("dosresmeta")),
      metafor = package_version_or_na("metafor"),
      mvmeta = package_version_or_na("mvmeta")
    ),
    overall_pass = overall_pass,
    summary = list(
      total_tests = length(test_results),
      passed_tests = sum(test_pass),
      failed_tests = sum(!test_pass),
      grid_passed_tests = sum(vapply(test_results, function(x) isTRUE(x$grid_match), logical(1)))
    ),
    tolerances = list(
      beta = VALIDATION_BETA_TOLERANCE,
      se = VALIDATION_SE_TOLERANCE,
      tau2 = VALIDATION_TAU2_TOLERANCE,
      grid_logrr = VALIDATION_GRID_LOGRR_TOLERANCE,
      grid_se = VALIDATION_GRID_SE_TOLERANCE
    ),
    tests = test_results
  )
}

render_validation_report <- function(results) {
  lines <- c(
    "Dose Response Pro v18.1 - R Validation Results",
    sprintf("Generated: %s", results$timestamp),
    sprintf("R: %s", results$r_version),
    sprintf("Primary comparator: %s", results$comparators$primary),
    sprintf("Shared helper: %s", results$comparators$shared_helper),
    sprintf("dosresmeta: %s | metafor: %s | mvmeta: %s",
      results$package_versions$dosresmeta,
      results$package_versions$metafor,
      results$package_versions$mvmeta
    ),
    sprintf("Overall: %s", ifelse(results$overall_pass, "PASS", "FAIL")),
    sprintf("Total tests: %d | Passed: %d | Failed: %d | Grid passed: %d",
      results$summary$total_tests,
      results$summary$passed_tests,
      results$summary$failed_tests,
      results$summary$grid_passed_tests
    ),
    sprintf(
      "Tolerance(beta): %.3f | Tolerance(SE): %.3f | Tolerance(tau2): %.3f | Tolerance(grid logRR): %.3f | Tolerance(grid SE): %.3f",
      results$tolerances$beta,
      results$tolerances$se,
      results$tolerances$tau2,
      results$tolerances$grid_logrr,
      results$tolerances$grid_se
    ),
    "",
    "Per-test details",
    paste(rep("=", 60), collapse = "")
  )

  for (test in results$tests) {
    status <- ifelse(isTRUE(test$pass), "PASS", "FAIL")
    lines <- c(lines, sprintf("[%s] %s", status, test$name))

    if (!is.null(test$error)) {
      lines <- c(lines, sprintf("  Error: %s", test$error), "")
      next
    }

    lines <- c(lines, sprintf("  Fit OK: %s", ifelse(isTRUE(test$fit_ok), "yes", "no")))
    lines <- c(lines, sprintf("  Beta match: %s", ifelse(isTRUE(test$beta_match), "yes", "no")))
    lines <- c(lines, sprintf("  SE match: %s", ifelse(isTRUE(test$se_match), "yes", "no")))
    lines <- c(lines, sprintf("  Tau2 match: %s", ifelse(isTRUE(test$tau2_match), "yes", "no")))
    lines <- c(lines, sprintf("  Grid match: %s", ifelse(isTRUE(test$grid_match), "yes", "no")))

    cmp <- test$comparison
    for (i in seq_len(nrow(cmp))) {
      lines <- c(lines, sprintf(
        "  %s -> beta diff: %.6f | se diff: %.6f",
        cmp$parameter[i], cmp$beta_diff[i], cmp$se_diff[i]
      ))
    }

    if (!is.null(test$tau2)) {
      lines <- c(lines, sprintf(
        "  tau2(ours): %.6f | tau2(R): %.6f | diff: %.6f",
        test$tau2$our, test$tau2$r, test$tau2$diff
      ))
    }
    if (!is.null(test$grid_comparison)) {
      lines <- c(lines, sprintf(
        "  grid -> passed %d/%d | max |logRR diff| %.6f | max |SE diff| %.6f",
        test$grid_comparison$passed_points,
        test$grid_comparison$total_points,
        test$grid_comparison$max_abs_logrr_diff,
        test$grid_comparison$max_abs_se_diff
      ))
    }
    if (!is.null(test$cli_metadata)) {
      lines <- c(lines, sprintf(
        "  CLI model: %s | CLI studies: %d | mode: %s",
        test$cli_metadata$model,
        test$cli_metadata$n_studies,
        test$cli_metadata$estimation_mode
      ))
    }
    if (!is.null(test$r_metadata)) {
      lines <- c(lines, sprintf(
        "  R covariance mode: %s | runtime_ms: %.2f",
        test$r_metadata$covariance_mode,
        test$r_metadata$runtime_ms
      ))
    }

    lines <- c(lines, "")
  }

  paste(lines, collapse = "\n")
}

write_results <- function(results) {
  script_dir <- get_script_dir()
  json_path <- file.path(script_dir, "r_validation_results.json")
  text_path <- file.path(script_dir, "r_validation_results.txt")

  jsonlite::write_json(results, json_path, pretty = TRUE, auto_unbox = TRUE, na = "null")
  writeLines(render_validation_report(results), con = text_path, useBytes = TRUE)

  cat(sprintf("\nWrote JSON results to: %s\n", json_path))
  cat(sprintf("Wrote text report to: %s\n", text_path))
}

main <- function() {
  results <- run_all_tests()
  write_results(results)

  if (!isTRUE(results$overall_pass)) {
    quit(status = 1, save = "no")
  }
}

main()
