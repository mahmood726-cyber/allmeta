# Run from wt/: Rscript hub/shared/tests/unit/p19-f2-reference.R
# Record once BEFORE modifying the JS engine. Never overwrite an oracle.
# Independent QR WLS reference for the app's documented additive model:
# Q is the weighted residual sum of squares without centering the outcome.
# DL denominator = sum_i w_i (1 - h_ii), from the weighted QR projection.
# No metafor::rma.uni: its centered-Q convention is unsuitable for this design.
reference_path <- "hub/shared/tests/unit/p19-f2-reference.json"
if (file.exists(reference_path)) stop("Refusing to overwrite the recorded R reference")
html <- paste(readLines("component-nma/index.html", warn = FALSE, encoding = "UTF-8"), collapse = "\n")
example <- sub('^[\\s\\S]*?<textarea[^>]*id="src"[^>]*>([\\s\\S]*?)</textarea>[\\s\\S]*$', '\\1', html, perl = TRUE)
stopifnot(!identical(example, html))
texts <- list(
  example = example,
  ordinary = "a | control | 0.2 | 0.1\na | control | 0.3 | 0.1",
  heterogeneous = "a | control | -2 | .1\nb | control | 1 | .2\na+b | control | 3 | .3\na | b | 2 | .15\nb | control | -.5 | .25",
  saturated = "a | control | -.3 | .1\nb | control | .2 | .2"
)
reference_fit <- function(text) {
  rows <- strsplit(strsplit(text, "\n", fixed = TRUE)[[1]], "|", fixed = TRUE)
  rows <- lapply(rows, trimws)
  arm <- function(s) setdiff(strsplit(tolower(s), "+", fixed = TRUE)[[1]], "control")
  aa <- lapply(rows, function(r) arm(r[1]))
  bb <- lapply(rows, function(r) arm(r[2]))
  comps <- sort(unique(unlist(c(aa, bb))))
  # Bind contrast rows explicitly: vapply simplifies the one-component case
  # to a vector, and transposing that vector incorrectly gives a 1 x n design.
  X <- do.call(rbind, lapply(seq_along(rows), function(i)
    as.numeric(comps %in% aa[[i]]) - as.numeric(comps %in% bb[[i]])))
  y <- vapply(rows, function(r) as.numeric(r[3]), numeric(1))
  v <- vapply(rows, function(r) as.numeric(r[4])^2, numeric(1))
  stopifnot(nrow(X) == length(y), ncol(X) == length(comps), length(v) == length(y))
  w <- 1 / v
  fixed <- stats::lm.wfit(x = X, y = y, w = w)
  stopifnot(fixed$rank == length(comps))
  Q <- sum(w * fixed$residuals^2)
  df <- nrow(X) - ncol(X)
  leverage <- rowSums(qr.Q(fixed$qr)^2)
  denominator <- sum(w * (1 - leverage))
  tau2 <- if (df == 0) NULL else max(0, (Q - df) / denominator)
  weights <- 1 / (v + if (is.null(tau2)) 0 else tau2)
  random <- stats::lm.wfit(x = X, y = y, w = weights)
  covariance <- solve(crossprod(X * sqrt(weights)))
  effect <- function(parts) {
    contrast <- as.numeric(comps %in% parts)
    list(est = unname(sum(contrast * random$coefficients)),
         se = sqrt(drop(t(contrast) %*% covariance %*% contrast)))
  }
  components <- setNames(lapply(comps, effect), comps)
  combos <- sort(unique(vapply(Filter(length, c(aa, bb)), function(a) paste(sort(a), collapse = "+"), character(1))))
  combinations <- setNames(lapply(combos, function(c) effect(strsplit(c, "+", fixed = TRUE)[[1]])), combos)
  stopifnot(all(is.finite(unlist(c(components, combinations, list(Q, tau2))))))
  list(text = text, df = df, Q = Q, tau2 = tau2, components = components, combinations = combinations)
}
json <- function(x) {
  if (is.null(x)) return("null")
  if (is.list(x)) {
    fields <- vapply(x, json, character(1))
    if (!is.null(names(x))) {
      fields <- paste0(encodeString(names(x), quote = '"'), ":", fields)
      return(paste0("{", paste(fields, collapse = ","), "}"))
    }
    return(paste0("[", paste(fields, collapse = ","), "]"))
  }
  if (length(x) != 1L) return(json(as.list(x)))
  if (is.character(x) && !is.na(x)) return(encodeString(x, quote = '"'))
  if (is.numeric(x) && is.finite(x)) return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  stop("Unsupported reference value")
}
reference <- list(provenance = list(
  script = "p19-f2-reference.R", R = R.version.string,
  stats = as.character(packageVersion("stats")), base = as.character(packageVersion("base")),
  method = "stats::lm.wfit QR; uncentered weighted residual Q; generalized DL via QR leverage; solve(crossprod(sqrt(W)*X)) covariance",
  serialization = "base R; 17 significant digits"),
  cases = lapply(texts, reference_fit))
encoded <- json(reference)
# Required immutable reference fixture, not a test log or cache.
writeLines(encoded, reference_path, useBytes = TRUE)
cat(encoded, "\n")
