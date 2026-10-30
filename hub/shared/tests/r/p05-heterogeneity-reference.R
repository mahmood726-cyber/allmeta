# Run from wt/: Rscript hub/shared/tests/r/p05-heterogeneity-reference.R
# Native metafor oracle for the shipped heterogeneity page, including its
# documented DL -> PM fallback. Never replace a previously recorded oracle.
suppressPackageStartupMessages(library(metafor))
script_path <- "hub/shared/tests/r/p05-heterogeneity-reference.R"
reference_path <- "hub/shared/tests/r/p05-heterogeneity-reference.json"
if (file.exists(reference_path)) stop("Refusing to overwrite the recorded R reference")

# Base R serialization preserves 17 significant digits without jsonlite.
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
  if (is.logical(x) && !is.na(x)) return(if (x) "true" else "false")
  if (is.numeric(x) && is.finite(x))
    return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  stop("Non-finite or unsupported value in R reference")
}

methods <- c("pm", "reml", "ml", "eb", "sj", "he", "hs", "dl")
unequal_y <- c(-0.5, 0.1, 1.2, -0.2, 0.8, 0.05, -0.7, 0.4, 1.0, -0.1, 0.6)
unequal_se <- c(0.1, 0.4, 0.2, 0.3, 0.15, 0.35, 0.12, 0.25, 0.18, 0.28, 0.22)
case <- function(id, group, yi, se, requested = methods)
  list(id = id, group = group, yi = yi, se = se, methods = requested)
cases <- list(
  case("single_study", "small_k", 0.2, 0.1),
  case("two_study", "small_k", c(-0.5, 0.7), c(0.1, 0.4)),
  case("zero_q", "zero_boundary", rep(0, 10), seq(0.1, 0.28, length.out = 10)),
  case("hk_floor", "zero_boundary", c(0.20, 0.21, 0.19, 0.205, 0.195,
       0.202, 0.198, 0.207, 0.193, 0.201), rep(0.2, 10)),
  case("unequal_k10", "estimator_outputs_and_dl_boundary", unequal_y[1:10], unequal_se[1:10]),
  case("dl_k9", "dl_boundary", unequal_y[1:9], unequal_se[1:9], "dl"),
  case("dl_k11", "dl_boundary", unequal_y, unequal_se, "dl"),
  case("scale_control", "root_brackets", c(-1, 0, 1), rep(0.1, 3), c("pm", "eb", "reml")),
  case("scale_6000", "root_brackets", c(-6000, 0, 6000), rep(600, 3), c("pm", "eb", "reml")),
  case("scale_60000", "root_brackets", c(-60000, 0, 60000), rep(6000, 3), c("pm", "eb", "reml"))
)

controls <- function(yi, vi) {
  scale2 <- max(1, vi, if (length(yi) > 1) var(yi) else 0)
  list(tol = 1e-12 * scale2, threshold = 1e-12 * scale2,
       maxiter = 10000, tau2.max = 1e6 * scale2)
}
fit <- function(yi, vi, method, test = "z") {
  rma.uni(yi = yi, vi = vi, method = toupper(method), test = test,
          control = controls(yi, vi))
}
q_i2 <- function(f) if (f$k > 1 && f$QE > f$k - 1) 100 * (f$QE - (f$k - 1)) / f$QE else 0
pooled <- function(f) list(tau2 = f$tau2, mu = as.numeric(coef(f)), se = f$se,
                           ciLo = f$ci.lb, ciHi = f$ci.ub, I2 = q_i2(f))

references <- lapply(cases, function(d) {
  yi <- d$yi; vi <- d$se^2; k <- length(yi)
  out <- list(id = d$id, group = d$group, yi = as.list(yi), se = as.list(d$se),
              methods = as.list(d$methods), k = k)
  if (k == 1) {
    # The app intentionally refuses pooling k=1. FE is an R control for the
    # single-study summaries used by the k=2 leave-one-out calculation.
    out$fixed_effect_control <- pooled(fit(yi, vi, "FE"))
    out$app_contract <- "notPooled: true; no CI/PI or estimated heterogeneity"
    return(out)
  }
  qfit <- fit(yi, vi, "DL")
  qp <- confint(qfit, type = "QP", control = controls(yi, vi))$random
  out$common <- list(Q = qfit$QE, pQ = qfit$QEp, df = k - 1,
                     I2 = q_i2(qfit), tCrit = qt(0.975, k - 1),
                     tau2Lo = qp["tau^2", "ci.lb"], tau2Hi = qp["tau^2", "ci.ub"],
                     I2Lo = qp["I^2(%)", "ci.lb"], I2Hi = qp["I^2(%)", "ci.ub"])
  out$fits <- setNames(lapply(d$methods, function(requested) {
    used <- if (requested == "dl" && k < 10) "pm" else requested
    z <- fit(yi, vi, used)
    hk <- fit(yi, vi, used, "adhoc")
    # The app promises the unadjusted SE with t_(k-1). test='knha' would
    # change the SE; predict() on test='z' would use a normal critical value.
    tfit <- fit(yi, vi, used, "t")
    pi <- predict(tfit)
    normal_pi <- predict(z)
    plain_hk <- fit(yi, vi, used, "knha")
    loo_method <- if (used == "dl" && k - 1 < 10) "pm" else used
    loo <- lapply(seq_len(k), function(i) {
      f <- fit(yi[-i], vi[-i], if (k == 2) "FE" else loo_method)
      c(list(k = k - 1, estimator = loo_method), pooled(f))
    })
    c(list(estimator = used, dlRefused = requested == "dl" && k < 10), pooled(z),
      list(I2Model = z$I2, seHKSJ = hk$se, ciLoHKSJ = hk$ci.lb, ciHiHKSJ = hk$ci.ub,
           piLo = pi$pi.lb, piHi = pi$pi.ub,
           normalPiLo = normal_pi$pi.lb, normalPiHi = normal_pi$pi.ub,
           unmodifiedHkSE = plain_hk$se, loo = loo))
  }), d$methods)
  out
})

reference <- list(
  provenance = list(script = script_path, script_md5 = unname(tools::md5sum(script_path)),
    R = R.version.string, platform = R.version$platform,
    packages = lapply(c("metafor", "metadat", "Matrix", "nlme", "numDeriv"), function(pkg)
      list(package = pkg, version = as.character(packageVersion(pkg)))),
    serialization = "base R; 17 significant digits",
    controls = "tol = threshold = 1e-12 * max(1, vi, var(yi)); maxiter = 10000; tau2.max = 1e6 * max(1, vi, var(yi))",
    intervals = "rma.uni(test=z); rma.uni(test=adhoc); predict(rma.uni(test=t)); confint(type=QP)",
    I2 = "I2Model from rma.uni$I2; Q-based I2 computed from rma.uni$QE and k-1",
    loo = "Refit each omission; DL falls back to PM below k=10; k=1 uses FE",
    scale_cases = "Identical data in 1, 6000 and 60000 effect units; no R result rescaled by hand"),
  cases = references)
encoded <- json(reference)
writeLines(encoded, reference_path, useBytes = TRUE)
cat("Wrote native R reference:", reference_path, "\n")
cat(R.version.string, "; metafor", as.character(packageVersion("metafor")), "\n")
cat(length(references), "cases;", sum(vapply(references, function(x) length(x$fits), integer(1))), "configurations\n")
