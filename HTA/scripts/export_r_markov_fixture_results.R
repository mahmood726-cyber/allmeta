#!/usr/bin/env Rscript

suppressWarnings(suppressMessages(library(jsonlite)))

args <- commandArgs(trailingOnly = TRUE)
root <- if (length(args) >= 1) normalizePath(args[[1]], winslash = "/", mustWork = TRUE) else normalizePath(".", winslash = "/", mustWork = TRUE)

reference_root <- file.path(root, "reference-models")
output_root <- file.path(root, "external-comparators", "r")

dir.create(output_root, recursive = TRUE, showWarnings = FALSE)

safe_eval <- function(expr, env_list) {
  if (is.null(expr)) return(0)
  if (is.numeric(expr)) return(as.numeric(expr))
  if (!is.character(expr)) return(0)

  trimmed <- trimws(expr)
  if (trimmed == "") return(0)

  env <- list2env(env_list, parent = baseenv())
  # Allow only required math helpers and if-like helper.
  env$ifelse2 <- function(cond, a, b) ifelse(cond != 0, a, b)
  env$rate_to_prob <- function(rate, time = 1) 1 - exp(-rate * time)
  env$prob_to_rate <- function(prob, time = 1) -log(1 - prob) / time
  env$odds_to_prob <- function(odds) odds / (1 + odds)
  env$prob_to_odds <- function(prob) prob / (1 - prob)
  env$clamp <- function(x, minv, maxv) pmax(minv, pmin(maxv, x))

  normalized <- gsub("\\bif\\s*\\(", "ifelse2(", trimmed, perl = TRUE)

  value <- tryCatch(
    eval(parse(text = normalized), envir = env),
    error = function(e) NA_real_
  )

  if (length(value) == 0 || is.na(value) || !is.finite(value)) {
    return(0)
  }
  as.numeric(value)[1]
}

normalize_scalar <- function(value) {
  if (is.null(value)) return(NULL)
  if (is.list(value) && length(value) == 1) return(normalize_scalar(value[[1]]))
  if (is.numeric(value)) return(as.numeric(value)[1])
  if (is.character(value)) return(as.character(value)[1])
  value
}

normalize_distribution <- function(states) {
  ids <- names(states)
  dist <- list()
  total <- 0
  for (sid in ids) {
    init <- states[[sid]]$initial_probability
    if (is.null(init)) init <- 0
    init <- as.numeric(init)
    if (!is.finite(init)) init <- 0
    dist[[sid]] <- init
    total <- total + init
  }

  if (abs(total - 1) > 1e-9 && total > 0) {
    for (sid in ids) {
      dist[[sid]] <- dist[[sid]] / total
    }
  }

  if (total == 0 && length(ids) > 0) {
    first <- ids[[1]]
    dist[[first]] <- 1
  }
  dist
}

resolve_parameters <- function(parameters, overrides, settings, cycle) {
  context <- list(
    cycle = cycle,
    time = cycle * settings$cycle_length,
    age = settings$starting_age + cycle * settings$cycle_length
  )

  base_values <- list()
  for (pid in names(parameters)) {
    pvalue <- normalize_scalar(parameters[[pid]]$value)
    if (is.numeric(pvalue)) {
      context[[pid]] <- as.numeric(pvalue)
    } else {
      base_values[[pid]] <- pvalue
    }
  }

  pending <- names(base_values)
  if (length(pending) > 0) {
    for (pass in seq_len(max(1, length(pending) * 2))) {
      progressed <- FALSE
      next_pending <- c()
      for (pid in pending) {
        expr <- base_values[[pid]]
        val <- safe_eval(expr, context)
        # If expression contains unknown variable, val may drop to 0; keep simple multi-pass behavior by checking identifiers.
        identifiers <- unique(regmatches(expr, gregexpr("\\b[A-Za-z_][A-Za-z0-9_]*\\b", expr, perl = TRUE))[[1]])
        unresolved <- FALSE
        for (id in identifiers) {
          if (id %in% c("if", "exp", "log", "log10", "sqrt", "abs", "min", "max", "floor", "ceiling", "round", "sin", "cos", "tan",
                        "rate_to_prob", "prob_to_rate", "odds_to_prob", "prob_to_odds", "clamp", "cycle", "time", "age")) next
          if (is.null(context[[id]])) {
            unresolved <- TRUE
            break
          }
        }
        if (unresolved) {
          next_pending <- c(next_pending, pid)
        } else {
          context[[pid]] <- val
          progressed <- TRUE
        }
      }
      pending <- next_pending
      if (!progressed || length(pending) == 0) break
    }
    if (length(pending) > 0) {
      for (pid in pending) context[[pid]] <- 0
    }
  }

  override_map <- overrides
  if (is.null(override_map)) override_map <- list()
  pending_ov <- c()
  for (pid in names(override_map)) {
    ov <- normalize_scalar(override_map[[pid]])
    override_map[[pid]] <- ov
    if (is.numeric(ov)) {
      context[[pid]] <- as.numeric(ov)
    } else if (is.character(ov)) {
      pending_ov <- c(pending_ov, pid)
    }
  }
  if (length(pending_ov) > 0) {
    for (pass in seq_len(max(1, length(pending_ov) * 2))) {
      progressed <- FALSE
      next_pending <- c()
      for (pid in pending_ov) {
        expr <- override_map[[pid]]
        identifiers <- unique(regmatches(expr, gregexpr("\\b[A-Za-z_][A-Za-z0-9_]*\\b", expr, perl = TRUE))[[1]])
        unresolved <- FALSE
        for (id in identifiers) {
          if (id %in% c("if", "exp", "log", "log10", "sqrt", "abs", "min", "max", "floor", "ceiling", "round", "sin", "cos", "tan",
                        "rate_to_prob", "prob_to_rate", "odds_to_prob", "prob_to_odds", "clamp", "cycle", "time", "age")) next
          if (is.null(context[[id]]) && id != pid) {
            unresolved <- TRUE
            break
          }
        }
        if (unresolved) {
          next_pending <- c(next_pending, pid)
        } else {
          context[[pid]] <- safe_eval(expr, context)
          progressed <- TRUE
        }
      }
      pending_ov <- next_pending
      if (!progressed || length(pending_ov) == 0) break
    }
    if (length(pending_ov) > 0) {
      for (pid in pending_ov) {
        if (is.null(context[[pid]])) context[[pid]] <- 0
      }
    }
  }

  context
}

build_transition_matrix <- function(transitions, state_ids, context) {
  matrix <- list()
  for (from_id in state_ids) {
    row <- list()
    for (to_id in state_ids) row[[to_id]] <- 0
    matrix[[from_id]] <- row
  }

  for (tid in names(transitions)) {
    tr <- transitions[[tid]]
    prob <- tr$probability
    from <- tr$from
    to <- tr$to
    if (is.null(matrix[[from]]) || is.null(matrix[[from]][[to]])) next

    if (is.character(prob)) {
      p <- trimws(prob)
      if (tolower(p) == "complement" || toupper(p) == "C") next
      value <- safe_eval(p, context)
    } else {
      value <- as.numeric(prob)
      if (!is.finite(value)) value <- 0
    }
    value <- max(0, min(1, value))
    matrix[[from]][[to]] <- value
  }

  for (tid in names(transitions)) {
    tr <- transitions[[tid]]
    prob <- tr$probability
    from <- tr$from
    to <- tr$to
    if (!is.character(prob)) next
    p <- trimws(prob)
    if (!(tolower(p) == "complement" || toupper(p) == "C")) next
    if (is.null(matrix[[from]]) || is.null(matrix[[from]][[to]])) next

    row_sum <- 0
    for (target in state_ids) {
      if (!(target == to)) row_sum <- row_sum + matrix[[from]][[target]]
    }
    matrix[[from]][[to]] <- max(0, 1 - row_sum)
  }

  for (from_id in state_ids) {
    row_sum <- 0
    for (to_id in state_ids) row_sum <- row_sum + matrix[[from_id]][[to_id]]
    if (row_sum < 1e-6) {
      for (to_id in state_ids) matrix[[from_id]][[to_id]] <- 0
      matrix[[from_id]][[from_id]] <- 1
    } else if (abs(row_sum - 1) > 1e-6) {
      if (row_sum > 1) {
        for (to_id in state_ids) matrix[[from_id]][[to_id]] <- matrix[[from_id]][[to_id]] / row_sum
      } else {
        matrix[[from_id]][[from_id]] <- matrix[[from_id]][[from_id]] + (1 - row_sum)
      }
    }
  }

  matrix
}

discount_factor <- function(cycle, cycle_length, rate) {
  if (is.null(rate) || !is.finite(rate) || rate <= 0) return(1)
  time <- cycle * cycle_length
  (1 + rate) ^ (-time)
}

run_markov <- function(project, overrides = list()) {
  settings <- project$settings
  if (is.null(settings$time_horizon)) settings$time_horizon <- 40
  if (is.null(settings$cycle_length)) settings$cycle_length <- 1
  if (is.null(settings$discount_rate_costs)) settings$discount_rate_costs <- 0.03
  if (is.null(settings$discount_rate_qalys)) settings$discount_rate_qalys <- 0.03
  if (is.null(settings$half_cycle_correction)) settings$half_cycle_correction <- "trapezoidal"
  if (is.null(settings$starting_age)) settings$starting_age <- 50

  cycles <- min(ceiling(settings$time_horizon / settings$cycle_length), 10000)
  states <- project$states
  transitions <- project$transitions
  parameters <- project$parameters
  state_ids <- names(states)
  distribution <- normalize_distribution(states)

  total_costs <- 0
  total_qalys <- 0
  total_ly <- 0

  for (cycle in 0:cycles) {
    context <- resolve_parameters(parameters, overrides, settings, cycle)

    cycle_cost <- 0
    cycle_qaly <- 0
    cycle_ly <- 0

    for (sid in state_ids) {
      occupancy <- distribution[[sid]]
      if (is.null(occupancy) || occupancy <= 0) next
      st <- states[[sid]]

      cost <- if (is.numeric(st$cost)) as.numeric(st$cost) else safe_eval(st$cost, context)
      utility <- if (is.numeric(st$utility)) as.numeric(st$utility) else safe_eval(st$utility, context)

      hcc <- 1
      if (settings$half_cycle_correction == "trapezoidal") {
        if (cycle == 0 || cycle == cycles) hcc <- 0.5
      } else if (settings$half_cycle_correction == "start") {
        if (cycle == 0) hcc <- 0.5
      } else if (settings$half_cycle_correction == "end") {
        if (cycle == cycles) hcc <- 0.5
      }

      ly_weight <- 1
      if (!is.null(st$life_year_weight) && is.numeric(st$life_year_weight) && is.finite(st$life_year_weight)) {
        ly_weight <- as.numeric(st$life_year_weight)
      } else {
        label <- tolower(ifelse(is.null(st$label), sid, st$label))
        appears_dead <- grepl("dead", label, fixed = TRUE) || grepl("death", label, fixed = TRUE)
        if (!is.null(st$type) && st$type == "absorbing" && (appears_dead || utility <= 0)) {
          ly_weight <- 0
        }
      }

      cycle_cost <- cycle_cost + occupancy * cost * settings$cycle_length * hcc
      cycle_qaly <- cycle_qaly + occupancy * utility * settings$cycle_length * hcc
      cycle_ly <- cycle_ly + occupancy * ly_weight * settings$cycle_length * hcc
    }

    total_costs <- total_costs + cycle_cost * discount_factor(cycle, settings$cycle_length, settings$discount_rate_costs)
    total_qalys <- total_qalys + cycle_qaly * discount_factor(cycle, settings$cycle_length, settings$discount_rate_qalys)
    total_ly <- total_ly + cycle_ly * discount_factor(cycle, settings$cycle_length, settings$discount_rate_qalys)

    if (cycle < cycles) {
      tm <- build_transition_matrix(transitions, state_ids, context)
      new_dist <- list()
      for (to_id in state_ids) {
        value <- 0
        for (from_id in state_ids) {
          value <- value + distribution[[from_id]] * tm[[from_id]][[to_id]]
        }
        new_dist[[to_id]] <- value
      }
      total_mass <- sum(unlist(new_dist))
      if (is.finite(total_mass) && total_mass > 1e-9 && abs(total_mass - 1) > 1e-9) {
        for (sid in state_ids) new_dist[[sid]] <- new_dist[[sid]] / total_mass
      }
      distribution <- new_dist
    }
  }

  list(
    total_costs = total_costs,
    total_qalys = total_qalys,
    life_years = total_ly
  )
}

run_all_strategies <- function(project) {
  strategies <- project$strategies
  if (is.null(strategies) || length(strategies) == 0) {
    return(list(base = run_markov(project, list())))
  }
  out <- list()
  for (sid in names(strategies)) {
    ov <- strategies[[sid]]$parameter_overrides
    if (is.null(ov)) ov <- list()
    out[[sid]] <- run_markov(project, ov)
  }
  out
}

model_dirs <- list.dirs(reference_root, recursive = FALSE, full.names = TRUE)
for (model_dir in model_dirs) {
  project_path <- file.path(model_dir, "project.json")
  if (!file.exists(project_path)) next

  model_id <- basename(model_dir)
  project <- fromJSON(project_path, simplifyVector = FALSE)
  strategies <- run_all_strategies(project)

  output_dir <- file.path(output_root, model_id)
  dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)
  output_path <- file.path(output_dir, "results.json")

  payload <- list(
    version = "0.1",
    model_id = model_id,
    generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
    comparator = "R",
    source = "Independent R Markov fixture runner",
    r_version = R.version.string,
    strategies = strategies
  )
  writeLines(toJSON(payload, pretty = TRUE, auto_unbox = TRUE), con = output_path, useBytes = TRUE)
  cat(sprintf("Wrote %s\n", output_path))
}
