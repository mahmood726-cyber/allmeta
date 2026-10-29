# Independent canonical references for the P19 unit suite. Run from any cwd.
# No app code is read. Every row is a distinct independent two-arm study.
# Public discomb() supplies additive DL, covariance, and normal 95% CIs.
suppressPackageStartupMessages({library(netmeta); library(metafor)})
args <- commandArgs(trailingOnly = FALSE)
script <- normalizePath(sub("^--file=", "", args[grepl("^--file=", args)]))
input_path <- file.path(dirname(script), "component-nma-p19-input.json")
output_path <- file.path(dirname(script), "../fixtures/component-nma-p19-reference.json")
if (file.exists(output_path)) stop("Refusing to overwrite the recorded R reference")
# These are inputs, not reference results. Keep their JSON counterpart unchanged;
# the Node provenance control compares the entire echoed input with that file.
# An explicit R list avoids requiring a JSON parser just to read these inputs.
input <- list(cases = list(
  list(id = "tiny_zero", inactive = "control", rows = list(
    list("a", "control", -0.4, 0.12), list("b", "control", -0.3, 0.15),
    list("a+b", "control", -0.65, 0.13), list("a+c", "control", -0.55, 0.16),
    list("c", "control", -0.2, 0.18), list("b+c", "control", -0.45, 0.14),
    list("a+b+c", "control", -0.8, 0.2))),
  list(id = "heterogeneous", inactive = "control", rows = list(
    list("a", "control", -1.7, 0.11), list("b", "control", 0.8, 0.23),
    list("a+b", "control", 2.5, 0.31), list("a", "b", 1.9, 0.16),
    list("b", "control", -0.6, 0.27))),
  list(id = "two_positive", inactive = "control", rows = list(
    list("a", "control", -0.8, 0.1), list("a", "control", 0.7, 0.2))),
  list(id = "two_zero", inactive = "control", rows = list(
    list("a", "control", 0.2, 0.1), list("a", "control", 0.21, 0.2))),
  list(id = "saturated", inactive = "control", rows = list(
    list("a", "control", -0.3, 0.1), list("b", "control", 0.2, 0.2))),
  list(id = "disconnected", inactive = "control", rows = list(
    list("a+b", "control", 0.4, 0.12), list("a", "b", -0.3, 0.21),
    list("a+b", "control", 0.9, 0.15), list("a", "b", -0.6, 0.32))),
  list(id = "inactive_sham", inactive = "sham", rows = list(
    list("a+sham", "sham", -0.4, 0.12), list("b", "sham", -0.3, 0.15),
    list("a+b+sham", "sham", -0.65, 0.13), list("a+c", "sham", -0.55, 0.16),
    list("c", "sham", -0.2, 0.18), list("b+c", "sham", -0.45, 0.14),
    list("a+b+c", "sham", -0.8, 0.2))),
  list(id = "all_active", inactive = "", rows = list(
    list("a", "b", 0.2, 0.12), list("a+b", "a", -0.3, 0.15),
    list("a+b", "b", -0.1, 0.2), list("a", "b", 0.7, 0.18))),
  list(id = "shared_component", inactive = "control", rows = list(
    list("a+c", "b+c", 0.4, 0.1), list("c", "control", 0.2, 0.2),
    list("a+b", "control", -0.1, 0.15), list("a", "control", 0.1, 0.12),
    list("b+c", "control", -0.2, 0.18))),
  list(id = "null_effects", inactive = "control", rows = list(
    list("a", "control", 0, 0.1), list("b", "control", 0, 0.2),
    list("a+b", "control", 0, 0.15), list("a", "b", 0, 0.3)))
), single = list(id = "one_contrast", inactive = "control",
                 rows = list(list("a", "control", -0.3, 0.1))))

# Base-R serialization preserves double precision and singleton row dimensions.
# Only the documented non-estimable tau2 is explicitly converted to NULL below;
# any other missing/non-finite numeric reference is an error, not a JSON null.
json_string <- function(x) {
  chars <- vapply(utf8ToInt(enc2utf8(x)), function(code) {
    if (code == 34L) return('\\"')
    if (code == 92L) return('\\\\')
    if (code < 32L) return(sprintf("\\u%04x", code))
    intToUtf8(code)
  }, character(1))
  paste0('"', paste(chars, collapse = ""), '"')
}
json <- function(x) {
  if (is.null(x)) return("null")
  if (is.matrix(x))
    return(json(lapply(seq_len(nrow(x)), function(i) as.list(x[i, ]))))
  if (is.list(x)) {
    fields <- vapply(x, json, character(1))
    if (!is.null(names(x))) {
      stopifnot(!anyDuplicated(names(x)), !anyNA(names(x)))
      fields <- paste0(vapply(names(x), json_string, character(1)), ":", fields)
      return(paste0("{", paste(fields, collapse = ","), "}"))
    }
    return(paste0("[", paste(fields, collapse = ","), "]"))
  }
  if (length(x) != 1L) return(json(as.list(x)))
  if (is.character(x) && !is.na(x)) return(json_string(x))
  if (is.numeric(x) && is.finite(x))
    return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  stop("Unsupported or non-finite value in native R reference")
}
stopifnot(json(list(1)) == "[1]", json(matrix(1, 1, 1)) == "[[1]]",
          json(list(tau2 = NULL)) == '{"tau2":null}',
          json("\n") == '"\\u000a"', json('"') == '"\\""',
          inherits(try(json(Inf), silent = TRUE), "try-error"))
warnings <- list()

reference <- function(case) {
  rows <- case$rows
  t1 <- vapply(rows, `[[`, "", 1L)
  t2 <- vapply(rows, `[[`, "", 2L)
  y <- vapply(rows, `[[`, 0, 3L)
  se <- vapply(rows, `[[`, 0, 4L)
  dc <- withCallingHandlers(discomb(
    TE = y, seTE = se, treat1 = t1, treat2 = t2,
    studlab = paste0("independent-", seq_along(y)),
    inactive = if (nzchar(case$inactive)) case$inactive else NULL,
    sep.comps = "+", sm = "MD", common = TRUE, random = TRUE,
    level = 0.95, level.ma = 0.95, backtransf = FALSE),
    warning = function(w) {
      warnings[[case$id]] <<- c(warnings[[case$id]], conditionMessage(w))
      invokeRestart("muffleWarning")
    })
  stopifnot(dc$method.tau == "DL")
  component_names <- names(dc$Comp.random)
  if (is.null(component_names)) component_names <- dc$comps
  treatment_names <- rownames(dc$C.matrix)
  stopifnot(length(component_names) == length(dc$Comp.random),
            length(treatment_names) == length(dc$Comb.random))
  values <- function(kind, labels, model) {
    v <- function(prefix) as.numeric(dc[[paste0(prefix, kind, ".", model)]])
    est <- v(""); se <- v("se"); lo <- v("lower."); hi <- v("upper.")
    stopifnot(all(lengths(list(est, se, lo, hi)) == length(labels)),
              all(is.finite(c(est, se, lo, hi))))
    setNames(lapply(seq_along(labels), function(i)
      list(est = est[i], se = se[i], lo = lo[i], hi = hi[i])), labels)
  }
  components <- values("Comp", component_names, "random")
  components <- components[setdiff(names(components), case$inactive)]
  # Canonical labels remove the explicitly inactive component, including within
  # a combination. Duplicate aliases must agree, never silently overwrite.
  canonical <- function(label) paste(sort(setdiff(
    strsplit(label, "+", fixed = TRUE)[[1]], case$inactive)), collapse = "+")
  raw_combinations <- values("Comb", treatment_names, "random")
  combinations <- list()
  for (label in names(raw_combinations)) {
    key <- canonical(label)
    if (!nzchar(key)) next
    if (!is.null(combinations[[key]]))
      stopifnot(max(abs(unlist(combinations[[key]]) - unlist(raw_combinations[[label]]))) < 1e-12)
    combinations[[key]] <- raw_combinations[[label]]
  }
  cov <- dc$Lplus.matrix.random[names(components), names(components), drop = FALSE]
  tau2 <- dc$tau^2
  stopifnot(all(is.finite(cov)), is.finite(dc$Q.additive),
            length(tau2) == 1L, is.na(tau2) || is.finite(tau2))
  list(id = case$id, input = case, k = length(rows),
       Q = dc$Q.additive, df = dc$df.Q.additive,
       tau2 = if (is.na(tau2)) NULL else tau2,
       components = components, combinations = combinations,
       covariance_order = names(components), covariance = unname(cov),
       common_components = values("Comp", component_names, "common"))
}

cases <- lapply(input$cases, function(case) tryCatch(reference(case),
  error = function(e) list(id = case$id, error = conditionMessage(e))))
names(cases) <- vapply(input$cases, `[[`, "", "id")
# k=1 is outside the app's documented input domain. Record the canonical FE
# result, but test app refusal rather than pretend the app offers that result.
one <- input$single$rows[[1]]
single <- rma.uni(yi = one[[3]], sei = one[[4]], method = "FE", test = "z")
pkgs <- c("netmeta", "meta", "metafor")
versions <- setNames(lapply(pkgs, function(p) as.character(packageVersion(p))), pkgs)
# Retain the existing provenance field, explicitly recording its unused status.
versions$jsonlite <- if (requireNamespace("jsonlite", quietly = TRUE))
  paste(as.character(packageVersion("jsonlite")), "(not used)") else "not installed (not used)"
oracle <- list(
  provenance = list(R = R.version.string,
    packages = versions, serialization = "base R; 17 significant digits",
    input_md5 = unname(tools::md5sum(input_path)),
    script_md5 = unname(tools::md5sum(script)),
    method = "netmeta::discomb; additive generalized DL; independent two-arm studies; normal 95% CI",
    tolerance = 1e-6, warnings = warnings),
  input = input, cases = cases,
  single = list(input = input$single, method = "metafor::rma.uni(method='FE', test='z')",
    app_status = "refused: at least two contrasts required",
    est = as.numeric(single$b), se = single$se, lo = single$ci.lb, hi = single$ci.ub))
cat("R:", R.version.string, "\n")
for (p in pkgs) cat(p, as.character(packageVersion(p)), "\n")
for (case in cases) {
  if (!is.null(case$error)) cat("REFERENCE_ERROR", case$id, case$error, "\n")
  else cat("REFERENCE_OK", case$id, "k", case$k, "df", case$df, "Q", case$Q, "tau2", case$tau2, "\n")
}
stopifnot(!any(vapply(cases, function(x) !is.null(x$error), FALSE)))
# This retained JSON is a reference fixture, not a transient test log.
# Do not leave a partial oracle on failure or overwrite one on later replays.
writeLines(json(oracle), output_path, useBytes = TRUE)
cat("REFERENCE_WRITTEN", basename(output_path), "\n")
