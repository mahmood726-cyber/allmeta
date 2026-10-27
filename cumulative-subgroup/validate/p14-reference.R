# Independent metafor reference for synthetic P14 fixtures.
# Run from the repository root; see P14.md. No JavaScript results are read.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2L) stop("Usage: p14-reference.R fixtures.json output.json")
source_file <- sub("^--file=", "", grep("^--file=", commandArgs(), value = TRUE)[1])
fixture <- fromJSON(args[1], simplifyVector = FALSE)
control <- list(threshold = 1e-13, maxiter = 10000L, stepadj = 0.5)

classify <- function(p) {
  values <- p[c("estimate", "se", "lb", "ub")]
  valid <- vapply(values, function(x) is.numeric(x) && length(x) == 1L &&
                    is.finite(x), logical(1))
  if (!all(valid)) return("UNDEFINED")
  if (p$se < 0 || p$lb > p$ub) return("UNDEFINED")
  if (p$lb > 0) return("ABOVE")
  if (p$ub < 0) return("BELOW")
  "INCLUDES"
}

normalize <- function(rows) {
  stopifnot(length(rows) > 0)
  d <- do.call(rbind, lapply(rows, function(r) {
    stopifnot(is.numeric(r$yi), length(r$yi) == 1L, is.finite(r$yi),
              is.numeric(r$year), length(r$year) == 1L, is.finite(r$year),
              r$year == floor(r$year), r$year >= 1, r$year <= 9999,
              xor(is.null(r$vi), is.null(r$sei)))
    v <- if (!is.null(r$vi)) r$vi else r$sei^2
    stopifnot(is.finite(v), v > 0)
    if (!is.null(r$sei)) stopifnot(r$sei > 0)
    n <- if (is.null(r$n)) NA_real_ else r$n
    stopifnot(is.na(n) || (is.finite(n) && n >= 0 && n == floor(n)))
    data.frame(yi = r$yi, vi = v, year = r$year, n = n)
  }))
  d[order(d$year, d$yi, d$vi, ifelse(is.na(d$n), -1, d$n)), , drop = FALSE]
}

count_rows <- function(d) {
  incomplete <- anyNA(d$n)
  list(k = nrow(d), n = if (incomplete) NULL else sum(d$n),
       incomplete = incomplete)
}

# Independent suffix scan; indices in the exported table are one-based.
decide <- function(blocks, d, min_k) {
  ans <- list(result = "NOT_CONCLUSIVE", min_k = min_k, j_star = NULL,
              year_star = NULL, T = NULL, K_later = NULL, N_later = NULL,
              N_later_incomplete = NULL, years_to_final = NULL,
              K_lag2 = NULL, N_lag2 = NULL, N_lag2_incomplete = NULL)
  J <- length(blocks)
  final <- blocks[[J]]
  if (!final$evaluated) return(ans)
  if (final$status == "UNDEFINED") {
    ans$result <- "INDETERMINATE"
    return(ans)
  }
  if (!(final$status %in% c("ABOVE", "BELOW"))) return(ans)
  uncertain <- FALSE
  if (J > 1L) for (j in seq_len(J - 1L)) {
    if (!blocks[[j]]$evaluated || blocks[[j]]$k < min_k) next
    tail <- Filter(function(b) b$evaluated, blocks[j:J])
    statuses <- vapply(tail, function(b) b$status, character(1))
    if (all(statuses == final$status)) {
      year <- blocks[[j]]$year
      later <- count_rows(d[d$year > year, , drop = FALSE])
      lag <- count_rows(d[d$year >= year + 2, , drop = FALSE])
      values <- list(result = "CONCLUSIVE", j_star = j, year_star = year,
                     T = sprintf("%04d-12-31", as.integer(year)),
                     K_later = later$k, N_later = later$n,
                     N_later_incomplete = later$incomplete,
                     years_to_final = final$year - year,
                     K_lag2 = lag$k, N_lag2 = lag$n, N_lag2_incomplete = lag$incomplete)
      ans[names(values)] <- values
      return(ans)
    }
    if (any(statuses == "UNDEFINED") &&
        all(statuses %in% c(final$status, "UNDEFINED"))) uncertain <- TRUE
  }
  if (uncertain) ans$result <- "INDETERMINATE"
  ans
}

run_case <- function(dataset, model, ci, id, fail_years = numeric()) {
  d <- normalize(dataset$rows)
  years <- sort(unique(d$year))
  previous_k <- 0L
  blocks <- lapply(years, function(year) {
    sub <- d[d$year <= year, , drop = FALSE]
    k <- nrow(sub)
    b <- list(year = year, rows_added = k - previous_k, k = k,
              estimate = NULL, se = NULL, lb = NULL, ub = NULL, tau2 = NULL,
              status = "NOT_EVALUATED", evaluated = k >= 2L,
              reason = if (k < 2L) "K_LT_2" else NULL)
    previous_k <<- k
    if (k < 2L) return(b)
    forced <- year %in% fail_years
    ctl <- control
    if (forced) {
      stopifnot(model == "REML")
      ctl$maxiter <- 0L
    }
    fit <- tryCatch(
      rma(yi = sub$yi, vi = sub$vi, method = model,
          test = if (ci == "hk") "knha" else "z", level = 95, control = ctl),
      error = function(e) e
    )
    if (forced) {
      if (!inherits(fit, "error") ||
          !grepl("converg", conditionMessage(fit), ignore.case = TRUE))
        stop("Forced REML non-convergence was not observed: ", id)
      b$status <- "UNDEFINED"
      b$reason <- "FIT_FAILED"
      return(b)
    }
    # Unexpected fit failures are generator failures, never new reference truth.
    if (inherits(fit, "error")) stop(id, " / ", year, ": ", conditionMessage(fit))
    p <- list(estimate = as.numeric(coef(fit)[1]), se = as.numeric(fit$se[1]),
              lb = as.numeric(fit$ci.lb[1]), ub = as.numeric(fit$ci.ub[1]))
    status <- classify(p)
    if (status == "UNDEFINED" || !is.finite(fit$tau2) || fit$tau2 < 0)
      stop("Unexpected non-finite fit: ", id, " / ", year)
    b[names(p)] <- p
    b["tau2"] <- list(if (model == "FE") NULL else as.numeric(fit$tau2))
    b$status <- status
    b
  })
  list(id = id, dataset = dataset$id, model = model, ci = ci,
       fail_years = as.list(fail_years), blocks = blocks,
       primary = decide(blocks, d, 2L), sensitivity_a = decide(blocks, d, 10L))
}

cases <- list()
for (dataset in fixture$datasets) for (setting in fixture$settings) {
  id <- paste(dataset$id, setting$model, setting$ci, sep = "/")
  cases[[length(cases) + 1L]] <- run_case(dataset, setting$model, setting$ci, id)
}
for (fault in fixture$faults) {
  dataset <- Filter(function(d) d$id == fault$dataset, fixture$datasets)
  stopifnot(length(dataset) == 1L)
  cases[[length(cases) + 1L]] <- run_case(dataset[[1]], fault$model, fault$ci,
                                       fault$id, unlist(fault$fail_years))
}
comparisons <- lapply(fixture$comparisons, function(p) {
  status <- classify(p)
  stopifnot(identical(status, p$expected))
  status
})
decisions <- lapply(fixture$decisions, function(f) {
  statuses <- unlist(f$statuses)
  blocks <- lapply(seq_along(statuses), function(i)
    list(year = 1999L + i, k = i + 1L, evaluated = TRUE, status = statuses[i]))
  d <- data.frame(year = c(2000L, 1999L + seq_along(statuses)), n = 10)
  ans <- decide(blocks, d, 2L)
  stopifnot(ans$result == f$expected, isTRUE(all.equal(ans$j_star, f$j_star)))
  ans
})
reference <- list(
  schema = "cumsub-p14-reference-v1",
  versions = list(R = R.version.string, metafor = as.character(packageVersion("metafor")),
                  jsonlite = as.character(packageVersion("jsonlite"))),
  fixture_md5 = unname(tools::md5sum(args[1])),
  generator_md5 = unname(tools::md5sum(source_file)),
  control = control, cases = cases, comparisons = comparisons, decisions = decisions
)
write_json(reference, args[2], auto_unbox = TRUE, pretty = TRUE,
           digits = NA, null = "null", na = "null")
cat("Wrote", length(cases), "cases to", args[2], "\n")
cat(R.version.string, "; metafor", as.character(packageVersion("metafor")), "\n")
