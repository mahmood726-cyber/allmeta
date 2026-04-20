#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    stop("Package 'jsonlite' is required. Install with install.packages('jsonlite').")
  }
  if (!requireNamespace("metafor", quietly = TRUE)) {
    stop("Package 'metafor' is required. Install with install.packages('metafor').")
  }
  if (!requireNamespace("metadat", quietly = TRUE)) {
    stop("Package 'metadat' is required for built-in benchmark datasets. Install with install.packages('metadat').")
  }
})

`%||%` <- function(x, y) {
  if (is.null(x)) y else x
}

args <- commandArgs(trailingOnly = TRUE)
input_path <- if (length(args) >= 1) args[[1]] else "oracle_input.json"
output_path <- if (length(args) >= 2) args[[2]] else "oracle_output.json"

PAIRWISE_METHODS <- c(
  "DL", "REML", "ML", "PM", "PMM", "HS", "HSk", "SJ", "HE", "EB", "GENQ", "GENQM",
  "PL", "DL2", "CA", "BMM", "QG"
)

METAFOR_SUPPORTED_METHODS <- c(
  "DL", "REML", "ML", "PM", "PMM", "HS", "HSk", "SJ", "HE", "EB", "GENQ", "GENQM"
)

load_dataset <- function(spec) {
  source_name <- spec$source %||% ""

  if (identical(source_name, "metafor::dat.bcg") || identical(source_name, "metadat::dat.bcg")) {
    dat <- metadat::dat.bcg
    esc <- metafor::escalc(
      measure = "RR",
      ai = tpos,
      bi = tneg,
      ci = cpos,
      di = cneg,
      data = dat
    )
    return(list(
      name = spec$name %||% "bcg",
      yi = esc$yi,
      vi = esc$vi,
      ai = dat$tpos,
      bi = dat$tneg,
      ci = dat$cpos,
      di = dat$cneg,
      measure = "RR"
    ))
  }

  list(
    name = spec$name %||% "custom_dataset",
    yi = unlist(spec$yi),
    vi = unlist(spec$vi),
    ai = unlist(spec$ai %||% numeric()),
    bi = unlist(spec$bi %||% numeric()),
    ci = unlist(spec$ci %||% numeric()),
    di = unlist(spec$di %||% numeric()),
    measure = spec$measure %||% "OR"
  )
}

run_pairwise <- function(ds) {
  out <- list()

  for (m in PAIRWISE_METHODS) {
    if (!(m %in% METAFOR_SUPPORTED_METHODS)) {
      out[[m]] <- list(status = "not_supported_by_metafor")
      next
    }

    fit <- tryCatch({
      if (m %in% c("GENQ", "GENQM")) {
        metafor::rma(yi = ds$yi, vi = ds$vi, method = m, weights = 1 / ds$vi)
      } else {
        metafor::rma(yi = ds$yi, vi = ds$vi, method = m)
      }
    }, error = function(e) e)

    if (inherits(fit, "error")) {
      out[[m]] <- list(error = "fit_failed", message = conditionMessage(fit))
      next
    }

    out[[m]] <- list(
      theta = as.numeric(fit$b[1]),
      se = as.numeric(fit$se[1]),
      tau2 = as.numeric(fit$tau2),
      I2 = as.numeric(fit$I2),
      Q = as.numeric(fit$QE),
      Q_pval = as.numeric(fit$QEp),
      ci_lower = as.numeric(fit$ci.lb),
      ci_upper = as.numeric(fit$ci.ub)
    )
  }

  glmm <- NULL
  if (length(ds$ai) == length(ds$yi) &&
      length(ds$bi) == length(ds$yi) &&
      length(ds$ci) == length(ds$yi) &&
      length(ds$di) == length(ds$yi)) {
    glmm_fit <- tryCatch(
      metafor::rma.glmm(
        ai = ds$ai,
        bi = ds$bi,
        ci = ds$ci,
        di = ds$di,
        measure = ds$measure %||% "OR",
        model = "UM.RS"
      ),
      error = function(e) e
    )

    if (inherits(glmm_fit, "error")) {
      glmm <- list(error = "fit_failed", message = conditionMessage(glmm_fit))
    } else {
      glmm <- list(
        theta = as.numeric(glmm_fit$b[1]),
        se = as.numeric(glmm_fit$se[1]),
        ci_lower = as.numeric(glmm_fit$ci.lb),
        ci_upper = as.numeric(glmm_fit$ci.ub),
        tau2 = as.numeric(glmm_fit$tau2 %||% NA_real_)
      )
    }
  }

  list(
    name = ds$name,
    k = length(ds$yi),
    pairwise = out,
    glmm = glmm
  )
}

if (file.exists(input_path)) {
  input <- jsonlite::fromJSON(input_path, simplifyVector = FALSE)
  dataset_specs <- input$datasets %||% list()
} else {
  dataset_specs <- list(list(name = "bcg_builtin", source = "metadat::dat.bcg"))
}

if (length(dataset_specs) == 0) {
  stop("No datasets provided.")
}

results <- lapply(dataset_specs, function(spec) run_pairwise(load_dataset(spec)))

payload <- list(
  generated = format(Sys.time(), "%Y-%m-%d %H:%M:%S %Z"),
  r_version = as.character(getRversion()),
  metafor_version = as.character(utils::packageVersion("metafor")),
  pairwise_methods_requested = PAIRWISE_METHODS,
  metafor_supported_methods = METAFOR_SUPPORTED_METHODS,
  input_path = if (file.exists(input_path)) normalizePath(input_path) else "builtin:metafor::dat.bcg",
  datasets = results
)

jsonlite::write_json(payload, output_path, auto_unbox = TRUE, pretty = TRUE, null = "null")
cat(sprintf("Wrote oracle benchmark output: %s\n", output_path))
