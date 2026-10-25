# Independent R recomputation of CSV values written by the browser spec.
# No JSON dependency, no JS outputs used as reference coefficients/CI bounds.
options(warn = 1)
if (!requireNamespace("metafor", quietly = TRUE)) stop("metafor is required")
arg <- grep("^--file=", commandArgs(FALSE), value = TRUE)
if (length(arg) != 1L) stop("Run this check with Rscript --vanilla <script>")
here <- dirname(normalizePath(sub("^--file=", "", arg), mustWork = TRUE))
out <- file.path(here, "..", "rchecks-out", "p0rve_corr")
read_output <- function(name, columns) {
  path <- file.path(out, name)
  if (!file.exists(path)) stop("Missing page output: ", name, "; run features-p0rve-corr.spec.mjs first")
  d <- read.csv(path, stringsAsFactors = FALSE, check.names = FALSE, na.strings = "NA")
  if (!nrow(d) || !identical(names(d), columns) || anyNA(d)) stop("Invalid CSV schema/data: ", name)
  d
}
near <- function(actual, expected, label) {
  if (!is.numeric(actual) || !is.numeric(expected) || length(actual) != length(expected) ||
      !length(actual) || any(!is.finite(actual)) || any(!is.finite(expected)) ||
      any(abs(actual - expected) > 1e-6)) stop("Numerical mismatch: ", label)
}
exact <- function(actual, expected, label) {
  if (!identical(as.character(actual), as.character(expected))) stop("Exact mismatch: ", label)
}

input <- read_output("correlation-input.csv", c("label", "r", "n"))
if (nrow(input) < 2 || any(!is.finite(input$r)) || any(abs(input$r) >= 1) ||
    any(!is.finite(input$n)) || any(input$n <= 3)) stop("Invalid correlation inputs")
z <- metafor::escalc(measure = "ZCOR", ri = input$r, ni = input$n)
observed <- read_output("correlation-ci.csv", c("surface", "method", "test", "mu_z", "r", "r_lo", "r_hi", "ci_excludes_0"))
exact(paste(observed$surface, observed$method, observed$test),
      c("panel REML z", "panel REML knha", "main-export REML z"), "correlation coverage")
reference <- lapply(c("z", "knha"), function(t) metafor::rma(yi = z$yi, vi = z$vi,
  method = "REML", test = t, control = list(threshold = 1e-12, maxiter = 10000, stepadj = .5)))
names(reference) <- c("z", "knha")
check_corr <- function(rows) {
  for (i in seq_len(nrow(rows))) {
    r <- rows[i, ]
    if (!r$test %in% names(reference) || r$method != "REML") stop("Unsupported CI method in page output")
    fit <- reference[[r$test]]
    expected <- c(as.numeric(coef(fit)), tanh(as.numeric(coef(fit))), tanh(fit$ci.lb), tanh(fit$ci.ub))
    near(as.numeric(r[c("mu_z", "r", "r_lo", "r_hi")]), expected, paste(r$surface, r$test))
    exact(r$ci_excludes_0, as.integer(fit$ci.lb > 0 || fit$ci.ub < 0), "CI excludes zero")
  }
}
check_corr(observed)
labels <- read_output("correlation-labels.csv", c("surface", "method"))
exact(labels$surface, c("headline", "live", "export", "panel"), "label surfaces")
exact(labels$method, c("Wald z", "Wald z", "Wald z", "HKSJ"), "CI method labels")

path <- file.path(out, "rve-input.csv")
if (!file.exists(path)) stop("Missing page output: rve-input.csv")
d <- read.csv(path, stringsAsFactors = FALSE, check.names = FALSE)
if (ncol(d) < 4 || !identical(names(d)[1:3], c("cluster", "yi", "vi")) || !nrow(d) || anyNA(d)) stop("Invalid RVE input schema")
predictors <- names(d)[-(1:3)]
if (any(!vapply(d[-1], is.numeric, logical(1))) || any(!is.finite(as.matrix(d[-1]))) || any(d$vi <= 0)) stop("Invalid RVE inputs")
rve <- read_output("rve-coefficients.csv", c("scenario", "index", "term", "estimate", "tau2", "rho", "centred", "label"))
exact(unique(rve$scenario), c("raw", "centred", "intercept-only"), "RVE scenario coverage")

# HTJ CORR moment equation in matrix form, for environments without robumeta.
# Independent WLS residual projection and cluster blocks; no page weights/tau2.
corr_mom <- function(X, y, vi, cluster, rho) {
  groups <- split(seq_along(y), cluster)
  size <- ave(vi, cluster, FUN = length)
  vbar <- ave(vi, cluster, FUN = mean)
  w <- 1 / (size * vbar)
  bread <- solve(crossprod(X, w * X))
  resid <- y - X %*% (bread %*% crossprod(X, w * y))
  A <- B <- C <- matrix(0, ncol(X), ncol(X))
  for (idx in groups) {
    xj <- X[idx, , drop = FALSE]
    outer_sum <- tcrossprod(colSums(xj))
    cross <- crossprod(xj)
    A <- A + w[idx[1]]^2 * outer_sum
    B <- B + w[idx[1]] / length(idx) * cross
    C <- C + w[idx[1]] / length(idx) * (outer_sum - cross)
  }
  tr <- function(x) sum(diag(x))
  denom <- sum(w) - tr(bread %*% A)
  if (!is.finite(denom) || denom <= 0) stop("Invalid CORR moment denominator")
  tau2 <- max(0, (sum(w * resid^2) - length(groups) + tr(bread %*% B) + rho * tr(bread %*% C)) / denom)
  list(tau2 = tau2, weights = 1 / (size * (vbar + tau2)))
}

use_robumeta <- requireNamespace("robumeta", quietly = TRUE)
for (scenario in c("raw", "centred", "intercept-only")) {
  got <- rve[rve$scenario == scenario, ]
  mods <- if (scenario == "intercept-only") character() else predictors
  centred <- scenario == "centred"
  exact(got$index, seq_len(length(mods) + 1L) - 1L, paste(scenario, "coefficient indices"))
  exact(got$centred, rep(as.integer(centred), nrow(got)), paste(scenario, "centred flag"))
  if (length(unique(got$rho)) != 1L || !is.finite(got$rho[1]) || got$rho[1] < 0 || got$rho[1] > 1) stop("Invalid rho")
  intercept <- if (!length(mods)) "(intercept)" else if (centred)
    "Intercept (effect at predictor means; not an overall pooled effect)" else
    paste0("Intercept (effect when ", paste(paste0(mods, " = 0"), collapse = " and "), "; not an overall pooled effect)")
  exact(got$label, c(intercept, mods), paste(scenario, "on-screen coefficient labels"))
  export_intercept <- if (centred) "(intercept: effect at predictor means)" else "(intercept)"
  exact(got$term, c(export_intercept, mods), paste(scenario, "canonical export terms"))
  data <- d
  if (centred) for (name in mods) data[[name]] <- data[[name]] - mean(data[[name]])
  X <- cbind(1, as.matrix(data[, mods, drop = FALSE]))
  moments <- corr_mom(X, data$yi, data$vi, data$cluster, got$rho[1])
  if (use_robumeta) {
    # Formula names are generated locally; user column names remain labels only.
    dat <- data.frame(yi = data$yi, vi = data$vi, cluster = data$cluster)
    xn <- paste0("x", seq_along(mods))
    if (length(mods)) for (j in seq_along(mods)) dat[[xn[j]]] <- X[, j + 1L]
    form <- if (length(mods)) reformulate(xn, response = "yi") else yi ~ 1
    fit <- robumeta::robu(form, data = dat, studynum = cluster, var.eff.size = vi,
                          modelweights = "CORR", rho = got$rho[1], small = TRUE)
    expected <- fit$reg_table$b.r
    tau2 <- as.numeric(fit$mod_info$tau.sq)
    near(moments$tau2, tau2, paste(scenario, "independent CORR moments"))
  } else {
    fit <- metafor::rma(yi = data$yi, vi = data$vi, mods = X, intercept = FALSE,
                       weights = moments$weights, method = "FE")
    fit <- metafor::robust(fit, cluster = data$cluster, clubSandwich = FALSE)
    expected <- as.numeric(coef(fit))
    tau2 <- moments$tau2
  }
  near(got$estimate, as.numeric(expected), paste(scenario, "RVE coefficients"))
  near(got$tau2, rep(tau2, nrow(got)), paste(scenario, "CORR tau2"))
}

# The same checker must reject a deliberately corrupted copy of a page row.
plant <- observed[1, , drop = FALSE]
plant$r_lo <- plant$r_lo + 0.01
detected <- tryCatch({ check_corr(plant); FALSE }, error = function(e) {
  if (!grepl("Numerical mismatch", conditionMessage(e), fixed = TRUE)) stop(e)
  TRUE
})
if (!isTRUE(detected)) stop("Planted wrong CI was not detected")
cat("PLANT_DETECTED\n")
cat("RVE reference: ", if (use_robumeta) "robumeta CORR" else "metafor robust + base-R CORR moments", "\n", sep = "")
cat("R_CHECK_PASS\n")
