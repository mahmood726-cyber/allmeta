#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  required_packages <- c("dosresmeta", "jsonlite")
  missing <- required_packages[!vapply(required_packages, requireNamespace, logical(1), quietly = TRUE)]
  if (length(missing) > 0) {
    stop(sprintf("Missing required packages: %s", paste(missing, collapse = ", ")))
  }
  library(dosresmeta)
  library(jsonlite)
})

MIN_POSITIVE <- 1e-12

normalize_model_type <- function(model_type) {
  key <- tolower(trimws(as.character(model_type %||% "quadratic")))
  if (identical(key, "gls")) key <- "quadratic"
  if (!key %in% c("linear", "quadratic")) {
    stop(sprintf("Unsupported model_type '%s'. Expected linear or quadratic.", key))
  }
  key
}

`%||%` <- function(x, y) {
  if (is.null(x) || length(x) == 0) y else x
}

basis_row <- function(dose, model_type) {
  dose <- as.numeric(dose)
  if (identical(model_type, "linear")) {
    return(c(dose))
  }
  c(dose, dose^2)
}

coerce_numeric_matrix <- function(value) {
  if (is.null(value)) return(NULL)
  if (is.matrix(value)) return(apply(value, c(1, 2), as.numeric))
  if (is.data.frame(value)) return(data.matrix(value))

  if (is.list(value)) {
    rows <- lapply(value, function(row) as.numeric(unlist(row, use.names = FALSE)))
    max_len <- max(vapply(rows, length, integer(1)))
    if (max_len == 0) return(matrix(numeric(0), nrow = 0, ncol = 0))
    padded <- lapply(rows, function(row) {
      if (length(row) < max_len) {
        c(row, rep(NA_real_, max_len - length(row)))
      } else {
        row
      }
    })
    return(do.call(rbind, padded))
  }

  matrix(as.numeric(value), nrow = 1)
}

compute_prediction_grid <- function(beta, vcov_matrix, model_type, doses, reference_dose = 0, ci_level = 0.95) {
  beta <- as.numeric(beta)
  vcov_matrix <- as.matrix(vcov_matrix)
  reference_basis <- basis_row(reference_dose, model_type)
  z_value <- stats::qnorm(0.5 + ci_level / 2)

  lapply(doses, function(dose_value) {
    dose_basis <- basis_row(dose_value, model_type)
    delta <- as.numeric(dose_basis - reference_basis)
    logrr <- as.numeric(sum(beta * delta))
    variance <- as.numeric(t(delta) %*% vcov_matrix %*% delta)
    se_logrr <- sqrt(max(variance, 0))

    list(
      dose = as.numeric(dose_value),
      logrr = logrr,
      se_logrr = se_logrr,
      rr = exp(logrr),
      ci_lower = exp(logrr - z_value * se_logrr),
      ci_upper = exp(logrr + z_value * se_logrr)
    )
  })
}

coerce_rows_df <- function(rows) {
  if (is.null(rows) || length(rows) == 0) {
    stop("Dataset rows are empty.")
  }

  if (is.data.frame(rows)) {
    rows_df <- rows
  } else {
    rows_df <- do.call(
      rbind,
      lapply(rows, function(r) {
        data.frame(
          study = as.character(r$study %||% r$study_id %||% r$id),
          author = as.character(r$author %||% ""),
          type = as.character(r$type %||% "ir"),
          dose = as.numeric(r$dose),
          logrr = as.numeric(r$logrr %||% r$logRR %||% NA_real_),
          se = as.numeric(r$se %||% NA_real_),
          cases = as.numeric(r$cases %||% NA_real_),
          n = as.numeric(r$n %||% NA_real_),
          reference_flag = as.logical(r$reference_flag %||% FALSE),
          row_order = as.numeric(r$row_order %||% NA_real_),
          stringsAsFactors = FALSE
        )
      })
    )
  }

  rename_map <- c(
    study_id = "study",
    id = "study",
    logRR = "logrr"
  )
  for (old_name in names(rename_map)) {
    new_name <- rename_map[[old_name]]
    if (old_name %in% names(rows_df) && !new_name %in% names(rows_df)) {
      names(rows_df)[names(rows_df) == old_name] <- new_name
    }
  }

  default_columns <- list(
    author = "",
    type = "ir",
    logrr = NA_real_,
    se = NA_real_,
    cases = NA_real_,
    n = NA_real_,
    reference_flag = FALSE,
    row_order = NA_real_
  )
  for (column_name in names(default_columns)) {
    if (!column_name %in% names(rows_df)) {
      rows_df[[column_name]] <- default_columns[[column_name]]
    }
  }

  rows_df$study <- as.character(rows_df$study)
  rows_df$author <- as.character(rows_df$author)
  rows_df$type <- as.character(rows_df$type)
  rows_df$dose <- as.numeric(rows_df$dose)
  rows_df$logrr <- as.numeric(rows_df$logrr)
  rows_df$se <- as.numeric(rows_df$se)
  rows_df$cases <- as.numeric(rows_df$cases)
  rows_df$n <- as.numeric(rows_df$n)
  rows_df$reference_flag <- as.logical(rows_df$reference_flag)
  rows_df$row_order <- as.numeric(rows_df$row_order)

  rows_df <- rows_df[!is.na(rows_df$study) & nzchar(rows_df$study) & is.finite(rows_df$dose), , drop = FALSE]
  if (nrow(rows_df) == 0) {
    stop("Dataset rows did not contain any valid study/dose entries.")
  }

  rows_df
}

prepare_count_based_data <- function(rows_df, model_type) {
  required_rows <- if (identical(model_type, "linear")) 2 else 3
  clean <- rows_df[
    is.finite(rows_df$dose) &
      is.finite(rows_df$cases) & rows_df$cases > 0 &
      is.finite(rows_df$n) & rows_df$n > 0,
    ,
    drop = FALSE
  ]

  if (nrow(clean) == 0) {
    stop("Count-based fit requires positive cases and n for all rows.")
  }

  split_rows <- split(clean, clean$study)
  transformed <- lapply(split_rows, function(df) {
    order_key <- ifelse(is.finite(df$row_order), df$row_order, df$dose)
    df <- df[order(order_key, df$dose, seq_len(nrow(df))), , drop = FALSE]

    if (nrow(df) < required_rows) {
      stop(sprintf(
        "Study '%s' needs at least %d rows for a %s dosresmeta fit.",
        as.character(df$study[1]),
        required_rows,
        model_type
      ))
    }

    ref_idx <- which.min(df$dose)
    ref_cases <- df$cases[ref_idx]
    ref_n <- df$n[ref_idx]
    ref_rate <- ref_cases / ref_n
    if (!is.finite(ref_rate) || ref_rate <= 0) {
      stop(sprintf("Study '%s' has an invalid reference risk.", as.character(df$study[1])))
    }

    rr <- (df$cases / df$n) / ref_rate
    logrr <- log(rr)
    se <- rep(0, nrow(df))
    ref_component <- max((1 / ref_cases) - (1 / ref_n), MIN_POSITIVE)
    for (i in seq_len(nrow(df))) {
      if (i != ref_idx) {
        se[i] <- sqrt(max((1 / df$cases[i]) - (1 / df$n[i]) + ref_component, MIN_POSITIVE))
      }
    }

    df$logrr <- logrr
    df$se <- se
    df$reference_flag <- seq_len(nrow(df)) == ref_idx
    df$type[!nzchar(df$type)] <- "ir"
    df
  })

  out <- do.call(rbind, transformed)
  rownames(out) <- NULL
  list(data = out, mode = "gl")
}

normalize_covariance_blocks <- function(covariance_blocks) {
  if (is.null(covariance_blocks) || length(covariance_blocks) == 0) {
    return(list())
  }

  blocks <- covariance_blocks
  if (is.data.frame(blocks)) {
    blocks <- split(blocks, seq_len(nrow(blocks)))
  }

  out <- list()
  for (block in blocks) {
    study_id <- as.character(block$study %||% block$study_id %||% "")
    if (!nzchar(study_id)) next
    matrix_value <- block$matrix %||% block$covariance %||% NULL
    if (is.null(matrix_value)) next
    out[[study_id]] <- coerce_numeric_matrix(matrix_value)
  }
  out
}

prepare_user_covariance_data <- function(rows_df, model_type, covariance_blocks = NULL) {
  required_rows <- if (identical(model_type, "linear")) 2 else 3
  if (!all(is.finite(rows_df$logrr))) {
    stop("User-covariance mode requires finite logrr/logRR values for every row.")
  }
  if (!all(is.finite(rows_df$se) | rows_df$reference_flag)) {
    stop("User-covariance mode requires finite standard errors for non-reference rows.")
  }

  split_rows <- split(rows_df, rows_df$study)
  block_map <- normalize_covariance_blocks(covariance_blocks)
  slist <- list()
  output_rows <- list()

  for (study_id in names(split_rows)) {
    df <- split_rows[[study_id]]
    order_key <- ifelse(is.finite(df$row_order), df$row_order, df$dose)
    df <- df[order(order_key, df$dose, seq_len(nrow(df))), , drop = FALSE]

    if (nrow(df) < required_rows) {
      stop(sprintf(
        "Study '%s' needs at least %d rows for a %s dosresmeta fit.",
        study_id,
        required_rows,
        model_type
      ))
    }

    reference_idx <- which(df$reference_flag)
    if (length(reference_idx) == 0) {
      reference_idx <- which(abs(df$logrr) <= 1e-12 & (!is.finite(df$se) | df$se <= MIN_POSITIVE))
    }
    if (length(reference_idx) == 0) {
      stop(sprintf("Study '%s' is missing an explicit reference row (logRR=0, SE=0).", study_id))
    }

    keep_ref <- reference_idx[1]
    df$reference_flag <- FALSE
    df$reference_flag[keep_ref] <- TRUE
    df$se[df$reference_flag] <- 0
    df$logrr[df$reference_flag] <- 0

    non_ref <- df[!df$reference_flag, , drop = FALSE]
    if (nrow(non_ref) < (required_rows - 1)) {
      stop(sprintf("Study '%s' has too few non-reference rows for a %s fit.", study_id, model_type))
    }
    if (any(!is.finite(non_ref$se) | non_ref$se <= 0)) {
      stop(sprintf("Study '%s' has invalid non-reference SE values.", study_id))
    }

    cov_matrix <- block_map[[study_id]]
    if (is.null(cov_matrix)) {
      cov_matrix <- diag(non_ref$se^2, nrow(non_ref))
    }
    cov_matrix <- coerce_numeric_matrix(cov_matrix)
    if (!all(dim(cov_matrix) == c(nrow(non_ref), nrow(non_ref)))) {
      stop(sprintf(
        "Covariance block for study '%s' has shape %s but expected %dx%d.",
        study_id,
        paste(dim(cov_matrix), collapse = "x"),
        nrow(non_ref),
        nrow(non_ref)
      ))
    }

    df$v <- ifelse(df$reference_flag, 0, pmax(df$se^2, MIN_POSITIVE))
    df$type[!nzchar(df$type)] <- "ir"
    output_rows[[study_id]] <- df
    slist[[length(slist) + 1]] <- cov_matrix
  }

  out <- do.call(rbind, output_rows)
  rownames(out) <- NULL
  list(data = out, Slist = slist, mode = "user")
}

fit_one <- function(dataset) {
  dataset_id <- as.character(dataset$dataset_id %||% paste0("dataset_", format(Sys.time(), "%H%M%S")))
  model_type <- normalize_model_type(dataset$model_type %||% "quadratic")
  reference_dose <- as.numeric(dataset$reference_dose %||% 0)
  ci_level <- as.numeric(dataset$ci_level %||% 0.95)
  if (!is.finite(ci_level) || ci_level <= 0 || ci_level >= 1) {
    ci_level <- 0.95
  }

  out <- list(
    dataset_id = dataset_id,
    analysis_label = as.character(dataset$analysis_label %||% dataset_id),
    ok = FALSE,
    runtime_ms = NA_real_,
    model_type = model_type,
    reference_dose = reference_dose,
    ci_level = ci_level,
    covariance_mode = NA_character_,
    beta = NULL,
    se = NULL,
    vcov = NULL,
    beta_linear = NA_real_,
    beta_quadratic = NA_real_,
    se_linear = NA_real_,
    se_quadratic = NA_real_,
    tau2 = NA_real_,
    n_studies = NA_integer_,
    n_rows = NA_integer_,
    prediction_grid = list(),
    error = NULL
  )

  tryCatch({
    rows_df <- coerce_rows_df(dataset$rows)
    has_count_rows <- any(is.finite(rows_df$cases) & rows_df$cases > 0 & is.finite(rows_df$n) & rows_df$n > 0)
    wants_user_covariance <- identical(tolower(as.character(dataset$covariance_mode %||% "")), "user") ||
      !is.null(dataset$covariance_blocks)

    prep <- if (wants_user_covariance) {
      prepare_user_covariance_data(rows_df, model_type, dataset$covariance_blocks)
    } else if (has_count_rows) {
      prepare_count_based_data(rows_df, model_type)
    } else {
      stop("Need either positive cases/n for count-based dosresmeta or covariance_blocks with logrr/se for user covariance.")
    }

    formula <- if (identical(model_type, "linear")) {
      stats::as.formula(logrr ~ dose)
    } else {
      stats::as.formula(logrr ~ dose + I(dose^2))
    }

    start <- proc.time()[["elapsed"]]
    fit <- if (identical(prep$mode, "user")) {
      dosresmeta::dosresmeta(
        formula = formula,
        id = study,
        type = type,
        se = se,
        data = prep$data,
        covariance = "user",
        Slist = prep$Slist
      )
    } else {
      dosresmeta::dosresmeta(
        formula = formula,
        id = study,
        type = type,
        se = se,
        cases = cases,
        n = n,
        data = prep$data
      )
    }
    elapsed_ms <- (proc.time()[["elapsed"]] - start) * 1000

    beta <- as.numeric(stats::coef(fit))
    vcov_matrix <- as.matrix(stats::vcov(fit))
    se_values <- as.numeric(sqrt(diag(vcov_matrix)))
    psi <- tryCatch(as.matrix(summary(fit)$Psi), error = function(e) matrix(NA_real_, nrow = 1, ncol = 1))
    tau2 <- if (all(!is.finite(diag(psi)))) NA_real_ else mean(diag(psi), na.rm = TRUE)

    prediction_grid <- unlist(dataset$prediction_grid %||% list(), use.names = FALSE)
    prediction_grid <- as.numeric(prediction_grid[is.finite(as.numeric(prediction_grid))])
    if (length(prediction_grid) == 0) {
      max_dose <- max(prep$data$dose, na.rm = TRUE)
      prediction_grid <- seq(reference_dose, max_dose, length.out = 41)
    }
    prediction_grid <- sort(unique(prediction_grid))

    out$ok <- TRUE
    out$runtime_ms <- as.numeric(elapsed_ms)
    out$covariance_mode <- prep$mode
    out$beta <- beta
    out$se <- se_values
    out$vcov <- unname(vcov_matrix)
    out$beta_linear <- if (length(beta) >= 1) beta[[1]] else NA_real_
    out$beta_quadratic <- if (length(beta) >= 2) beta[[2]] else NA_real_
    out$se_linear <- if (length(se_values) >= 1) se_values[[1]] else NA_real_
    out$se_quadratic <- if (length(se_values) >= 2) se_values[[2]] else NA_real_
    out$tau2 <- as.numeric(tau2)
    out$n_studies <- length(unique(prep$data$study))
    out$n_rows <- nrow(prep$data)
    out$prediction_grid <- compute_prediction_grid(
      beta = beta,
      vcov_matrix = vcov_matrix,
      model_type = model_type,
      doses = prediction_grid,
      reference_dose = reference_dose,
      ci_level = ci_level
    )
    out
  }, error = function(e) {
    out$error <- conditionMessage(e)
    out
  })
}

run_dosresmeta_batch <- function(payload) {
  datasets <- payload$datasets %||% list()
  if (is.data.frame(datasets)) {
    datasets <- split(datasets, seq_len(nrow(datasets)))
  }

  results <- lapply(datasets, fit_one)
  list(
    schema_version = "dose-response-r-roundtrip-v1",
    generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
    package_versions = list(
      dosresmeta = as.character(packageVersion("dosresmeta"))
    ),
    input_count = length(datasets),
    results = results
  )
}

main <- function() {
  args <- commandArgs(trailingOnly = TRUE)
  if (length(args) < 2) {
    stop("Usage: Rscript strict_r_batch_dosresmeta.R <input_json> <output_json>")
  }

  input_json <- args[[1]]
  output_json <- args[[2]]
  payload <- fromJSON(input_json, simplifyDataFrame = FALSE)
  response <- run_dosresmeta_batch(payload)
  json_text <- jsonlite::toJSON(response, pretty = TRUE, auto_unbox = TRUE, na = "null")
  writeLines(json_text, con = output_json, useBytes = TRUE)
}

if (sys.nframe() == 0) {
  main()
}
