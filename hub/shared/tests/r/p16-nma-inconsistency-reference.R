# Run p16-prepare-reference.py first, then run this script from wt/.
# New evidence only: never overwrites a published validation corpus.
suppressPackageStartupMessages({library(netmeta); library(metafor)})
invisible(Sys.setlocale("LC_COLLATE", "C"))
input_path <- "hub/shared/tests/fixtures/p16-nma-inconsistency-input.json"
script_path <- "hub/shared/tests/r/p16-nma-inconsistency-reference.R"
prepare_path <- "hub/shared/tests/r/p16-prepare-reference.py"
source(file.path(dirname(tempdir()), "rpar-P16-input.R"), local = TRUE)
stopifnot(identical(prepared_input_md5, unname(tools::md5sum(input_path))))
G <- function(x, n) x[[n, exact = TRUE]]
rows_frame <- function(rows) do.call(rbind, lapply(rows, as.data.frame, stringsAsFactors = FALSE))

# Base-R serialization only; the statistical oracle remains netmeta/metafor.
# Preserve 17 significant digits and list/object identity without jsonlite.
json_string <- function(s) {
  chars <- vapply(utf8ToInt(enc2utf8(s)), function(code) {
    if (code == 34L) return('\\"')
    if (code == 92L) return('\\\\')
    if (code < 32L) return(sprintf('\\u%04x', code))
    intToUtf8(code)
  }, character(1))
  paste0('"', paste(chars, collapse = ''), '"')
}
json_encode <- function(x) {
  if (is.null(x)) return("null")
  if (is.list(x)) {
    values <- vapply(x, json_encode, character(1))
    if (is.null(names(x))) return(paste0("[", paste(values, collapse = ","), "]"))
    keys <- vapply(names(x), json_string, character(1))
    return(paste0("{", paste(paste0(keys, ":", values), collapse = ","), "}"))
  }
  if (length(x) != 1L) return(json_encode(as.list(x)))
  if (is.na(x)) return("null")
  if (is.numeric(x)) return(if (is.finite(x)) sprintf("%.17g", x) else "null")
  if (is.logical(x)) return(if (x) "true" else "false")
  stopifnot(is.character(x))
  json_string(x)
}

# The page claims the uncentred network Q(tau2)=k-(T-1) equation.
# rma(..., intercept=FALSE, method="PM") is NOT substituted: its centring
# changes this equation. Use metafor's version-recorded .QE.func directly.
pm_tau2 <- function(d, tr) {
  X <- vapply(tr[-1], function(t) as.numeric(d$A == t) - as.numeric(d$B == t), numeric(nrow(d)))
  df <- nrow(d) - ncol(X)
  if (df <= 0) return(0)
  qe <- get(".QE.func", asNamespace("metafor"))
  f <- function(t2) qe(t2, Y = as.matrix(d$te), vi = d$se^2, X = X, k = nrow(d), objective = df)
  if (f(0) <= 0) return(0)
  upper <- max(1, var(d$te))
  while (f(upper) > 0) upper <- upper * 2
  uniroot(f, c(0, upper), tol = 1e-13, maxiter = 1000)$root
}

fit <- function(d, model) {
  tr <- sort(unique(c(d$A, d$B)), method = "radix")
  preset <- if (model == "PM") sqrt(pm_tau2(d, tr)) else if (model == "FE") 0 else NULL
  m <- netmeta(TE = d$te, seTE = d$se, treat1 = d$A, treat2 = d$B,
    studlab = d$study, sm = "MD", reference.group = tr[1],
    common = TRUE, random = TRUE, method.tau = "DL", tau.preset = preset,
    sep.trts = " ~~ ", warn = FALSE)
  tau2 <- if (model == "FE") 0 else G(m, "tau")^2
  suffix <- if (model == "FE") "common" else "random"
  s <- netsplit(m, method = "Back-calculation", tol.direct = 0)
  direct <- G(s, paste0("direct.", suffix))
  indirect <- G(s, paste0("indirect.", suffix))
  cmp <- G(s, paste0("compare.", suffix))
  splits <- list()
  for (i in seq_len(nrow(cmp))) {
    label <- cmp$comparison[i]
    a <- direct[match(label, direct$comparison), , drop = FALSE]
    b <- indirect[match(label, indirect$comparison), , drop = FALSE]
    # netmeta determines estimability; do not implement the app's graph filter.
    if (!is.finite(a$TE) || !is.finite(b$TE) || !is.finite(cmp$TE[i])) next
    pair <- strsplit(label, " ~~ ", fixed = TRUE)[[1]]
    ordered <- sort(pair, method = "radix")
    sign <- if (pair[1] == ordered[1]) 1 else -1
    ci <- function(x) {
      stopifnot(all(c("lower", "upper") %in% names(x)))
      list(lower = if (sign == 1) x$lower else -x$upper,
           upper = if (sign == 1) x$upper else -x$lower)
    }
    splits[[length(splits) + 1]] <- list(comparison = paste(ordered, collapse = " vs "),
      direct = list(mean = sign * a$TE, se = a$seTE),
      indirect = list(mean = sign * b$TE, se = b$seTE),
      diff = sign * cmp$TE[i], seDiff = cmp$seTE[i], z = sign * cmp$statistic[i], p = cmp$p[i],
      kDirect = sum((d$A == ordered[1] & d$B == ordered[2]) | (d$A == ordered[2] & d$B == ordered[1])),
      ci = list(direct = ci(a), indirect = ci(b)))
  }
  dec <- decomp.design(m, tau.preset = sqrt(tau2), warn = FALSE)
  q <- G(dec, if (model == "FE") "Q.decomp" else "Q.inc.random.preset")
  global <- if (is.null(q)) list(Q = 0, df = 0, p = NA_real_) else {
    i <- match("Between designs", rownames(q))
    list(Q = q$Q[i], df = q$df[i], p = q$pval[i])
  }
  # No-loop test is unavailable, not evidence of consistency (page contract).
  if (global$df == 0) global <- list(Q = 0, df = 0, p = NA_real_)
  estimates <- function(which) setNames(lapply(tr, function(t) list(
    est = G(m, paste0("TE.", which))[t, tr[1]],
    se = G(m, paste0("seTE.", which))[t, tr[1]])), tr)
  beta <- G(m, paste0("TE.", suffix))[, tr[1]]
  qr <- sum((d$te - (beta[d$A] - beta[d$B]))^2 / (d$se^2 + tau2))
  list(model = model, trts = as.list(tr), Q = G(m, "Q"), df = G(m, "df.Q"),
    tau2 = tau2, Qrandom = qr, estimates = estimates("common"),
    estimatesRandom = estimates(suffix), nodeSplit = splits, dbt = global)
}

binary_rows <- function(studies, measure) {
  lapply(studies, function(s) {
    a <- s$arms[[1]]; b <- s$arms[[2]]
    # Keep double-zero and double-all-event rows, as the importer does.
    e <- escalc(measure = measure, ai = a$events, bi = a$n - a$events,
      ci = b$events, di = b$n - b$events, add = 0.5, to = "only0", drop00 = FALSE)
    list(A = a$treatment, B = b$treatment, te = as.numeric(e$yi),
      se = sqrt(as.numeric(e$vi)), study = s$id)
  })
}
cases <- list()
for (case in inputs$networks) cases[[case$id]] <- list(rows = case$rows)
for (case in inputs$binary) for (measure in c("OR", "RR")) {
  cases[[paste(case$id, measure, sep = "_")]] <- list(
    rows = binary_rows(case$studies, measure), measure = measure, studies = case$studies)
}
errors <- character()
for (id in names(cases)) {
  d <- rows_frame(cases[[id]]$rows)
  cases[[id]]$fits <- setNames(lapply(c("FE", "DL", "PM"), function(model) {
    cat(id, model, "\n"); flush.console()
    tryCatch(fit(d, model), error = function(e) {
      message <- paste(id, model, conditionMessage(e), sep = ": ")
      errors <<- c(errors, message)
      cat("REFERENCE ERROR", message, "\n"); flush.console()
      NULL
    })
  }), c("FE", "DL", "PM"))
}
# Report all case failures in one wrapper pass, but never retain a partial oracle.
if (length(errors)) stop(paste(length(errors), "reference fits failed; no fixture written"))
out <- list(provenance = list(R = R.version.string,
  packages = setNames(lapply(c("netmeta", "metafor", "meta"), function(p) as.character(packageVersion(p))),
    c("netmeta", "metafor", "meta")),
  script = script_path, script_md5 = unname(tools::md5sum(script_path)),
  input = input_path, input_md5 = unname(tools::md5sum(input_path)),
  prepare = prepare_path, prepare_md5 = unname(tools::md5sum(prepare_path)),
  serialization = "Python JSON-to-R literals; base-R JSON encoder with 17 significant digits",
  pm = "Uncentred metafor::.QE.func; uniroot tol=1e-13; netmeta tau.preset",
  ci = "95% normal confidence limits returned by netmeta::netsplit; no prediction intervals offered",
  binary = "metafor::escalc(add=0.5,to='only0',drop00=FALSE)"), cases = cases)
path <- file.path(dirname(tempdir()), "rpar-P16-reference.json")
writeLines(json_encode(out), path, useBytes = TRUE)
cat("REFERENCE", path, "\n")
cat("VERSIONS", R.version.string, paste(names(out$provenance$packages), unlist(out$provenance$packages), collapse = "; "), "\n")
