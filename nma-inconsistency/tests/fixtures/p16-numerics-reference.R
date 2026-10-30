# Independent weighted-linear-model control, executed in native R via RUN.txt.
# Print the fixture for capture; do not write test output into the source tree.
# Only base R and stats are needed. Emit JSON without an optional package.
json <- function(x) {
  if (is.list(x)) {
    values <- vapply(x, json, character(1))
    if (is.null(names(x))) return(paste0('[', paste(values, collapse = ','), ']'))
    return(paste0('{', paste(paste0(encodeString(names(x), quote = '"'), ':', values), collapse = ','), '}'))
  }
  if (length(x) != 1) return(paste0('[', paste(vapply(as.list(x), json, character(1)), collapse = ','), ']'))
  if (is.character(x)) return(encodeString(x, quote = '"'))
  stopifnot(is.numeric(x), is.finite(x))
  sprintf('%.17g', x)
}
y <- c(0.2, 0.3, 0.6)
X <- rbind(c(-1, 0), c(1, -1), c(0, -1))
V <- solve(crossprod(X))
beta <- as.vector(V %*% crossprod(X, y))
Q <- sum((y - as.vector(X %*% beta))^2)
direct <- y
indirect <- c(y[3] - y[2], y[3] - y[1], y[1] + y[2])
diff <- direct - indirect
z <- diff / sqrt(3)
out <- list(versions = list(R = R.version.string, stats = as.character(packageVersion('stats'))),
  input = 'A,B,0.2,1\nB,C,0.3,1\nA,C,0.6,1',
  beta = beta, se = sqrt(diag(V)), Q = Q, df = 1,
  dbt = list(Q = Q, df = 1, p = pchisq(Q, 1, lower.tail = FALSE)),
  splits = lapply(seq_along(y), function(i) list(comparison = c('A vs B', 'B vs C', 'A vs C')[i],
    direct = direct[i], indirect = indirect[i], directSE = 1, indirectSE = sqrt(2),
    diff = diff[i], seDiff = sqrt(3), z = z[i], p = 2 * pnorm(-abs(z[i])))))
cat(json(out), '\n')
