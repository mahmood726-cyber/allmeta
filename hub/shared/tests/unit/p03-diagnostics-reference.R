# Run from wt/. Keep generated output in the OS temporary directory; retain
# the fresh reference as a fixture only after inspecting the wrapper output.
input_path <- "hub/shared/tests/unit/p03-diagnostics-input.csv"
rows <- read.csv(input_path, stringsAsFactors = FALSE)
n1 <- rows$tp + rows$fn
n0 <- rows$fp + rows$tn
ess <- 4 * n1 * n0 / (n1 + n0)
x <- 1 / sqrt(ess)
y <- log((rows$tp * rows$tn) / (rows$fp * rows$fn))
fit <- stats::lm(y ~ x, weights = ess)
co <- summary(fit)$coefficients
deeks <- list(slope = unname(co[2, 1]), intercept = unname(co[1, 1]),
  t = unname(co[2, 3]), df = fit$df.residual, p = unname(co[2, 4]))
fagan <- lapply(c(0.05, 0.20, 0.70), function(pre) {
  lr_pos <- 5
  lr_neg <- 0.2
  # Bayes expressed in probability space, independent of the JS odds formula.
  list(lr_pos = lr_pos, lr_neg = lr_neg, pre_prob = pre,
    post_pos = pre * lr_pos / (1 - pre + pre * lr_pos),
    post_neg = pre * lr_neg / (1 - pre + pre * lr_neg))
})
# Dependency-free JSON with 17 significant digits for native doubles.
json <- function(x) {
  if (is.data.frame(x)) x <- unname(lapply(seq_len(nrow(x)), function(i) as.list(x[i, , drop = FALSE])))
  if (is.list(x)) {
    values <- vapply(x, json, character(1))
    if (!is.null(names(x))) return(paste0("{", paste0(encodeString(names(x), quote = '"'), ":", values, collapse = ","), "}"))
    return(paste0("[", paste(values, collapse = ","), "]"))
  }
  if (length(x) != 1L) return(json(unname(as.list(x))))
  if (is.character(x)) return(encodeString(x, quote = '"'))
  stopifnot(is.numeric(x), is.finite(x))
  sprintf("%.17g", x)
}
input_md5 <- (function() {
  # Match the retained LF oracle on both LF and CRLF checkouts. Binary writing
  # prevents Windows from converting the canonical bytes back to CRLF.
  canonical_path <- tempfile("p03-lf-input-")
  on.exit(unlink(canonical_path))
  input_bytes <- readChar(input_path, file.info(input_path)$size, useBytes = TRUE)
  writeBin(charToRaw(gsub("\r\n", "\n", input_bytes, fixed = TRUE)), canonical_path)
  unname(tools::md5sum(canonical_path))
})()
out <- list(provenance = list(R = R.version.string,
  stats = as.character(packageVersion("stats")),
  script = "hub/shared/tests/unit/p03-diagnostics-reference.R",
  input_md5 = input_md5,
  serialization = "base R; 17 significant digits"), rows = rows, deeks = deeks, fagan = fagan)
dest <- file.path(dirname(tempdir()), "p03-f1-reference.json")
writeLines(json(out), dest, useBytes = TRUE)
cat("ORACLE_PATH:", dest, "\n")
cat(json(out), "\n")
