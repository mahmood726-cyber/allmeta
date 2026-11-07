# Independent base-R check of browser-captured SoF calculations. No fitting,
# package downloads, jsonlite, JS evaluation, or hardcoded research results.
# Accept a page.csv path from Playwright's output directory (normally OS temp).
# The legacy default remains relative to this script, not the working directory.
# --self-test checks the checker only; it never emits the release gate marker.

tolerance <- 1e-9 # absolute error, in events per 1,000 (including CI/difference)
numeric_fields <- c("acr", "estimate", "lower", "upper", "comparator",
                    "intervention", "ci_lower", "ci_upper", "difference",
                    "difference_lower", "difference_upper")
output_fields <- numeric_fields[5:11]
fields <- c("source", "case_id", "measure", numeric_fields[1:4], "status",
            output_fields, "display_comparator", "display_intervention",
            "display_difference", "note", "certainty", "effect_display", "host_display")
require_true <- function(ok, message) {
  if (length(ok) != 1L || is.na(ok) || !ok) stop(message, call. = FALSE)
}
near <- function(actual, expected) {
  length(actual) == length(expected) && all(is.finite(actual)) &&
    all(is.finite(expected)) && all(abs(actual - expected) <= tolerance)
}
# R's round() uses ties-to-even; the page promises halves away from zero.
whole <- function(x) sign(x) * floor(abs(x) + 0.5)
display <- function(x) {
  x <- format(whole(x), scientific = FALSE, trim = TRUE)
  if (length(x) == 1L) paste0(x, " per 1,000") else
    paste0(x[1], " [", x[2], ", ", x[3], "] per 1,000")
}
transform_risk <- function(measure, acr, effects) {
  switch(measure,
         RR = acr * effects,
         OR = acr * effects / (1 - acr + acr * effects),
         HR = 1 - (1 - acr)^effects,
         stop("Unknown ratio measure", call. = FALSE))
}
check_row <- function(row) {
  label <- paste(row$source, row$case_id, row$measure, row$acr)
  insist <- function(ok, why) require_true(ok, paste(label, why))
  inputs <- unlist(row[c("acr", "estimate", "lower", "upper")], use.names = FALSE)
  insist(all(is.finite(inputs)), "non-finite inputs")
  insist(row$measure %in% c("RR", "OR", "HR"), "unknown measure")
  insist(row$lower > 0 && row$lower <= row$estimate && row$estimate <= row$upper,
         "invalid ratio effect or CI order")
  insist(row$certainty == "Not selected", "certainty was automatically assigned")
  insist(nzchar(row$effect_display) && row$effect_display == row$host_display,
         "effect display differs from host")
  observed <- unlist(row[output_fields], use.names = FALSE)
  boundary <- row$acr <= 0 || row$acr >= 1
  impossible <- row$measure == "RR" && row$acr * row$upper > 1
  if (boundary || impossible) {
    insist(row$status == "refused", "invalid ACR or impossible risk was accepted")
    insist(all(is.na(observed)), "refusal retained a stale numeric result")
    insist(all(unlist(row[c("display_comparator", "display_intervention", "display_difference")]) == "Unavailable"),
           "refusal retained a stale displayed result")
    message <- if (boundary) "strictly between 0 and 1" else "outside 0"
    insist(grepl(message, row$note, fixed = TRUE), "missing refusal reason")
    return(invisible(TRUE))
  }
  insist(row$status == "ok", "valid combination was refused")
  effects <- unlist(row[c("estimate", "lower", "upper")], use.names = FALSE)
  risks <- transform_risk(row$measure, row$acr, effects) * 1000
  comparator <- row$acr * 1000
  differences <- risks - comparator
  expected <- c(comparator, risks, differences)
  insist(near(observed, expected), "absolute effects / CI / differences disagree with R at 1e-9 per 1,000")
  # Compare visible rounding to the checked full-precision page values. This
  # avoids treating one-ULP algebra differences at a half as a formula error.
  insist(row$display_comparator == display(observed[1]), "comparator display/rounding differs")
  insist(row$display_intervention == display(observed[2:4]), "intervention display/rounding differs")
  insist(row$display_difference == display(observed[5:7]), "difference display/rounding differs")
  invisible(TRUE)
}

check_coverage <- function(data) {
  require_true(nrow(data) == (2 + 3 * 7) * 101, "Incomplete SoF witness row count")
  expected_grid <- expand.grid(case_id = paste0("grid-", 1:7), measure = c("RR", "OR", "HR"),
                               acr_index = 0:100, stringsAsFactors = FALSE)
  expected_live <- expand.grid(case_id = "example", measure = c("OR", "RR"),
                               acr_index = 0:100, stringsAsFactors = FALSE)
  keys <- function(source, case_id, measure, index) paste(source, case_id, measure, index, sep = ":")
  expected <- c(with(expected_grid, keys("formula-fixture", case_id, measure, acr_index)),
                with(expected_live, keys("live-example", case_id, measure, acr_index)))
  index <- round(data$acr * 100)
  require_true(all(is.finite(data$acr)) && all(abs(data$acr - index / 100) < 1e-12), "ACR grid changed")
  actual <- with(data, keys(source, case_id, measure, index))
  require_true(!anyDuplicated(actual) && setequal(actual, expected), "Missing, extra, or duplicate grid cases")
  # Deliberate formula test inputs, independently declared here. These are not
  # study findings. Actual example effects and CIs must come from the page.
  fixtures <- rbind(c(.25, .125, .375), c(.5, .25, .75), c(.8, .4, 1.2),
                    c(1, 1, 1), c(1.25, .625, 1.875), c(2, 1, 3), c(4, 2, 6))
  for (i in 1:7) {
    subset <- data[data$source == "formula-fixture" & data$case_id == paste0("grid-", i), ]
    for (j in 1:3) require_true(all(subset[[c("estimate", "lower", "upper")[j]]] == fixtures[i, j]),
                                "Formula fixture inputs changed")
  }
  for (measure in c("RR", "OR")) {
    subset <- data[data$source == "live-example" & data$measure == measure, ]
    for (field in c("estimate", "lower", "upper", "host_display"))
      require_true(length(unique(subset[[field]])) == 1L, "Host example changed within ACR sweep")
  }
  invisible(TRUE)
}

plant_or_as_rr <- function(control) {
  require_true(control$measure == "OR" && control$status == "ok", "Invalid plant control")
  check_row(control)
  wrong <- control
  risks <- control$acr * unlist(control[c("estimate", "lower", "upper")], use.names = FALSE) * 1000
  differences <- risks - control$acr * 1000
  wrong[output_fields] <- as.list(c(control$acr * 1000, risks, differences))
  wrong$display_intervention <- display(risks)
  wrong$display_difference <- display(differences)
  require_true(!near(unlist(control[output_fields], use.names = FALSE),
                     unlist(wrong[output_fields], use.names = FALSE)), "Plant is not distinguishable from control")
  detected <- tryCatch({ check_row(wrong); FALSE }, error = function(e) TRUE)
  require_true(detected, "OR-as-RR planted defect escaped detection")
  invisible(TRUE)
}

self_test <- function() {
  control <- as.data.frame(setNames(rep(list(""), length(fields)), fields), stringsAsFactors = FALSE)
  control$source <- "checker-unit-fixture"; control$case_id <- "hand-values"; control$measure <- "OR"
  control[numeric_fields[1:4]] <- list(.2, 2, 1, 3)
  control$status <- "ok"; control$certainty <- "Not selected"
  control$effect_display <- control$host_display <- "2 [1, 3]"
  control[output_fields] <- as.list(c(200, 1000 / 3, 200, 3000 / 7, 1000 / 3 - 200, 0, 3000 / 7 - 200))
  control$display_comparator <- "200 per 1,000"
  control$display_intervention <- "333 [200, 429] per 1,000"
  control$display_difference <- "133 [0, 229] per 1,000"
  check_row(control); plant_or_as_rr(control)
  rejects <- function(fn) require_true(tryCatch({ fn(); FALSE }, error = function(e) TRUE), "Checker failed to reject a negative control")
  for (field in output_fields) {
    wrong <- control; wrong[[field]] <- wrong[[field]] + 1e-6
    rejects(function() check_row(wrong))
    wrong[[field]] <- NA_real_; rejects(function() check_row(wrong))
  }
  for (measure in c("RR", "HR")) {
    good <- control; good$measure <- measure
    values <- if (measure == "RR") c(400, 200, 600) else c(360, 200, 488)
    good[output_fields] <- as.list(c(200, values, values - 200))
    good$display_intervention <- display(values); good$display_difference <- display(values - 200)
    check_row(good)
  }
  wrong <- control; wrong$certainty <- "High"; rejects(function() check_row(wrong))
  wrong <- control; wrong$display_intervention <- "334 [200, 429] per 1,000"; rejects(function() check_row(wrong))
  wrong <- control; wrong$host_display <- "wrong host"; rejects(function() check_row(wrong))
  for (acr in c(0, 1)) {
    refused <- control; refused$acr <- acr; refused$status <- "refused"
    refused[output_fields] <- NA_real_
    refused[c("display_comparator", "display_intervention", "display_difference")] <- "Unavailable"
    refused$note <- "Assumed comparator risk must be strictly between 0 and 1."
    check_row(refused)
    wrong <- refused; wrong$status <- "ok"; rejects(function() check_row(wrong))
    wrong <- refused; wrong$intervention <- 0; rejects(function() check_row(wrong))
  }
  refused <- control; refused$measure <- "RR"; refused$acr <- .8; refused$status <- "refused"
  refused[output_fields] <- NA_real_
  refused[c("display_comparator", "display_intervention", "display_difference")] <- "Unavailable"
  refused$note <- "This comparator risk and effect imply a risk outside 0-1."
  check_row(refused)
  wrong <- refused; wrong$status <- "ok"; rejects(function() check_row(wrong))
  require_true(identical(whole(c(-1.5, -.5, .5, 1.5)), c(-2, -1, 1, 2)), "Rounding control failed")
  rejects(function() check_coverage(control))
  # Complete coverage control is in memory only: never written as page evidence.
  grid <- expand.grid(case_id = paste0("grid-", 1:7), measure = c("RR", "OR", "HR"),
                      acr = (0:100) / 100, stringsAsFactors = FALSE)
  live <- expand.grid(case_id = "example", measure = c("RR", "OR"),
                      acr = (0:100) / 100, stringsAsFactors = FALSE)
  grid$source <- "formula-fixture"; live$source <- "live-example"
  coverage <- rbind(grid, live)
  examples <- list(c(.25, .125, .375), c(.5, .25, .75), c(.8, .4, 1.2),
                   c(1, 1, 1), c(1.25, .625, 1.875), c(2, 1, 3), c(4, 2, 6))
  for (j in 1:3) coverage[[c("estimate", "lower", "upper")[j]]] <- vapply(coverage$case_id,
      function(id) if (id == "example") c(2, 1, 3)[j] else examples[[as.integer(sub("grid-", "", id))]][j], numeric(1))
  coverage$host_display <- "checker fixture only"
  check_coverage(coverage)
  rejects(function() check_coverage(coverage[-1, ]))
  wrong <- coverage; wrong[1, ] <- wrong[2, ]; rejects(function() check_coverage(wrong))
  wrong <- coverage; wrong$acr[1] <- .001; rejects(function() check_coverage(wrong))
  wrong <- coverage; wrong$estimate[1] <- 999; rejects(function() check_coverage(wrong))
  cat("SOF_R_SELF_TEST_PASS (checker fixtures only; no browser validation)\n")
}

main <- function() {
  args <- commandArgs(trailingOnly = TRUE)
  if (identical(args, "--self-test")) return(self_test())
  require_true(length(args) <= 1L, "Usage: Rscript sof.R [page.csv | --self-test]")
  script <- sub("^--file=", "", grep("^--file=", commandArgs(), value = TRUE))
  require_true(length(script) == 1L, "Cannot resolve checker location")
  input <- if (length(args) == 1L) args[1] else
    file.path(dirname(normalizePath(script, mustWork = TRUE)), "..", "rchecks-out", "sof", "page.csv")
  require_true(file.exists(input), "Missing page.csv: run features-sof.spec.mjs first")
  data <- read.csv(input, colClasses = "character", check.names = FALSE, na.strings = NULL)
  require_true(identical(names(data), fields), "Unexpected SoF CSV schema")
  for (field in numeric_fields) {
    raw <- data[[field]]
    number <- suppressWarnings(as.numeric(raw))
    require_true(all(raw == "" | is.finite(number)), paste("Invalid numeric field", field))
    data[[field]] <- number
  }
  check_coverage(data)
  for (i in seq_len(nrow(data))) check_row(data[i, , drop = FALSE])
  control <- data[data$source == "formula-fixture" & data$case_id == "grid-6" &
                    data$measure == "OR" & data$acr == .2, , drop = FALSE]
  require_true(nrow(control) == 1L, "Missing OR plant control")
  plant_or_as_rr(control)
  cat("PLANT_DETECTED\n")
  cat(sprintf("Checked %d page rows; RR/OR/HR, CI bounds, differences, rounding and refusals.\n", nrow(data)))
  cat("R_CHECK_PASS\n")
}
tryCatch(main(), error = function(e) {
  cat("R_CHECK_FAIL: ", conditionMessage(e), "\n", sep = "", file = stderr())
  quit(status = 1L)
})
