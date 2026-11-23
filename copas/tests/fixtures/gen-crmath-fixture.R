## gen-crmath-fixture.R -- R's own exp(), log() and ^ for crmath.test.mjs.
##
## shared/copas-core.js evaluates the Copas likelihood with CORRECTLY ROUNDED
## exp, log and pow (crmath), because V8's Math.exp/log are not, and R's
## L-BFGS-B path depends on the last bit of f and g. This fixture records what
## R 4.6.0 itself returns, BIT-EXACTLY (C99 hex floats), at arguments drawn
## from the ranges the likelihood uses, so the test can state -- and pin --
## how often R's own libm is not correctly rounded (it is not, everywhere:
## R on Windows links mingw-w64's x87-based exp/log, and x^y is powl()).
##
## Arguments: full 53-bit uniforms (two runif draws per value), fixed seed.
## Usage: Rscript gen-crmath-fixture.R <out.json>      (R 4.6.0, jsonlite)
suppressMessages(library(jsonlite))
stopifnot(getRversion() == "4.6.0")
out <- commandArgs(TRUE)[1]
set.seed(20261112)
u53 <- function(n) (floor(runif(n) * 2^26) * 2^27 + floor(runif(n) * 2^27)) / 2^53
unif <- function(n, a, b) a + (b - a) * u53(n)
logu <- function(n, a, b) exp(log(a) + (log(b) - log(a)) * u53(n))
hx <- function(v) sprintf("%a", v)
n <- 1000
## exp: the likelihood's arguments (pnorm's -xsq*xsq/2 and -del/2, dnorm's
## -x^2/2) span [-745, 0]; plus the subnormal-result tail and positives.
y <- unif(n / 4, 0, 38.4674); xsq <- trunc(y * 16) / 16; del <- (y - xsq) * (y + xsq)
ea <- c(unif(n / 4, -745, 0), unif(n / 4, -40, 0), -xsq * (xsq / 2), -(del / 2),
        unif(n / 8, -745.13, -708.4), sample(c(-1, 1), n / 8, TRUE) * logu(n / 8, 2^-60, 709),
        0, 1, -1, 2^-1074, -2^-1074, 709.782712893384, -745.1332191019411, -708.3964185322641,
        log(2), -log(2), 1e-300)
## log: pnorm(v) in (0, 1], s2t2 log-uniform, near 1, and the whole range.
la <- c(u53(n / 4) + 2^-53, logu(n / 4, 1e-6, 10), 1 + sample(c(-1, 1), n / 4, TRUE) *
        sample(1:4096, n / 4, TRUE) * 2^-52 / 2, logu(n / 4, 2^-1074, 1.7e308),
        1 - 2^-53, 1 + 2^-52, 2, 0.5, 2^-1074, 2^-1022, .Machine$double.xmax, 10, exp(1))
## (1 - rho2T)^-1.5: x in (0, 1], also very close to 1.
pa <- c(u53(n / 2) + 2^-53, 1 - logu(n / 4, 2^-50, 1 - 2^-20), logu(n / 4, 2^-60, 1),
        0.25, 4, 1 / 16, 0.5, 1 - 2^-53)
## general x^y
px <- logu(n / 2, 1e-5, 1e5); py <- unif(n / 2, -20, 20)
fix <- list(
  r_version = R.version.string, platform = R.version$platform,
  exp = list(x = hx(ea), r = hx(exp(ea))),
  log = list(x = hx(la), r = hx(log(la))),
  pow15 = list(x = hx(pa), r = hx(pa^(-1.5))),
  powxy = list(x = hx(px), y = hx(py), r = hx(px^py)))
writeLines(toJSON(fix, auto_unbox = TRUE), out)
cat("wrote", out, ":", length(ea), length(la), length(pa), length(px), "\n")
