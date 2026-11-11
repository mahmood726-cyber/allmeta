library(jsonlite)
fr <- function(x) { x1 <- x[1]; x2 <- x[2]; 100 * (x2 - x1 * x1)^2 + (1 - x1)^2 }
grr <- function(x) { x1 <- x[1]; x2 <- x[2]; c(-400 * x1 * (x2 - x1 * x1) - 2 * (1 - x1), 200 * (x2 - x1 * x1)) }
# 25-dim extended Rosenbrock (optim help example), bounded
flb <- function(x) { p <- length(x); s <- 0; v <- c(1, rep(4, p-1)) * (x - c(1, x[-p])^2)^2; for (i in seq_along(v)) s <- s + v[i]; s }
cases <- list()
add <- function(name, fn, gr, par, lower, upper) {
  r <- optim(par, fn, gr, method = "L-BFGS-B", lower = lower, upper = upper)
  cases[[length(cases)+1]] <<- list(name=name, par0=par, lower=lower, upper=upper, gr=!is.null(gr),
    par=r$par, value=r$value, counts=unname(r$counts), conv=r$convergence, msg=r$message)
}
add("rosen-gr", fr, grr, c(-1.2,1), c(-Inf,-Inf), c(Inf,Inf))
add("rosen-nogr", fr, NULL, c(-1.2,1), c(-Inf,-Inf), c(Inf,Inf))
add("rosen-box-gr", fr, grr, c(-1.2,1), c(-2,-0.5), c(0.5,0.2))
add("rosen-box-nogr", fr, NULL, c(-1.2,1), c(-2,-0.5), c(0.5,0.2))
add("rosen-lowonly", fr, grr, c(3,3), c(1.5,-Inf), c(Inf,Inf))
add("flb25", flb, NULL, rep(3, 25), rep(2, 25), rep(4, 25))
add("flb25-mixed", flb, NULL, rep(3, 25), c(rep(-Inf,10), rep(2, 15)), c(rep(Inf,5), rep(4, 20)))
add("rosen-start-out", fr, grr, c(5,5), c(-2,-2), c(2,2))
writeLines(toJSON(cases, digits = NA, auto_unbox = TRUE), "optim-lbfgsb-fixture.json")
