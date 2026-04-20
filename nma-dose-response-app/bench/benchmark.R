args <- commandArgs(trailingOnly = TRUE)
args_full <- commandArgs(trailingOnly = FALSE)
file_arg <- args_full[grep("^--file=", args_full)]
script_path <- if (length(file_arg)) sub("^--file=", "", file_arg[[1]]) else ""
script_dir <- if (nzchar(script_path)) dirname(normalizePath(script_path)) else getwd()
csv_path <- if (length(args) >= 1) args[1] else file.path(script_dir, "benchmark.csv")

make_rng <- function(seed) {
  value <- seed %% 2147483647
  if (value <= 0) value <- value + 2147483646
  function() {
    value <<- (value * 16807) %% 2147483647
    (value - 1) / 2147483646
  }
}

rand <- make_rng(421337)

parse_csv <- function(path) {
  raw <- readLines(path, warn = FALSE)
  if (!length(raw)) return(data.frame())
  rows <- strsplit(raw, ",", fixed = TRUE)
  headers <- tolower(trimws(rows[[1]]))
  idx <- list(
    study = match("study", headers),
    treatment = match("treatment", headers),
    dose = match("dose", headers),
    effect = match("effect", headers),
    se = match("se", headers)
  )
  if (is.na(idx$treatment) || is.na(idx$dose) || is.na(idx$effect)) return(data.frame())
  data <- list()
  for (i in seq(2, length(rows))) {
    row <- rows[[i]]
    study <- if (!is.na(idx$study)) trimws(row[[idx$study]]) else paste0("Study-", i - 1)
    treatment <- trimws(row[[idx$treatment]])
    dose <- suppressWarnings(as.numeric(row[[idx$dose]]))
    effect <- suppressWarnings(as.numeric(row[[idx$effect]]))
    se <- if (!is.na(idx$se)) suppressWarnings(as.numeric(row[[idx$se]])) else NA_real_
    if (!nzchar(treatment) || !is.finite(dose) || !is.finite(effect)) next
    weight <- if (is.finite(se) && se > 0) 1 / (se * se) else 1
    data[[length(data) + 1]] <- data.frame(
      study = study,
      treatment = treatment,
      dose = dose,
      effect = effect,
      se = se,
      weight = weight,
      value = effect,
      stringsAsFactors = FALSE
    )
  }
  if (!length(data)) return(data.frame())
  do.call(rbind, data)
}

group_by_treatment <- function(data) {
  order <- unique(data$treatment)
  groups <- vector("list", length(order))
  names(groups) <- order
  for (i in seq_along(order)) {
    groups[[i]] <- data[data$treatment == order[i], , drop = FALSE]
  }
  groups
}

weighted_mean <- function(points, key = "value") {
  if (!nrow(points)) return(0)
  vals <- points[[key]]
  w <- points$weight
  sum(w * vals) / sum(w)
}

compute_aic <- function(sse, n, k) {
  if (!is.finite(sse) || sse <= 0 || n <= 0) return(NA_real_)
  n * log(sse / n) + 2 * k
}

compute_aicc <- function(aic, n, k) {
  if (!is.finite(aic)) return(NA_real_)
  if (n <= k + 1) return(aic)
  aic + (2 * k * (k + 1)) / (n - k - 1)
}

compute_weighted_stats <- function(points, predict_fn, k) {
  mean_val <- weighted_mean(points, "value")
  sse <- 0
  sst <- 0
  for (i in seq_len(nrow(points))) {
    dose <- points$dose[i]
    pred <- predict_fn(dose)
    resid <- points$value[i] - pred
    sse <- sse + points$weight[i] * resid * resid
    dev <- points$value[i] - mean_val
    sst <- sst + points$weight[i] * dev * dev
  }
  n <- nrow(points)
  rmse <- sqrt(sse / max(n, 1))
  r2 <- if (sst > 0) 1 - sse / sst else NA_real_
  aic <- compute_aic(sse, n, k)
  aicc <- compute_aicc(aic, n, k)
  bic <- if (is.finite(sse) && sse > 0 && n > 0) n * log(sse / n) + k * log(n) else NA_real_
  list(sse = sse, rmse = rmse, r2 = r2, aic = aic, aicc = aicc, bic = bic)
}

weighted_least_squares <- function(design, y, weights) {
  n <- nrow(design)
  p <- ncol(design)
  if (!n || !p) return(NULL)
  w_sqrt <- sqrt(weights)
  xw <- design * w_sqrt
  yw <- y * w_sqrt
  xtwx <- crossprod(xw)
  xtwy <- crossprod(xw, yw)
  betas <- tryCatch(solve(xtwx, xtwy), error = function(e) NULL)
  if (is.null(betas)) return(NULL)
  pred <- as.vector(design %*% betas)
  resid <- y - pred
  sse <- sum(weights * resid * resid)
  list(betas = as.vector(betas), sse = sse)
}

select_knots <- function(doses, count) {
  sorted <- sort(doses)
  unique_vals <- unique(sorted)
  if (length(unique_vals) < 3) return(numeric())
  k <- min(count, length(unique_vals))
  probs <- if (k == 3) c(0.1, 0.5, 0.9) else c(0.05, 0.35, 0.65, 0.95)
  idx <- floor(probs * (length(sorted) - 1)) + 1
  knots <- sorted[idx]
  sort(unique(knots))
}

build_rcs_basis <- function(dose, knots, include_intercept) {
  k <- length(knots)
  if (k < 3) return(numeric())
  last <- knots[k]
  last_minus <- knots[k - 1]
  denom <- if (last - last_minus != 0) last - last_minus else 1
  terms <- numeric()
  if (include_intercept) terms <- c(terms, 1)
  terms <- c(terms, dose)
  if (k > 2) {
    for (j in seq(2, k - 1)) {
      knot <- knots[j]
      term <- pmax(dose - knot, 0)^3
      term_last_minus <- pmax(dose - last_minus, 0)^3
      term_last <- pmax(dose - last, 0)^3
      adj <- term - term_last_minus * ((last - knot) / denom) + term_last * ((last_minus - knot) / denom)
      terms <- c(terms, adj)
    }
  }
  terms
}

build_fp_term <- function(x, power) {
  if (power == 0) return(log(x))
  x^power
}

predict_emax <- function(fit, dose) {
  denom <- fit$ed50 + dose
  if (!is.finite(denom) || denom == 0) return(fit$e0)
  fit$e0 + fit$emax * (dose / denom)
}

predict_hill <- function(fit, dose) {
  pow <- dose^fit$hill
  denom <- (fit$ed50^fit$hill) + pow
  if (!is.finite(denom) || denom == 0) return(fit$e0)
  fit$e0 + fit$emax * (pow / denom)
}

predict_log_linear <- function(fit, dose) {
  fit$e0 + fit$slope * log(dose + fit$shift)
}

predict_rcs <- function(fit, dose) {
  basis <- build_rcs_basis(dose, fit$knots, fit$includeIntercept)
  sum(fit$betas * basis)
}

predict_fp <- function(fit, dose) {
  x <- dose + fit$shift
  terms <- numeric()
  if (fit$includeIntercept) terms <- c(terms, 1)
  term1 <- build_fp_term(x, fit$powers[1])
  terms <- c(terms, term1)
  if (length(fit$powers) > 1) {
    p2 <- fit$powers[2]
    term2 <- if (p2 == fit$powers[1]) term1 * log(x) else build_fp_term(x, p2)
    terms <- c(terms, term2)
  }
  sum(fit$betas * terms)
}

predict_model <- function(fit, dose) {
  if (fit$model == "hill") return(predict_hill(fit, dose))
  if (fit$model == "log_linear") return(predict_log_linear(fit, dose))
  if (fit$model == "rcs") return(predict_rcs(fit, dose))
  if (fit$model == "fp") return(predict_fp(fit, dose))
  predict_emax(fit, dose)
}

finalize_fit <- function(points, fit, model) {
  k_map <- list(emax = 2, hill = 3, log_linear = 1)
  k <- if (!is.null(fit$k)) fit$k else if (!is.null(k_map[[model]])) k_map[[model]] else 2
  stats <- compute_weighted_stats(points, function(dose) predict_model(c(fit, list(model = model)), dose), k)
  if (!is.finite(stats$sse)) return(NULL)
  c(fit, stats, list(model = model))
}

fit_emax <- function(points) {
  doses <- points$dose
  values <- points$value
  weights <- points$weight
  n <- nrow(points)

  max_dose <- max(doses)
  min_pos_dose <- suppressWarnings(min(doses[doses > 0]))
  safe_min_pos <- if (is.finite(min_pos_dose)) min_pos_dose else max(max_dose, 1)

  min_effect <- min(values)
  max_effect <- max(values)
  eff_range <- if (max_effect - min_effect != 0) max_effect - min_effect else 1

  sorted <- points[order(points$dose), ]
  low_slice <- sorted[seq_len(max(1, floor(n * 0.2))), ]
  high_slice <- sorted[seq_len(n)[seq(max(1, floor(n * 0.8)), n)], ]

  base_e0 <- 0
  high_mean <- weighted_mean(high_slice)
  base_emax <- high_mean - base_e0
  if (!is.finite(base_emax) || base_emax == 0) base_emax <- eff_range * 0.8

  log_min <- log10(max(safe_min_pos * 0.2, 0.001))
  log_max <- log10(max(max_dose * 2, safe_min_pos * 0.6))

  evaluate <- function(e0, emax, ed50) {
    sse <- 0
    for (i in seq_len(n)) {
      dose <- doses[i]
      denom <- ed50 + dose
      pred <- if (denom != 0) e0 + emax * (dose / denom) else e0
      resid <- values[i] - pred
      sse <- sse + weights[i] * resid * resid
    }
    sse
  }

  best <- list(
    e0 = base_e0,
    emax = base_emax,
    ed50 = 10^((log_min + log_max) / 2),
    sse = Inf
  )

  trials <- 160 + min(240, n * 40)
  emax_range <- eff_range * 1.5
  for (i in seq_len(trials)) {
    e0 <- 0
    emax <- base_emax + (rand() - 0.5) * emax_range
    ed50 <- 10^(log_min + rand() * (log_max - log_min))
    sse <- evaluate(e0, emax, ed50)
    if (sse < best$sse) {
      best <- list(e0 = e0, emax = emax, ed50 = ed50, sse = sse)
    }
  }

  step_emax <- emax_range * 0.25
  step_ed50 <- (10^log_max - 10^log_min) * 0.25
  for (i in seq_len(80)) {
    e0 <- 0
    emax <- best$emax + (rand() - 0.5) * step_emax
    ed50 <- max(0.0001, best$ed50 + (rand() - 0.5) * step_ed50)
    sse <- evaluate(e0, emax, ed50)
    if (sse < best$sse) {
      best <- list(e0 = e0, emax = emax, ed50 = ed50, sse = sse)
    }
    if (i %% 10 == 0) {
      step_emax <- step_emax * 0.7
      step_ed50 <- step_ed50 * 0.7
    }
  }
  c(best, list(n = n))
}

fit_hill <- function(points) {
  doses <- points$dose
  values <- points$value
  weights <- points$weight
  n <- nrow(points)

  max_dose <- max(doses)
  min_pos_dose <- suppressWarnings(min(doses[doses > 0]))
  safe_min_pos <- if (is.finite(min_pos_dose)) min_pos_dose else max(max_dose, 1)

  min_effect <- min(values)
  max_effect <- max(values)
  eff_range <- if (max_effect - min_effect != 0) max_effect - min_effect else 1

  sorted <- points[order(points$dose), ]
  low_slice <- sorted[seq_len(max(1, floor(n * 0.2))), ]
  high_slice <- sorted[seq_len(n)[seq(max(1, floor(n * 0.8)), n)], ]

  base_e0 <- 0
  high_mean <- weighted_mean(high_slice)
  base_emax <- high_mean - base_e0
  if (!is.finite(base_emax) || base_emax == 0) base_emax <- eff_range * 0.8

  log_min <- log10(max(safe_min_pos * 0.2, 0.001))
  log_max <- log10(max(max_dose * 2, safe_min_pos * 0.6))
  hill_min <- 0.4
  hill_max <- 5.5

  evaluate <- function(e0, emax, ed50, hill) {
    if (ed50 <= 0 || hill <= 0) return(Inf)
    sse <- 0
    for (i in seq_len(n)) {
      dose <- doses[i]
      pow <- dose^hill
      denom <- (ed50^hill) + pow
      pred <- if (denom != 0) e0 + emax * (pow / denom) else e0
      resid <- values[i] - pred
      sse <- sse + weights[i] * resid * resid
    }
    sse
  }

  best <- list(
    e0 = base_e0,
    emax = base_emax,
    ed50 = 10^((log_min + log_max) / 2),
    hill = 1.2,
    sse = Inf
  )

  trials <- 220 + min(320, n * 60)
  emax_range <- eff_range * 1.6
  for (i in seq_len(trials)) {
    e0 <- 0
    emax <- base_emax + (rand() - 0.5) * emax_range
    ed50 <- 10^(log_min + rand() * (log_max - log_min))
    hill <- hill_min + rand() * (hill_max - hill_min)
    sse <- evaluate(e0, emax, ed50, hill)
    if (sse < best$sse) {
      best <- list(e0 = e0, emax = emax, ed50 = ed50, hill = hill, sse = sse)
    }
  }

  step_emax <- emax_range * 0.25
  step_ed50 <- (10^log_max - 10^log_min) * 0.25
  step_hill <- (hill_max - hill_min) * 0.3
  for (i in seq_len(90)) {
    e0 <- 0
    emax <- best$emax + (rand() - 0.5) * step_emax
    ed50 <- max(0.0001, best$ed50 + (rand() - 0.5) * step_ed50)
    hill <- max(0.2, best$hill + (rand() - 0.5) * step_hill)
    sse <- evaluate(e0, emax, ed50, hill)
    if (sse < best$sse) {
      best <- list(e0 = e0, emax = emax, ed50 = ed50, hill = hill, sse = sse)
    }
    if (i %% 10 == 0) {
      step_emax <- step_emax * 0.7
      step_ed50 <- step_ed50 * 0.7
      step_hill <- step_hill * 0.75
    }
  }
  c(best, list(n = n))
}

fit_log_linear <- function(points) {
  doses <- points$dose
  values <- points$value
  weights <- points$weight
  n <- nrow(points)

  min_pos_dose <- suppressWarnings(min(doses[doses > 0]))
  max_dose <- max(doses)
  shift <- if (is.finite(min_pos_dose)) min_pos_dose * 0.5 else max(1, max_dose * 0.1)
  x <- log(doses + shift)

  num <- sum(weights * x * values)
  den <- sum(weights * x * x)
  slope <- if (den != 0) num / den else 0
  intercept <- 0
  pred <- intercept + slope * x
  resid <- values - pred
  sse <- sum(weights * resid * resid)
  list(e0 = intercept, slope = slope, shift = shift, sse = sse, n = n)
}

fit_rcs <- function(points) {
  doses <- points$dose
  values <- points$value
  weights <- points$weight
  knot_count <- min(4, length(unique(doses)))
  knots <- select_knots(doses, knot_count)
  if (length(knots) < 3) return(NULL)
  include_intercept <- FALSE
  design <- t(sapply(doses, function(d) build_rcs_basis(d, knots, include_intercept)))
  result <- weighted_least_squares(design, values, weights)
  if (is.null(result)) return(NULL)
  list(
    betas = result$betas,
    knots = knots,
    includeIntercept = include_intercept,
    sse = result$sse,
    n = nrow(points),
    k = length(result$betas)
  )
}

fit_frac_poly <- function(points) {
  doses <- points$dose
  values <- points$value
  weights <- points$weight
  min_pos_dose <- suppressWarnings(min(doses[doses > 0]))
  max_dose <- max(doses)
  shift <- if (is.finite(min_pos_dose)) min_pos_dose * 0.5 else max(1, max_dose * 0.1)
  x <- doses + shift
  powers <- c(-2, -1, -0.5, 0, 0.5, 1, 2, 3)
  best <- NULL

  try_candidate <- function(p1, p2, is_double) {
    design <- matrix(0, nrow = length(x), ncol = if (is_double) 3 else 2)
    design[, 1] <- 1
    term1 <- build_fp_term(x, p1)
    design[, 2] <- term1
    if (is_double) {
      term2 <- if (p1 == p2) term1 * log(x) else build_fp_term(x, p2)
      design[, 3] <- term2
    }
    result <- weighted_least_squares(design, values, weights)
    if (is.null(result)) return()
    fit <- list(
      betas = result$betas,
      powers = if (is_double) c(p1, p2) else c(p1),
      shift = shift,
      includeIntercept = TRUE,
      sse = result$sse,
      n = nrow(points),
      k = length(result$betas)
    )
    finalized <- finalize_fit(points, fit, "fp")
    if (is.null(finalized)) return()
    if (is.null(best) || (is.finite(finalized$aicc) && finalized$aicc < best$aicc)) {
      best <<- finalized
    }
  }

  for (p1 in powers) {
    try_candidate(p1, NA_real_, FALSE)
  }
  for (p1 in powers) {
    for (p2 in powers) {
      if (p2 < p1) next
      try_candidate(p1, p2, TRUE)
    }
  }
  best
}

fit_model <- function(points, model) {
  if (model == "hill") return(finalize_fit(points, fit_hill(points), "hill"))
  if (model == "log_linear") return(finalize_fit(points, fit_log_linear(points), "log_linear"))
  if (model == "rcs") {
    fit <- fit_rcs(points)
    if (is.null(fit)) return(NULL)
    return(finalize_fit(points, fit, "rcs"))
  }
  if (model == "fp") return(fit_frac_poly(points))
  finalize_fit(points, fit_emax(points), "emax")
}

fit_all_treatments <- function(data) {
  groups <- group_by_treatment(data)
  treatments <- names(groups)
  fits <- list()
  for (treatment in treatments) {
    points <- groups[[treatment]]
    if (nrow(points) < 2) next
    models <- c("emax", "hill", "log_linear", "rcs", "fp")
    fit_list <- list()
    for (model in models) {
      fit <- fit_model(points, model)
      if (!is.null(fit)) fit_list[[length(fit_list) + 1]] <- fit
    }
    if (!length(fit_list)) next
    best <- fit_list[[1]]
    for (fit in fit_list) {
      if (!is.finite(fit$aicc)) next
      if (!is.finite(best$aicc) || fit$aicc < best$aicc) best <- fit
    }
    fits[[treatment]] <- best
  }
  list(fits = fits, treatments = treatments)
}

compute_study_offsets <- function(base_data, fits) {
  study_sum <- list()
  for (i in seq_len(nrow(base_data))) {
    row <- base_data[i, ]
    fit <- fits[[row$treatment]]
    if (is.null(fit)) next
    pred <- predict_model(fit, row$dose)
    if (is.null(study_sum[[row$study]])) {
      study_sum[[row$study]] <- list(sum = 0, weight = 0)
    }
    study_sum[[row$study]]$sum <- study_sum[[row$study]]$sum + row$weight * (row$effect - pred)
    study_sum[[row$study]]$weight <- study_sum[[row$study]]$weight + row$weight
  }
  offsets <- list()
  for (name in names(study_sum)) {
    if (study_sum[[name]]$weight > 0) {
      offsets[[name]] <- study_sum[[name]]$sum / study_sum[[name]]$weight
    }
  }
  offsets
}

apply_study_offsets <- function(base_data, offsets) {
  adjusted <- base_data
  for (i in seq_len(nrow(adjusted))) {
    offset <- offsets[[adjusted$study[i]]]
    if (is.null(offset)) offset <- 0
    adjusted$value[i] <- adjusted$effect[i] - offset
  }
  adjusted
}

fit_network <- function(base_data, iterations = 3) {
  adjusted <- base_data
  fits <- list()
  treatments <- character()
  for (iter in seq_len(iterations)) {
    fit_results <- fit_all_treatments(adjusted)
    fits <- fit_results$fits
    treatments <- fit_results$treatments
    offsets <- compute_study_offsets(base_data, fits)
    adjusted <- apply_study_offsets(base_data, offsets)
  }
  list(fits = fits, treatments = treatments, adjusted = adjusted)
}

compute_range <- function(data) {
  list(minDose = min(data$dose), maxDose = max(data$dose))
}

compute_stats <- function(fits, data, target_dose) {
  stats <- list()
  range <- compute_range(data)
  min_dose <- range$minDose
  max_dose <- if (range$maxDose == range$minDose) range$minDose + 1 else range$maxDose
  steps <- 80
  groups <- group_by_treatment(data)

  for (treatment in names(fits)) {
    fit <- fits[[treatment]]
    points <- groups[[treatment]]
    auc <- 0
    prev_dose <- min_dose
    prev_val <- predict_model(fit, min_dose)
    for (i in seq_len(steps)) {
      dose <- min_dose + (max_dose - min_dose) * (i / steps)
      delta <- dose - prev_dose
      val <- predict_model(fit, dose)
      auc <- auc + (prev_val + val) * 0.5 * delta
      prev_val <- val
      prev_dose <- dose
    }
    target <- predict_model(fit, target_dose)
    stats[[length(stats) + 1]] <- data.frame(
      treatment = treatment,
      model = fit$model,
      aicc = fit$aicc,
      aic = fit$aic,
      bic = fit$bic,
      sse = fit$sse,
      rmse = fit$rmse,
      r2 = fit$r2,
      auc = auc,
      target = target,
      n = nrow(points),
      stringsAsFactors = FALSE
    )
  }
  if (!length(stats)) return(data.frame())
  do.call(rbind, stats)
}

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

data <- parse_csv(csv_path)
if (!nrow(data)) {
  stop("No data parsed.")
}

start_time <- Sys.time()
network_result <- fit_network(data, 3)
stats <- compute_stats(network_result$fits, network_result$adjusted, 10)
elapsed_ms <- as.numeric(difftime(Sys.time(), start_time, units = "secs")) * 1000

output <- list(elapsedMs = elapsed_ms, stats = stats)
json <- to_json(output)
writeLines(json, file.path(dirname(csv_path), "benchmark_r_results.json"))
cat(json, "\n")
