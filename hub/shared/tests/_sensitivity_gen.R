# Reference generator for shared/sensitivity-v1.js (lane A5, wave A).
#
# Usage (from the repository root):
#   Rscript hub/shared/tests/_sensitivity_gen.R <metafor-5.2-1 library> <out.json> [i/n | merge/n]
# With "i/n" only analyses whose 1-based corpus position p satisfies (p - 1) %% n == i - 1 are
# fitted and written to <out.json>.part<i> (one analysis per line); "merge/n" then concatenates
# the parts back into corpus order and writes <out.json>. Without a third argument everything
# runs in one process. Sharding changes only which process fits an analysis, never the fit.
# The library path is prepended to .libPaths(); the script stops unless the loaded
# versions are exactly R 4.6.0, metafor 5.2-1 and metadat 1.6-0 (the paper versions).
#
# Inputs (read-only, unchanged): heterogeneity/validate/corpus/corpus.json (88 analyses,
# "label, yi, se" text) and influence/validate/corpus/corpus.json (142 analyses, yi/vi).
# For every analysis and every estimator DL/PM/REML/ML/HE/HS/SJ/EB/FE x test z/knha/adhoc:
#   rma(yi, vi, method, test, control = CTL); PI from predict(): for test "z" the model is
#   refitted with test = "t" (t_{k-1} quantile with the unadjusted SE, the repo's PI
#   convention); for knha/adhoc predict() of that fit (t_{k-1}, adjusted SE).
#   FE: no PI and no I2 (heterogeneity is not estimated by a common-effect model) - stored null.
# leave1out() for every heterogeneity-corpus analysis and every estimator x test.
# An R error is recorded as {"refused": true, "error": msg}; warnings of a fit that returned are
# kept in "warnings" (they do not refuse the fit). leave1out() warnings are not recorded.
# yi and vi are stored exactly as R used them (%.17g) so the JavaScript parity run uses
# identical inputs. Nothing here is compared: the comparison lives in
# hub/shared/tests/addons-a5-sensitivity.test.mjs.
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("usage: _sensitivity_gen.R <metafor library> [out.json] [i/n | merge/n]")
.libPaths(c(args[1], .libPaths()))
out_path <- if (length(args) >= 2) args[2] else "hub/shared/tests/fixtures/sensitivity/reference.json"
mode <- if (length(args) >= 3) strsplit(args[3], "/", fixed = TRUE)[[1]] else c("1", "1")
n_shards <- as.integer(mode[2]); merging <- mode[1] == "merge"
shard <- if (merging) NA_integer_ else as.integer(mode[1])
stopifnot(n_shards >= 1, merging || (shard >= 1 && shard <= n_shards))
suppressPackageStartupMessages({ library(metafor); library(jsonlite) })
versions <- list(R = paste(R.version$major, R.version$minor, sep = "."),
                 metafor = as.character(packageVersion("metafor")),
                 metadat = as.character(packageVersion("metadat")),
                 jsonlite = as.character(packageVersion("jsonlite")))
cat("R", versions$R, "metafor", versions$metafor, "metadat", versions$metadat,
    "from", find.package("metafor"), "\n")
stopifnot(versions$R == "4.6.0", versions$metafor == "5.2.1", versions$metadat == "1.6.0")

CTL <- list(threshold = 1e-12, maxiter = 10000, tol = 1e-14)
METHODS <- c("DL", "PM", "REML", "ML", "HE", "HS", "SJ", "EB", "FE")
TESTS <- c("z", "knha", "adhoc")
CODES <- c("OR", "RR", "RD", "SMD", "MD", "ZCOR", "COR", "PR", "PLO", "PLN", "PBIT", "IRR", "IRD",
           "ROM", "ABT", "ARAW", "AHW", "REH", "CLES", "PCOR", "ZPCOR", "SPCOR", "MN", "GEN")
family <- function(definition) {
  tok <- sub("[^A-Za-z].*$", "", definition)
  if (tok %in% CODES) tok else "GEN"
}

num <- function(x) {
  if (is.null(x) || length(x) == 0) return("null")
  vapply(x, function(v) if (is.na(v)) "null" else if (!is.finite(v)) stop("non-finite value") else sprintf("%.17g", v), "")
}
arr <- function(x) paste0("[", paste(num(x), collapse = ","), "]")
str1 <- function(s) as.character(toJSON(unbox(s)))

fit_one <- function(yi, vi, method, test) {
  warns <- character()
  res <- tryCatch(withCallingHandlers(
    rma(yi, vi, method = method, test = test, control = CTL),
    warning = function(w) { warns <<- c(warns, conditionMessage(w)); invokeRestart("muffleWarning") }),
    error = function(e) e)
  if (inherits(res, "error")) return(list(refused = TRUE, error = conditionMessage(res)))
  pr <- NULL
  if (method != "FE") {
    pf <- if (test == "z") tryCatch(rma(yi, vi, method = method, test = "t", control = CTL), error = function(e) e) else res
    if (inherits(pf, "error")) return(list(refused = TRUE, error = paste("PI refit:", conditionMessage(pf))))
    pr <- predict(pf)
  }
  list(refused = FALSE, fit = res, pi = pr, warnings = unique(warns))
}

fit_json <- function(f, method) {
  if (f$refused) return(paste0('{"refused":true,"error":', str1(f$error), '}'))
  r <- f$fit
  paste0('{"refused":false,"k":', r$k, ',"tau2":', num(r$tau2), ',"mu":', num(as.numeric(coef(r))),
         ',"se":', num(r$se), ',"ciLo":', num(r$ci.lb), ',"ciHi":', num(r$ci.ub),
         ',"Q":', num(r$QE), ',"df":', r$k - 1,
         ',"I2":', if (method == "FE") "null" else num(r$I2),
         ',"piLo":', if (is.null(f$pi)) "null" else num(f$pi$pi.lb),
         ',"piHi":', if (is.null(f$pi)) "null" else num(f$pi$pi.ub),
         ',"warnings":', as.character(toJSON(f$warnings)), '}')
}

loo_json <- function(f, method) {
  if (f$refused) return(paste0('{"refused":true,"error":', str1(f$error), '}'))
  l <- tryCatch(suppressWarnings(leave1out(f$fit)), error = function(e) e)
  if (inherits(l, "error")) return(paste0('{"refused":true,"error":', str1(conditionMessage(l)), '}'))
  paste0('{"refused":false,"mu":', arr(l$estimate), ',"se":', arr(l$se), ',"ciLo":', arr(l$ci.lb),
         ',"ciHi":', arr(l$ci.ub), ',"tau2":', if (is.null(l$tau2)) "null" else arr(l$tau2),
         ',"I2":', if (method == "FE") "null" else arr(l$I2), '}')
}

analysis_json <- function(id, source, measure, yi, vi, with_loo) {
  parts <- character()
  for (m in METHODS) for (t in TESTS) {
    f <- fit_one(yi, vi, m, t)
    body <- paste0('"fit":', fit_json(f, m))
    if (with_loo) body <- paste0(body, ',"loo":', loo_json(f, m))
    parts <- c(parts, paste0('"', m, "/", t, '":{', body, "}"))
  }
  paste0('{"id":', str1(id), ',"source":', str1(source), ',"measure":', str1(measure),
         ',"k":', length(yi), ',"loo":', if (with_loo) "true" else "false",
         ',"yi":', arr(yi), ',"vi":', arr(vi), ',"combos":{', paste(parts, collapse = ","), "}}")
}

het_path <- "heterogeneity/validate/corpus/corpus.json"
inf_path <- "influence/validate/corpus/corpus.json"
het <- fromJSON(het_path, simplifyVector = FALSE)
inf <- fromJSON(inf_path, simplifyVector = FALSE)
corpus <- c(lapply(het, function(a) list(src = "heterogeneity", a = a)),
            lapply(inf, function(a) list(src = "influence", a = a)))
one <- function(entry) {
  a <- entry$a
  if (entry$src == "heterogeneity") {
    rows <- strsplit(strsplit(a$text, "\n", fixed = TRUE)[[1]], "\\s*[,\t]\\s*")
    yi <- as.numeric(vapply(rows, function(p) p[length(p) - 1], ""))
    se <- as.numeric(vapply(rows, function(p) p[length(p)], ""))
    stopifnot(length(yi) == a$k, all(is.finite(yi)), all(se > 0))
    analysis_json(a$id, "heterogeneity", a$measure, yi, se^2, TRUE)
  } else {
    yi <- as.numeric(unlist(a$data$yi)); vi <- as.numeric(unlist(a$data$vi))
    stopifnot(length(yi) == length(vi), length(yi) >= 2, all(is.finite(yi)), all(vi > 0))
    analysis_json(a$id, "influence", family(a$data$definition), yi, vi, FALSE)
  }
}
write_bytes <- function(path, text) { con <- file(path, open = "wb"); writeLines(text, con, sep = "\n", useBytes = TRUE); close(con) }
if (!merging && n_shards > 1) {
  mine <- which((seq_along(corpus) - 1) %% n_shards == shard - 1)
  lines <- character()
  for (p in mine) { lines <- c(lines, paste0(p, "\t", one(corpus[[p]]))); cat(".") }
  write_bytes(paste0(out_path, ".part", shard), lines)
  cat("\nwrote shard", shard, "of", n_shards, ":", length(mine), "analyses\n")
  quit(save = "no", status = 0)
}
if (merging) {
  items <- character(length(corpus))
  for (i in seq_len(n_shards)) {
    for (line in readLines(paste0(out_path, ".part", i), encoding = "UTF-8")) {
      tab <- regexpr("\t", line, fixed = TRUE)
      p <- as.integer(substr(line, 1, tab - 1)); stopifnot(items[p] == "")
      items[p] <- substr(line, tab + 1, nchar(line))
    }
  }
  stopifnot(all(items != ""))
} else {
  items <- vapply(corpus, function(e) { cat("."); one(e) }, "")
}
header <- paste0('{"schemaVersion":1,"generator":"hub/shared/tests/_sensitivity_gen.R","versions":',
                 as.character(toJSON(lapply(versions, unbox))),
                 ',"control":{"threshold":1e-12,"maxiter":10000,"tol":1e-14}',
                 ',"methods":', as.character(toJSON(METHODS)), ',"tests":', as.character(toJSON(TESTS)),
                 ',"inputs":', as.character(toJSON(list(heterogeneity = unbox(het_path), influence = unbox(inf_path)))),
                 ',"analyses":[')
write_bytes(out_path, paste0(header, paste(items, collapse = ",\n"), "]}"))
cat("\nwrote", out_path, length(items), "analyses\n")
