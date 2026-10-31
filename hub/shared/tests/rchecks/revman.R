# Independent RevMan witness gate. Base R for files; metafor for statistics.
# No JS calculations, JSON parser, or expected pooled numbers are used here.
# --self-test checks the checker only and NEVER prints the acceptance sentinel.
args <- commandArgs(trailingOnly = TRUE)
script_arg <- grep("^--file=", commandArgs(), value = TRUE)
if (length(script_arg) != 1L) stop("Run this file with Rscript")
here <- dirname(normalizePath(sub("^--file=", "", script_arg), mustWork = TRUE))
fixtures <- file.path(here, "..", "fixtures", "revman")
out <- file.path(here, "..", "rchecks-out", "revman")
if (!requireNamespace("metafor", quietly = TRUE)) stop("metafor is required")
read_chars <- function(path, sep = ",") {
  if (!file.exists(path)) stop("Missing witness/source: ", path)
  read.table(path, header = TRUE, sep = sep, quote = '"', comment.char = "",
             check.names = FALSE, colClasses = "character", na.strings = NULL,
             encoding = "UTF-8", stringsAsFactors = FALSE)
}
cases <- read_chars(file.path(fixtures, "rcheck-cases.txt"), "\t")
fields <- list(binary = c("ai", "n1i", "ci", "n2i"),
               continuous = c("m1i", "sd1i", "n1i", "m2i", "sd2i", "n2i"),
               generic = c("yi", "sei"))
wide <- list(binary = c("Experimental Events", "Experimental Total", "Control Events", "Control Total"),
             continuous = c("Experimental Mean", "Experimental SD", "Experimental Total", "Control Mean", "Control SD", "Control Total"),
             generic = c("Effect Estimate", "SE"))
assert <- function(ok, message) if (length(ok) != 1L || is.na(ok) || !ok) stop(message, call. = FALSE)
numeric_values <- function(x) {
  n <- suppressWarnings(as.numeric(x))
  assert(length(n) == length(x) && all(is.finite(n)), "Missing/nonfinite number")
  n
}

# A small independent XML tokenizer for these declared synthetic fixtures only.
# This is not an rm5 importer for arbitrary user files. Mismatched tags fail.
xml <- function(path) {
  text <- paste(readLines(path, encoding = "UTF-8", warn = FALSE), collapse = "\n")
  tokens <- regmatches(text, gregexpr("<!--[\\s\\S]*?-->|<[^>]+>|[^<]+", text, perl = TRUE))[[1]]
  node <- function(tag) { e <- new.env(parent = emptyenv()); e$tag <- tag; e$attrs <- list(); e$text <- ""; e$children <- list(); e }
  root <- node("document"); stack <- list(root)
  for (t in tokens) {
    if (startsWith(t, "<?") || startsWith(t, "<!--")) next
    last <- stack[[length(stack)]]
    if (startsWith(t, "</")) {
      assert(length(stack) > 1 && last$tag == sub("</([^>]+)>", "\\1", t), "Malformed fixture XML")
      stack <- stack[-length(stack)]
    } else if (startsWith(t, "<")) {
      tag <- sub("^<([A-Z_0-9]+).*", "\\1", t)
      n <- node(tag)
      a <- regmatches(t, gregexpr('[A-Z_0-9]+="[^"]*"', t))[[1]]
      for (v in a) n$attrs[[sub('=.*', '', v)]] <- sub('^[^=]+="(.*)"$', '\\1', v)
      last$children[[length(last$children) + 1L]] <- n
      if (!grepl("/>$", t)) stack[[length(stack) + 1L]] <- n
    } else last$text <- paste0(last$text, t)
  }
  assert(length(stack) == 1L && length(root$children) == 1L, "Malformed fixture XML")
  root$children[[1]]
}
children <- function(n, tag) Filter(function(x) x$tag == tag, n$children)
descendants <- function(n, tag) {
  found <- list()
  visit <- function(v) for (child in v$children) {
    if (child$tag == tag) found[[length(found) + 1L]] <<- child
    visit(child)
  }
  visit(n); found
}
prop <- function(n, key, default = "") {
  if (!is.null(n$attrs[[key]])) return(n$attrs[[key]])
  ch <- children(n, key)
  if (length(ch)) trimws(ch[[1]]$text) else default
}
source_rows <- function(c) {
  path <- file.path(fixtures, c$file)
  type <- switch(c$app, "mh-peto" = "binary", "heterogeneity" = "generic", "effect-size-converter" = "continuous")
  method <- random <- measure <- ""
  if (grepl("\\.rm5$", c$file)) {
    root <- xml(path)
    comp <- descendants(root, "COMPARISON")[[as.integer(c$comparison) + 1L]]
    outcomes <- Filter(function(n) grepl("_OUTCOME$", n$tag), comp$children)
    outcome <- outcomes[[as.integer(c$outcome) + 1L]]
    prefix <- switch(type, binary = "DICH", continuous = "CONT", generic = "IV")
    assert(outcome$tag == paste0(prefix, "_OUTCOME"), "Source outcome type mismatch")
    groups <- children(outcome, paste0(prefix, "_SUBGROUP"))
    group <- if (length(groups)) groups[[as.integer(c$subgroup) + 1L]] else outcome
    nodes <- children(group, paste0(prefix, "_DATA"))
    studies <- descendants(root, "STUDY")
    metadata <- setNames(studies, vapply(studies, prop, "", key = "ID"))
    attrs <- switch(type, binary = c("EVENTS_1", "TOTAL_1", "EVENTS_2", "TOTAL_2"),
                    continuous = c("MEAN_1", "SD_1", "TOTAL_1", "MEAN_2", "SD_2", "TOTAL_2"),
                    generic = c("EFFECT_SIZE", "SE"))
    records <- lapply(nodes, function(n) {
      id <- prop(n, "STUDY_ID"); s <- metadata[[id]]
      assert(!is.null(s), "Unresolved fixture study")
      c(studyId = id, study = prop(s, "NAME"), year = prop(s, "YEAR"),
        setNames(vapply(attrs, function(a) prop(n, a), ""), fields[[type]]))
    })
    d <- as.data.frame(do.call(rbind, records), stringsAsFactors = FALSE)
    measure <- prop(outcome, "EFFECT_MEASURE")
    if (measure == "Hazard Ratio") measure <- "HR"
    method <- prop(outcome, "METHOD"); random <- prop(outcome, "RANDOM")
    for (level in c("CI_STUDY", "CI_TOTAL")) assert(prop(outcome, level) %in% c("", "95"), "Unsupported fixture confidence level")
  } else {
    src <- read_chars(path)
    # Independent explicit fixture column mappings, not the production parser.
    group_columns <- if (c$file == "generic.csv") c("Analysis group", "Analysis number", "Subgroup") else c("Comparison", "Outcome", "Subgroup")
    for (i in seq_along(group_columns)) {
      column <- group_columns[i]
      if (column %in% names(src)) {
        selected <- unique(src[[column]])[as.integer(c[[c("comparison", "outcome", "subgroup")[i]]]) + 1L]
        src <- src[src[[column]] == selected, , drop = FALSE]
      }
    }
    n <- nrow(src)
    d <- data.frame(studyId = if ("Study ID" %in% names(src)) src[["Study ID"]] else src$Study,
                    study = src$Study, year = src[[if (c$file == "generic.csv") "Study year" else "Year"]], stringsAsFactors = FALSE)
    columns <- if (c$file == "continuous.csv") c("Mean 1", "SD 1", "Total 1", "Mean 2", "SD 2", "Total 2") else if (c$file == "generic.csv") c("GIV Mean", "GIV SE") else wide[[type]]
    for (i in seq_along(columns)) d[[fields[[type]][i]]] <- src[[columns[i]]]
    assert(n > 0L, "No source rows")
    if ("Effect measure" %in% names(src)) measure <- unique(src[["Effect measure"]])
  }
  if (nzchar(c$study)) d <- d[as.integer(c$study) + 1L, , drop = FALSE]
  for (f in fields[[type]]) d[[f]] <- numeric_values(d[[f]])
  rownames(d) <- NULL
  if (nzchar(measure)) assert(identical(measure, c$measure), "Manifest measure disagrees with source")
  if (nzchar(random)) {
    assert(random %in% c("YES", "NO"), "Unknown fixture model")
    assert(if (random == "YES") c$method == "DL" else c$method %in% c("MH", "STUDY"), "Manifest model disagrees with RevMan 5 settings")
  }
  if (nzchar(method)) assert(if (method == "MH") c$method == "MH" else method == "IV", "Unsupported fixture method")
  list(data = d, type = type)
}
compare_rows <- function(actual, expected, type) {
  keys <- c("studyId", "study", "year", fields[[type]])
  assert(nrow(actual) == nrow(expected) && all(keys %in% names(actual)), "Row/column mismatch")
  for (key in keys) {
    a <- actual[[key]]; e <- expected[[key]]
    if (key %in% fields[[type]]) a <- numeric_values(a)
    assert(identical(unname(a), unname(e)), paste("Row mismatch:", key))
  }
}
compare_wide <- function(path, expected, type) {
  tab <- read_chars(path)
  renames <- c(studyId = "Study ID", study = "Study", year = "Year", setNames(wide[[type]], fields[[type]]))
  assert(all(renames %in% names(tab)), "Export columns missing")
  tab <- tab[, unname(renames), drop = FALSE]; names(tab) <- names(renames)
  compare_rows(tab, expected, type)
}
compare_web <- function(prefix, d, type, measure) {
  info <- read_chars(paste0(prefix, "-web-information.csv"))
  arms <- read_chars(paste0(prefix, "-web-arms.csv"))
  results <- read_chars(paste0(prefix, "-web-results.csv"))
  assert(identical(info$Study, d$studyId) && identical(info$Year, d$year), "Web metadata mismatch")
  ids <- rep(d$studyId, each = 2L); labels <- rep(c("Experimental", "Control"), nrow(d))
  assert(identical(arms$Study, ids) && identical(arms$Arm, labels) && identical(arms$Intervention, labels), "Web arm identity mismatch")
  assert(identical(results$Study, ids) && identical(results$Arm, labels), "Web result arm order mismatch")
  assert(all(results$Outcome == "Synthetic R check outcome"), "Web outcome mismatch")
  odd <- seq(1L, nrow(results), by = 2L); even <- odd + 1L
  if (type == "generic") {
    assert(all(results[["Reference arm"]][odd] == "false") && all(results[["Reference arm"]][even] == "true"), "Web reference arm mismatch")
    assert(all(results$Mean[even] == "") && all(results$SE[even] == ""), "Reference arm contains effect data")
    expected_measure <- c(HR = "log[Hazard Ratio]", MD = "Mean Difference")[[measure]]
    assert(all(results[["Effect measure"]] == expected_measure), "Web effect scale mismatch")
    map <- c(yi = "Mean", sei = "SE")
    for (f in names(map)) assert(identical(numeric_values(results[[map[[f]]]][odd]), d[[f]]), paste("Web numeric mismatch", f))
  } else {
    for (f in c("n1i", "n2i")) assert(identical(numeric_values(results[["Sample size"]][if (f == "n1i") odd else even]), d[[f]]), "Web total mismatch")
    map <- if (type == "binary") c(ai = "Cases", ci = "Cases") else c(m1i = "Mean", sd1i = "SD", m2i = "Mean", sd2i = "SD")
    for (f in names(map)) assert(identical(numeric_values(results[[map[[f]]]][if (f %in% c("ai", "m1i", "sd1i")) odd else even]), d[[f]]), paste("Web numeric mismatch", f))
  }
  assert(all(results[["Data type"]] == if (type == "generic") "Contrast level" else "Arm level"), "Web data type mismatch")
}
oracle <- function(d, type, c) {
  if (type == "continuous") {
    s <- metafor::escalc(measure = "SMD", m1i = d$m1i, sd1i = d$sd1i, n1i = d$n1i,
                         m2i = d$m2i, sd2i = d$sd2i, n2i = d$n2i, correct = TRUE, vtype = "LS")
    return(c(k = nrow(d), yi = s$yi, sei = sqrt(s$vi), ci_lb = s$yi - qnorm(.975) * sqrt(s$vi), ci_ub = s$yi + qnorm(.975) * sqrt(s$vi)))
  }
  if (nrow(d) == 1L) return(c(k = 1)) # Native pairwise apps deliberately do not pool k=1.
  if (type == "generic") {
    # PM uses uniroot's `tol`, not Fisher scoring's `threshold`. Its default
    # eps^0.25 can leave enough root error to exceed 1e-6 in SE/I2/intervals.
    # Tighten reference computation; the comparison tolerance stays 1e-6.
    control <- list(tol = 1e-12)
    fit <- metafor::rma(yi = d$yi, sei = d$sei, method = c$method, test = "z", control = control)
    hk <- metafor::rma(yi = d$yi, sei = d$sei, method = c$method, test = "adhoc", control = control)
    pi <- predict(metafor::rma(yi = d$yi, sei = d$sei, method = c$method, test = "t", control = control))
    i2q <- if (fit$QE > fit$k - 1) 100 * (fit$QE - (fit$k - 1)) / fit$QE else 0
    return(c(k = fit$k, mu = as.numeric(fit$b), se = fit$se, ci_lb = fit$ci.lb, ci_ub = fit$ci.ub,
             Q = fit$QE, Q_p = fit$QEp, tau2 = fit$tau2, I2_Q = i2q, I2_model = fit$I2,
             se_modified_hk = hk$se, ci_lb_hksj = hk$ci.lb, ci_ub_hksj = hk$ci.ub,
             pi_lb = pi$pi.lb, pi_ub = pi$pi.ub))
  }
  fit <- metafor::rma.mh(ai = d$ai, bi = d$n1i - d$ai, ci = d$ci, di = d$n2i - d$ci,
                        measure = c$measure, add = c(.5, 0), to = c("only0", "none"),
                        drop00 = c(FALSE, FALSE), correct = FALSE)
  values <- c(k = fit$k, mh_est = exp(as.numeric(fit$b)), mh_lo = exp(fit$ci.lb), mh_hi = exp(fit$ci.ub), mh_z = fit$zval, mh_p = fit$pval,
              mh_QE = fit$QE, mh_QEp = fit$QEp, mh_I2 = fit$I2, mh_H2 = fit$H2)
  if (c$measure == "OR") {
    p <- metafor::rma.peto(ai = d$ai, bi = d$n1i - d$ai, ci = d$ci, di = d$n2i - d$ci, add = 0, to = "none")
    values <- c(values, peto_est = exp(as.numeric(p$b)), peto_lo = exp(p$ci.lb), peto_hi = exp(p$ci.ub), peto_z = p$zval, peto_p = p$pval,
                peto_QE = p$QE, peto_QEp = p$QEp, peto_I2 = p$I2, peto_H2 = p$H2)
  }
  values
}
compare_values <- function(actual, expected) {
  assert(all(names(expected) %in% names(actual)), "Missing page result keys")
  delta <- abs(actual[names(expected)] - expected)
  assert(all(is.finite(delta)) && all(delta <= 1e-6), paste("Numerical mismatch:", paste(names(delta)[!is.finite(delta) | delta > 1e-6], collapse = ", ")))
}

expected <- lapply(seq_len(nrow(cases)), function(i) source_rows(cases[i, ]))
assert(nrow(cases) == 16L && !anyDuplicated(cases$case), "Incomplete/duplicate witness manifest")
actual_fixtures <- sort(list.files(fixtures, pattern = "\\.(rm5|csv)$"))
assert(identical(actual_fixtures, sort(c(unique(cases$file), "malformed.rm5"))), "Fixture coverage drift")
malformed <- tryCatch({ xml(file.path(fixtures, "malformed.rm5")); FALSE }, error = function(e) grepl("Malformed", conditionMessage(e)))
assert(malformed, "Malformed fixture control was accepted")

# Regression for the reference solver itself, independent of browser/JS results.
# For two studies Q(tau2)=(y1-y2)^2/(v1+v2+2*tau2), so the PM root is exact.
# Check both a positive root and the zero boundary, including all three fits
# (z, modified HK and t prediction) against closed-form/base-R calculations.
check_pm_precision <- function(d, case) {
  assert(nrow(d) == 2L && case$method == "PM", "PM precision control needs two studies")
  v <- d$sei^2
  tau2 <- max(0, ((d$yi[1] - d$yi[2])^2 - sum(v)) / 2)
  w <- 1 / (v + tau2)
  mu <- sum(w * d$yi) / sum(w)
  se <- sqrt(1 / sum(w))
  se_hk <- se * sqrt(max(1, sum(w * (d$yi - mu)^2)))
  z <- qnorm(.975); t <- qt(.975, df = 1)
  pi_se <- sqrt(tau2 + se^2)
  exact <- c(mu = mu, se = se, tau2 = tau2, I2_model = 100 * tau2 / (tau2 + mean(v)),
             ci_lb = mu - z * se, ci_ub = mu + z * se, se_modified_hk = se_hk,
             ci_lb_hksj = mu - t * se_hk, ci_ub_hksj = mu + t * se_hk,
             pi_lb = mu - t * pi_se, pi_ub = mu + t * pi_se)
  compare_values(oracle(d, "generic", case), exact)
  wrong <- exact; wrong["se"] <- wrong["se"] + 1e-4
  assert(inherits(try(compare_values(wrong, exact), silent = TRUE), "try-error"), "Precision plant was accepted")
}
pm_case <- which(cases$case == "multi-generic-first")
assert(length(pm_case) == 1L, "Missing PM precision fixture")
pm_rows <- expected[[pm_case]]$data
check_pm_precision(pm_rows, cases[pm_case, ])
pm_rows$yi[] <- pm_rows$yi[1]
check_pm_precision(pm_rows, cases[pm_case, ])

if ("--self-test" %in% args) {
  for (i in seq_len(nrow(cases))) {
    x <- expected[[i]]; compare_rows(x$data, x$data, x$type)
    v <- oracle(x$data, x$type, cases[i, ]); compare_values(v, v)
    wrong <- v; wrong[1] <- wrong[1] + 1
    assert(inherits(try(compare_values(wrong, v), silent = TRUE), "try-error"), "Numeric plant was accepted")
  }
  x <- expected[[1]]; wrong <- x$data
  wrong[1, c("ai", "n1i", "ci", "n2i")] <- wrong[1, c("ci", "n2i", "ai", "n1i")]
  assert(inherits(try(compare_rows(wrong, x$data, x$type), silent = TRUE), "try-error"), "Arm plant was accepted")
  cat("R_CHECK_SELF_TEST_PASS (checker only; no page evidence)\n")
  quit(status = 0)
}

run_file <- file.path(out, "run.txt")
assert(file.exists(run_file), "Missing page run; execute features-revman.spec.mjs first")
run <- readLines(run_file, warn = FALSE)
assert(length(run) == 1L && nzchar(run), "Missing run identity")
for (i in seq_len(nrow(cases))) {
  c <- cases[i, ]; x <- expected[[i]]; prefix <- file.path(out, c$case)
  token <- paste0(prefix, "-run.txt")
  assert(file.exists(token) && identical(readLines(token, warn = FALSE), run), paste("Incomplete/stale page case", c$case))
  compare_rows(read_chars(paste0(prefix, "-inputs.csv")), x$data, x$type)
  compare_wide(paste0(prefix, "-export.csv"), x$data, x$type)
  compare_web(prefix, x$data, x$type, c$measure)
  tab <- read_chars(paste0(prefix, "-results.csv"))
  assert(!anyDuplicated(tab$key), "Duplicate result key")
  values <- setNames(numeric_values(tab$value), tab$key)
  compare_values(values, oracle(x$data, x$type, c))
  if (x$type != "continuous" && nrow(x$data) == 1L) assert(!any(c("mu", "mh_est") %in% names(values)), "Singleton unexpectedly pooled")
  cat("PASS", c$case, "rows", nrow(x$data), "method", c$method, "\n")
}
plant_detected <- tryCatch({
  compare_wide(file.path(out, "planted-swapped-arm.csv"), expected[[1]]$data, expected[[1]]$type)
  FALSE
}, error = function(e) grepl("^Row mismatch:", conditionMessage(e)))
assert(plant_detected, "Swapped-arm export plant was not detected")
cat("PLANT_DETECTED\n")
cat("R_CHECK_PASS\n")
