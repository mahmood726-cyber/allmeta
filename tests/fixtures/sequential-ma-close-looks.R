# Reference for tests/test_sequential_ma_exact.py::test_closely_spaced_looks
# Lan-DeMets O'Brien-Fleming-type total spending, alpha = 0.05 two-sided, looks t = 0.5, 0.50001, 1.
# Two-sided boundaries solved with mvtnorm::pmvnorm (Miwa algorithm, exact up to its step count) on
# corr(Z_i, Z_j) = sqrt(t_i / t_j). Run: Rscript tests/fixtures/sequential-ma-close-looks.R
suppressMessages(library(mvtnorm))
t <- c(0.5, 0.50001, 1); a <- 0.05
f <- function(x) 2 - 2 * pnorm(qnorm(1 - a / 2) / sqrt(x))
cum <- f(t); inc <- diff(c(0, cum)); K <- length(t)
S <- outer(t, t, function(x, y) sqrt(pmin(x, y) / pmax(x, y)))
b <- numeric(K); b[1] <- qnorm(1 - inc[1] / 2)
for (k in 2:K) {
  g <- function(c) {
    cont <- pmvnorm(lower = -b[1:(k-1)], upper = b[1:(k-1)], sigma = S[1:(k-1), 1:(k-1)], algorithm = Miwa(steps = 4096))
    stay <- pmvnorm(lower = c(-b[1:(k-1)], -c), upper = c(b[1:(k-1)], c), sigma = S[1:k, 1:k], algorithm = Miwa(steps = 4096))
    (cont - stay) - inc[k]
  }
  b[k] <- uniroot(g, c(0.5, 20), tol = 1e-12)$root
}
cat(sprintf("%.10f\n", b))
# Look 2 by one-dimensional quadrature (Miwa is inaccurate at corr 0.99999): P(|Z1| < b1, |Z2| > c) = inc2.
rho <- sqrt(t[1] / t[2]); sg <- sqrt(1 - rho^2)
cr <- function(c) integrate(function(z) dnorm(z) * (pnorm((c - rho * z) / sg, lower.tail = FALSE) + pnorm((-c - rho * z) / sg)),
  -b[1], b[1], subdivisions = 10000L, rel.tol = 1e-13, abs.tol = 0)$value
cat(sprintf("look 2 by quadrature: %.10f
", uniroot(function(c) cr(c) - inc[2], c(1, 10), tol = 1e-13)$root))
