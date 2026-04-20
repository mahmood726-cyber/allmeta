args <- commandArgs(trailingOnly = TRUE)
args_full <- commandArgs(trailingOnly = FALSE)
file_arg <- args_full[grep("^--file=", args_full)]
script_path <- if (length(file_arg)) sub("^--file=", "", file_arg[[1]]) else ""
script_dir <- if (nzchar(script_path)) dirname(normalizePath(script_path)) else getwd()
csv_path <- if (length(args) >= 1) args[1] else file.path(script_dir, "benchmark.csv")

escape_json <- function(text) {
  text <- gsub("\\\\", "\\\\\\\\", text)
  text <- gsub("\"", "\\\\\"", text)
  text <- gsub("\n", "\\\\n", text)
  text <- gsub("\r", "\\\\r", text)
  text <- gsub("\t", "\\\\t", text)
  text
}

to_json <- function(x) {
  if (is.null(x)) return("null")
  if (is.list(x) && !is.data.frame(x)) {
    if (length(x) == 0) return("[]")
    if (!is.null(names(x)) && any(nzchar(names(x)))) {
      parts <- character()
      for (name in names(x)) {
        parts <- c(parts, paste0("\"", escape_json(name), "\":", to_json(x[[name]])))
      }
      return(paste0("{", paste(parts, collapse = ","), "}"))
    }
    parts <- vapply(x, to_json, character(1))
    return(paste0("[", paste(parts, collapse = ","), "]"))
  }
  if (is.data.frame(x)) {
    rows <- lapply(seq_len(nrow(x)), function(i) as.list(x[i, ]))
    return(to_json(rows))
  }
  if (is.character(x) && length(x) == 1) {
    return(paste0("\"", escape_json(x), "\""))
  }
  if (is.logical(x) && length(x) == 1) {
    return(if (isTRUE(x)) "true" else "false")
  }
  if (is.numeric(x) && length(x) == 1) {
    if (!is.finite(x)) return("null")
    return(format(x, digits = 15, scientific = FALSE, trim = TRUE))
  }
  if (length(x) > 1) {
    parts <- vapply(as.list(x), to_json, character(1))
    return(paste0("[", paste(parts, collapse = ","), "]"))
  }
  "null"
}

missing <- character()
if (!requireNamespace("dosresmeta", quietly = TRUE)) missing <- c(missing, "dosresmeta")
if (!requireNamespace("netmeta", quietly = TRUE)) missing <- c(missing, "netmeta")

run_with_warnings <- function(expr) {
  warnings <- character()
  result <- tryCatch(
    withCallingHandlers(
      expr,
      warning = function(w) {
        warnings <<- c(warnings, conditionMessage(w))
        invokeRestart("muffleWarning")
      }
    ),
    error = function(e) e
  )
  list(result = result, warnings = warnings)
}

if (length(missing)) {
  output <- list(
    error = "Missing required R packages",
    missingPackages = missing
  )
  json <- to_json(output)
  writeLines(json, file.path(script_dir, "benchmark_r_packages_results.json"))
  cat(json, "\n")
  quit(status = 1)
}

data <- read.csv(csv_path, stringsAsFactors = FALSE)
all_cols <- names(data)
has_record_type <- "record_type" %in% all_cols
if (!has_record_type) {
  data$record_type <- NA_character_
  all_cols <- names(data)
} else {
  data$record_type <- tolower(as.character(data$record_type))
}
has_dose_cols <- all(c("study", "treatment", "dose", "se") %in% all_cols) &&
  (("effect" %in% all_cols) || ("logrr" %in% all_cols))
has_pairwise_cols <- all(c("study", "treat1", "treat2", "TE", "seTE") %in% all_cols)
has_arm_cols <- all(c("study", "treatment", "mean", "sd", "n") %in% all_cols)
if (!has_dose_cols && !has_pairwise_cols && !has_arm_cols) {
  stop("Input missing required columns for netmeta or dosresmeta.")
}

if ("study" %in% all_cols) data$study <- as.character(data$study)
if ("treatment" %in% all_cols) data$treatment <- as.character(data$treatment)
if ("dose" %in% all_cols) data$dose <- suppressWarnings(as.numeric(data$dose))
if ("effect" %in% all_cols) data$effect <- suppressWarnings(as.numeric(data$effect))
if ("logrr" %in% all_cols) data$logrr <- suppressWarnings(as.numeric(data$logrr))
if ("se" %in% all_cols) data$se <- suppressWarnings(as.numeric(data$se))
if ("mean" %in% all_cols) data$mean <- suppressWarnings(as.numeric(data$mean))
if ("sd" %in% all_cols) data$sd <- suppressWarnings(as.numeric(data$sd))
if ("n" %in% all_cols) data$n <- suppressWarnings(as.numeric(data$n))
if ("cases" %in% all_cols) data$cases <- suppressWarnings(as.numeric(data$cases))
if ("lb" %in% all_cols) data$lb <- suppressWarnings(as.numeric(data$lb))
if ("ub" %in% all_cols) data$ub <- suppressWarnings(as.numeric(data$ub))
if ("type" %in% all_cols) data$type <- as.character(data$type)
if ("TE" %in% all_cols) data$TE <- suppressWarnings(as.numeric(data$TE))
if ("seTE" %in% all_cols) data$seTE <- suppressWarnings(as.numeric(data$seTE))
if ("sm" %in% all_cols) data$sm <- as.character(data$sm)

non_empty <- function(x) {
  !is.na(x) & trimws(as.character(x)) != ""
}

data_pairwise <- data.frame()
if (has_pairwise_cols) {
  pairwise_cols <- c("study", "treat1", "treat2", "TE", "seTE", "sm", "record_type")
  pairwise_cols <- pairwise_cols[pairwise_cols %in% all_cols]
  data_pairwise <- data[
    non_empty(data$study) &
      non_empty(data$treat1) &
      non_empty(data$treat2) &
      is.finite(data$TE) &
      is.finite(data$seTE),
    pairwise_cols,
    drop = FALSE
  ]
}
data_arm <- data.frame()
if (has_arm_cols) {
  data_arm <- data[
    non_empty(data$study) &
      non_empty(data$treatment) &
      is.finite(data$mean) &
      is.finite(data$sd) &
      is.finite(data$n),
    c("study", "treatment", "mean", "sd", "n", "record_type"),
    drop = FALSE
  ]
}
data_dose <- data.frame()
if (has_dose_cols) {
  dose_cols <- c(
    "study", "treatment", "dose", "effect", "logrr", "se",
    "type", "cases", "n", "lb", "ub", "record_type"
  )
  dose_cols <- dose_cols[dose_cols %in% all_cols]
  data_dose <- data[
    non_empty(data$study) &
      non_empty(data$treatment) &
      is.finite(data$dose),
    dose_cols,
    drop = FALSE
  ]
}

if (has_record_type) {
  if (nrow(data_pairwise) > 0) {
    data_pairwise <- data_pairwise[data_pairwise$record_type == "pairwise", , drop = FALSE]
  }
  if (nrow(data_arm) > 0) {
    data_arm <- data_arm[data_arm$record_type %in% c("arm", "arm_continuous"), , drop = FALSE]
  }
  if (nrow(data_dose) > 0) {
    data_dose <- data_dose[data_dose$record_type == "dose", , drop = FALSE]
  }
}

start_total <- Sys.time()

net_start <- Sys.time()
net_warnings <- list()
net_input <- list()
comp <- data.frame()
sm_value <- "MD"
if (nrow(data_pairwise) > 0) {
  net_input$type <- "pairwise"
  comp <- data_pairwise[, c("study", "treat1", "treat2", "TE", "seTE"), drop = FALSE]
  net_input$rows <- nrow(comp)
  if ("sm" %in% names(data_pairwise)) {
    sm_values <- unique(trimws(data_pairwise$sm))
    sm_values <- sm_values[sm_values != "" & !is.na(sm_values)]
    if (length(sm_values) > 1) {
      net_input$sm <- sm_values
      net_input$message <- "Multiple sm values in pairwise data."
      comp <- data.frame()
    } else if (length(sm_values) == 1) {
      sm_value <- sm_values[1]
      net_input$sm <- sm_value
    }
  }
} else if (nrow(data_arm) > 0) {
  net_input$type <- "arm_continuous"
  pairwise_fun <- NULL
  netmeta_exports <- tryCatch(getNamespaceExports("netmeta"), error = function(e) character())
  if ("pairwise" %in% netmeta_exports) {
    pairwise_fun <- netmeta::pairwise
  } else if (requireNamespace("meta", quietly = TRUE)) {
    pairwise_fun <- meta::pairwise
  }
  if (is.null(pairwise_fun)) {
    net_warnings[[length(net_warnings) + 1]] <- list(type = "pairwise_error", message = "No pairwise helper available (netmeta/meta).")
  } else {
    pw <- run_with_warnings(
      pairwise_fun(
        treat = treatment,
        mean = mean,
        sd = sd,
        n = n,
        studlab = study,
        data = data_arm,
        sm = "MD"
      )
    )
  }
  if (!is.null(pairwise_fun)) {
    if (inherits(pw$result, "error")) {
      net_warnings[[length(net_warnings) + 1]] <- list(type = "pairwise_error", message = pw$result$message)
    } else {
      net_warnings <- c(net_warnings, lapply(pw$warnings, function(w) list(type = "pairwise_warning", message = w)))
      comp <- pw$result
      comp <- data.frame(
        study = comp$studlab,
        treat1 = comp$treat1,
        treat2 = comp$treat2,
        TE = comp$TE,
        seTE = comp$seTE,
        stringsAsFactors = FALSE
      )
      net_input$rows <- nrow(comp)
    }
  }
} else {
  net_input$type <- "invalid"
  net_input$message <- "Provide pairwise TE/seTE with treat1/treat2 or arm-level mean/sd/n for netmeta."
  net_input$rows <- 0
}
if (nrow(comp) > 0) {
  comp <- comp[is.finite(comp$TE) & is.finite(comp$seTE) & comp$seTE > 0, , drop = FALSE]
}

net_summary <- list()
net_error <- NULL
if (nrow(comp) > 0) {
  net_fit <- run_with_warnings(
    netmeta::netmeta(
      TE = comp$TE,
      seTE = comp$seTE,
      treat1 = comp$treat1,
      treat2 = comp$treat2,
      studlab = comp$study,
      sm = sm_value,
      random = TRUE,
      method.tau = "REML"
    )
  )
  if (inherits(net_fit$result, "error")) {
    net_error <- net_fit$result$message
  } else {
    net_warnings <- c(net_warnings, lapply(net_fit$warnings, function(w) list(type = "netmeta_warning", message = w)))
    get_val <- function(obj, keys) {
      for (key in keys) {
        if (!is.null(obj[[key]])) return(obj[[key]])
      }
      NA_real_
    }
    tau <- get_val(net_fit$result, c("tau", "tau.w"))
    tau2 <- get_val(net_fit$result, c("tau2", "tau2.w"))
    if (!is.finite(tau2) && is.finite(tau)) tau2 <- tau^2
    net_summary <- list(
      studies = length(unique(comp$study)),
      comparisons = nrow(comp),
      tau = tau,
      tau2 = tau2,
      Q = get_val(net_fit$result, c("Q", "Q.net", "Qtotal")),
      df = get_val(net_fit$result, c("df.Q", "df.Q.net", "df.Qtotal")),
      p = get_val(net_fit$result, c("pval.Q", "pval.Q.net", "pval.Qtotal")),
      I2 = get_val(net_fit$result, c("I2", "I2.w"))
    )
  }
} else {
  net_error <- if (!is.null(net_input$message)) net_input$message else "No valid comparisons."
}
net_elapsed <- as.numeric(difftime(Sys.time(), net_start, units = "secs")) * 1000

dose_start <- Sys.time()
dos_results <- list()
dos_nonlin_results <- list()
dos_error <- NULL
dos_warnings <- list()
if (nrow(data_dose) > 0) {
  treatments <- unique(data_dose$treatment)
  treatments <- treatments[treatments != "Placebo"]
  target_dose <- 10

  nonlinear_models <- list(
    list(name = "quadratic", rhs = "dose + I(dose^2)"),
    list(name = "ns_df3", rhs = "splines::ns(dose, df = 3)")
  )
  for (treat in treatments) {
    df_t <- data_dose[data_dose$treatment == treat, , drop = FALSE]
    response_col <- NULL
    if ("logrr" %in% names(df_t) && any(is.finite(df_t$logrr))) {
      response_col <- "logrr"
    } else if ("effect" %in% names(df_t) && any(is.finite(df_t$effect))) {
      response_col <- "effect"
    }
    if (is.null(response_col)) next
    df_t <- df_t[is.finite(df_t$dose) & is.finite(df_t[[response_col]]), , drop = FALSE]
    if ("se" %in% names(df_t)) {
      df_t <- df_t[is.na(df_t$se) | is.finite(df_t$se), , drop = FALSE]
    }
    if (nrow(df_t) < 2) next
    dose_counts <- tapply(df_t$dose, df_t$study, function(x) length(unique(x)))
    within_support <- any(dose_counts >= 2)
    unique_doses <- sort(unique(df_t$dose))
    dose_min <- min(unique_doses)
    dose_max <- max(unique_doses)
    if (!within_support) {
      dos_results[[length(dos_results) + 1]] <- list(
        treatment = treat,
        doseMin = dose_min,
        doseMax = dose_max,
        uniqueDoses = length(unique_doses),
        withinStudyDoseSupport = within_support,
        error = "No within-study multiple doses for this treatment."
      )
      next
    }
    type_arg <- "md"
    if ("type" %in% names(df_t) && any(!is.na(df_t$type))) {
      type_arg <- df_t$type
    } else if (response_col == "logrr") {
      dos_results[[length(dos_results) + 1]] <- list(
        treatment = treat,
        doseMin = dose_min,
        doseMax = dose_max,
        uniqueDoses = length(unique_doses),
        withinStudyDoseSupport = within_support,
        error = "Missing 'type' for logrr dose-response rows."
      )
      next
    }
    id_col <- if ("id" %in% names(df_t)) df_t$id else df_t$study
    formula_obj <- as.formula(paste0(response_col, " ~ dose"))
    fit_args <- list(
      formula = formula_obj,
      id = id_col,
      type = type_arg,
      intercept = FALSE,
      center = FALSE,
      covariance = "indep",
      data = df_t,
      method = "reml",
      proc = "1stage"
    )
    if ("se" %in% names(df_t)) fit_args$se <- df_t$se
    if ("cases" %in% names(df_t) && any(is.finite(df_t$cases))) fit_args$cases <- df_t$cases
    if ("n" %in% names(df_t) && any(is.finite(df_t$n))) fit_args$n <- df_t$n
    if ("lb" %in% names(df_t) && any(is.finite(df_t$lb))) fit_args$lb <- df_t$lb
    if ("ub" %in% names(df_t) && any(is.finite(df_t$ub))) fit_args$ub <- df_t$ub
    fit <- run_with_warnings(do.call(dosresmeta::dosresmeta, fit_args))
    if (inherits(fit$result, "error")) {
      dos_results[[length(dos_results) + 1]] <- list(
        treatment = treat,
        doseMin = dose_min,
        doseMax = dose_max,
        uniqueDoses = length(unique_doses),
        withinStudyDoseSupport = within_support,
        error = fit$result$message
      )
      next
    }
    if (length(fit$warnings)) {
      dos_warnings[[length(dos_warnings) + 1]] <- list(
        treatment = treat,
        type = "fit_warning",
        warnings = fit$warnings
      )
    }
    coefs <- coef(fit$result)
    se_coef <- tryCatch(sqrt(diag(vcov(fit$result))), error = function(e) NULL)
    pred_delta <- tryCatch(predict(fit$result, delta = 1), error = function(e) NULL)
    pred_target <- tryCatch(
      predict(fit$result, newdata = data.frame(dose = target_dose)),
      error = function(e) NULL
    )
    delta1 <- NA_real_
    delta1_ci_lb <- NA_real_
    delta1_ci_ub <- NA_real_
    delta1_se <- NA_real_
    target_pred <- NA_real_
    target_ci_lb <- NA_real_
    target_ci_ub <- NA_real_
    target_se <- NA_real_
    extrapolated <- target_dose < dose_min || target_dose > dose_max
    if (!is.null(pred_delta) && nrow(pred_delta) > 0) {
      delta1 <- pred_delta$pred[1]
      delta1_ci_lb <- pred_delta$ci.lb[1]
      delta1_ci_ub <- pred_delta$ci.ub[1]
      if (is.finite(delta1_ci_lb) && is.finite(delta1_ci_ub)) {
        delta1_se <- (delta1_ci_ub - delta1_ci_lb) / (2 * 1.96)
      }
    }
    if (!is.null(pred_target) && nrow(pred_target) > 0) {
      target_pred <- pred_target$pred[1]
      target_ci_lb <- pred_target$ci.lb[1]
      target_ci_ub <- pred_target$ci.ub[1]
      if (is.finite(target_ci_lb) && is.finite(target_ci_ub)) {
        target_se <- (target_ci_ub - target_ci_lb) / (2 * 1.96)
      }
    }
    dos_results[[length(dos_results) + 1]] <- list(
      treatment = treat,
      doseMin = dose_min,
      doseMax = dose_max,
      uniqueDoses = length(unique_doses),
      withinStudyDoseSupport = within_support,
      coefficients = if (length(coefs)) as.list(coefs) else list(),
      coefficientSe = if (!is.null(se_coef)) as.list(se_coef) else list(),
      delta1 = delta1,
      delta1Se = delta1_se,
      delta1CiLb = delta1_ci_lb,
      delta1CiUb = delta1_ci_ub,
      targetDose = target_dose,
      target = target_pred,
      targetSe = target_se,
      targetCiLb = target_ci_lb,
      targetCiUb = target_ci_ub,
      extrapolated = extrapolated,
      aic = tryCatch(AIC(fit$result), error = function(e) NA_real_)
    )

    for (model in nonlinear_models) {
      min_unique <- if (model$name == "quadratic") 3 else 4
      if (length(unique_doses) < min_unique) {
        dos_nonlin_results[[length(dos_nonlin_results) + 1]] <- list(
          treatment = treat,
          model = model$name,
          error = paste0("Insufficient unique doses (", length(unique_doses), "/", min_unique, ").")
        )
        next
      }
      fit_nl <- run_with_warnings(
      {
        fit_args_nl <- fit_args
        fit_args_nl$formula <- as.formula(paste0(response_col, " ~ ", model$rhs))
        do.call(dosresmeta::dosresmeta, fit_args_nl)
      }
      )
      if (inherits(fit_nl$result, "error")) {
        dos_nonlin_results[[length(dos_nonlin_results) + 1]] <- list(
          treatment = treat,
          model = model$name,
          error = fit_nl$result$message
        )
        next
      }
      if (length(fit_nl$warnings)) {
        dos_warnings[[length(dos_warnings) + 1]] <- list(
          treatment = treat,
          model = model$name,
          type = "fit_warning",
          warnings = fit_nl$warnings
        )
      }
      coefs_nl <- coef(fit_nl$result)
      se_coef_nl <- tryCatch(sqrt(diag(vcov(fit_nl$result))), error = function(e) NULL)
      pred_target <- tryCatch(
        predict(fit_nl$result, newdata = data.frame(dose = target_dose)),
        error = function(e) NULL
      )
      target_pred <- NA_real_
      target_ci_lb <- NA_real_
      target_ci_ub <- NA_real_
      target_se <- NA_real_
      extrapolated <- target_dose < dose_min || target_dose > dose_max
      if (!is.null(pred_target) && nrow(pred_target) > 0) {
        target_pred <- pred_target$pred[1]
        target_ci_lb <- pred_target$ci.lb[1]
        target_ci_ub <- pred_target$ci.ub[1]
        if (is.finite(target_ci_lb) && is.finite(target_ci_ub)) {
          target_se <- (target_ci_ub - target_ci_lb) / (2 * 1.96)
        }
      }
      dos_nonlin_results[[length(dos_nonlin_results) + 1]] <- list(
        treatment = treat,
        model = model$name,
        coefficients = if (length(coefs_nl)) as.list(coefs_nl) else list(),
        coefficientSe = if (!is.null(se_coef_nl)) as.list(se_coef_nl) else list(),
        targetDose = target_dose,
        target = target_pred,
        targetSe = target_se,
        targetCiLb = target_ci_lb,
        targetCiUb = target_ci_ub,
        extrapolated = extrapolated,
        aic = tryCatch(AIC(fit_nl$result), error = function(e) NA_real_)
      )
    }
  }
} else {
  dos_error <- "No dose-response rows detected (study,treatment,dose,effect,se)."
}
dos_elapsed <- as.numeric(difftime(Sys.time(), dose_start, units = "secs")) * 1000

elapsed_ms <- as.numeric(difftime(Sys.time(), start_total, units = "secs")) * 1000

output <- list(
  elapsedMs = elapsed_ms,
  packages = list(
    dosresmeta = as.character(utils::packageVersion("dosresmeta")),
    netmeta = as.character(utils::packageVersion("netmeta"))
  ),
  netmeta = list(
    elapsedMs = net_elapsed,
    summary = net_summary,
    warnings = net_warnings,
    input = net_input,
    error = net_error
  ),
  dosresmeta = list(
    elapsedMs = dos_elapsed,
    results = dos_results,
    nonlinearResults = dos_nonlin_results,
    warnings = dos_warnings,
    error = dos_error
  )
)

json <- to_json(output)
writeLines(json, file.path(script_dir, "benchmark_r_packages_results.json"))
cat(json, "\n")
