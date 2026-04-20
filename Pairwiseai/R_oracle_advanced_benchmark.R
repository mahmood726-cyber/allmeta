#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    stop("Package 'jsonlite' is required. Install with install.packages('jsonlite').")
  }
  if (!requireNamespace("metafor", quietly = TRUE)) {
    stop("Package 'metafor' is required. Install with install.packages('metafor').")
  }
})

`%||%` <- function(x, y) {
  if (is.null(x)) y else x
}

as_num <- function(x) {
  val <- suppressWarnings(as.numeric(x))
  if (!is.finite(val)) NA_real_ else val
}

run_three_level <- function(spec) {
  effects <- spec$effects %||% list()
  if (length(effects) < 3) {
    return(list(error = "insufficient_effects"))
  }

  yi <- numeric()
  vi <- numeric()
  cluster_id <- character()
  study_id <- character()

  for (row in effects) {
    yi_i <- as_num(row$yi)
    vi_i <- as_num(row$vi)
    cl_i <- as.character(row$cluster_id %||% "")
    st_i <- as.character(row$study_id %||% "")
    if (!is.finite(yi_i) || !is.finite(vi_i) || vi_i <= 0 || cl_i == "" || st_i == "") {
      return(list(error = "invalid_effect_row"))
    }
    yi <- c(yi, yi_i)
    vi <- c(vi, vi_i)
    cluster_id <- c(cluster_id, cl_i)
    study_id <- c(study_id, st_i)
  }

  dat <- data.frame(
    yi = yi,
    vi = vi,
    cluster_id = cluster_id,
    study_id = study_id,
    stringsAsFactors = FALSE
  )

  fit <- tryCatch(
    metafor::rma.mv(
      yi = yi,
      V = vi,
      random = ~ 1 | cluster_id / study_id,
      method = as.character(spec$method %||% "REML"),
      data = dat
    ),
    error = function(e) e
  )

  if (inherits(fit, "error")) {
    return(list(error = "fit_failed", message = conditionMessage(fit)))
  }

  sigma2 <- as.numeric(fit$sigma2 %||% NA_real_)
  if (length(sigma2) < 2) {
    sigma2 <- c(sigma2, NA_real_)
  }
  tau2_within <- sigma2[[1]]
  tau2_between <- sigma2[[2]]
  tau2_total <- sum(sigma2[is.finite(sigma2)])

  list(
    theta = as.numeric(fit$b[1]),
    se = as.numeric(fit$se[1]),
    ci_lower = as.numeric(fit$ci.lb),
    ci_upper = as.numeric(fit$ci.ub),
    tau2_within = as.numeric(tau2_within),
    tau2_between = as.numeric(tau2_between),
    tau2_total = as.numeric(tau2_total),
    k = nrow(dat),
    n_clusters = length(unique(dat$cluster_id)),
    n_studies = length(unique(paste(dat$cluster_id, dat$study_id, sep = "::")))
  )
}

run_one_stage_ipd_binary <- function(spec) {
  rows <- spec$study_2x2 %||% list()
  if (length(rows) < 2) {
    return(list(error = "insufficient_studies"))
  }

  ai <- numeric()
  bi <- numeric()
  ci <- numeric()
  di <- numeric()

  for (row in rows) {
    ai_i <- as_num(row$ai)
    bi_i <- as_num(row$bi)
    ci_i <- as_num(row$ci)
    di_i <- as_num(row$di)
    if (!all(is.finite(c(ai_i, bi_i, ci_i, di_i))) || any(c(ai_i, bi_i, ci_i, di_i) < 0)) {
      return(list(error = "invalid_2x2_row"))
    }
    ai <- c(ai, ai_i)
    bi <- c(bi, bi_i)
    ci <- c(ci, ci_i)
    di <- c(di, di_i)
  }

  fit <- tryCatch(
    metafor::rma.glmm(
      ai = ai,
      bi = bi,
      ci = ci,
      di = di,
      measure = as.character(spec$measure %||% "OR"),
      model = as.character(spec$model %||% "UM.RS")
    ),
    error = function(e) e
  )

  if (inherits(fit, "error")) {
    return(list(error = "fit_failed", message = conditionMessage(fit)))
  }

  list(
    theta = as.numeric(fit$b[1]),
    se = as.numeric(fit$se[1]),
    ci_lower = as.numeric(fit$ci.lb),
    ci_upper = as.numeric(fit$ci.ub),
    tau2 = as.numeric(fit$tau2 %||% NA_real_),
    k = length(ai)
  )
}

args <- commandArgs(trailingOnly = TRUE)
input_path <- if (length(args) >= 1) args[[1]] else "oracle_input_advanced.json"
output_path <- if (length(args) >= 2) args[[2]] else "oracle_advanced_output.json"

if (!file.exists(input_path)) {
  stop(sprintf("Input JSON not found: %s", input_path))
}

input <- jsonlite::fromJSON(input_path, simplifyVector = FALSE)
datasets <- input$datasets %||% list()
if (length(datasets) == 0) {
  stop("No datasets provided.")
}

results <- lapply(datasets, function(ds) {
  name <- as.character(ds$name %||% "unnamed_dataset")
  out <- list(name = name)
  if (!is.null(ds$three_level)) {
    out$three_level <- run_three_level(ds$three_level)
  }
  if (!is.null(ds$one_stage_ipd_binary)) {
    out$one_stage_ipd_binary <- run_one_stage_ipd_binary(ds$one_stage_ipd_binary)
  }
  out
})

payload <- list(
  generated = format(Sys.time(), "%Y-%m-%d %H:%M:%S %Z"),
  r_version = as.character(getRversion()),
  metafor_version = as.character(utils::packageVersion("metafor")),
  input_path = normalizePath(input_path),
  datasets = results
)

jsonlite::write_json(payload, output_path, auto_unbox = TRUE, pretty = TRUE, null = "null")
cat(sprintf("Wrote advanced oracle benchmark output: %s\n", output_path))
