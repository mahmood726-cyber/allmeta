# Ground truth for the dose-response parity specs (dose-response-dosresmeta-*.spec.mjs).
#
# Fits dosresmeta 2.2.0 (with rms for the spline basis) to every multi-study binary dataset
# shipped with dosresmeta, after dropping studies without case/total counts, across the
# model x covariance x approach x method grid the app supports, and writes the data and the
# results to _dr_parity_fixture.json (numbers with 17 significant digits).
#
#   Rscript _dr_parity_gen.R _dr_parity_fixture.json
#
# Models: linear (logrr ~ dose), quadratic (+ I(dose^2)), rcs3/rcs4/rcs5 (rms::rcs at Harrell's
# percentiles of all doses in the dataset: 10/50/90; 5/35/65/95; 5/27.5/50/72.5/95).
# Per fit: coefficients, vcov, Psi, logLik, convergence; qtest (two-stage); Wald tests (all
# coefficients; non-linear terms); gof(fixed = TRUE); predictions on a 7-dose grid versus the
# smallest dose. A fit dosresmeta refuses is recorded with its error message.
suppressMessages({ library(dosresmeta); library(rms) })
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[1] else "_dr_parity_fixture.json"

get_ds <- function(d) { e <- new.env(); data(list = d, package = "dosresmeta", envir = e); get(d, envir = e) }
spec <- list(
  alcohol_crc = c(dose = "dose", cases = "cases", n = "peryears", logrr = "logrr", se = "se"),
  alcohol_cvd = c(dose = "dose", cases = "cases", n = "n", logrr = "logrr", se = "se"),
  alcohol_esoph = c(dose = "dose", cases = "cases", n = "n", logrr = "logrr", se = "se"),
  alcohol_lc = c(dose = "dose", cases = "cases", n = "peryears", logrr = "logrr", se = "se"),
  bmi_rc = c(dose = "bmi", cases = "case", n = "n", logrr = "logor", se = "se_logor"),
  coffee_cancer = c(dose = "dose", cases = "cases", n = "n", logrr = "logrr", se = "se"),
  coffee_cvd = c(dose = "dose", cases = "cases", n = "n", logrr = "logrr", se = "se"),
  coffee_mort = c(dose = "dose", cases = "cases", n = "n", logrr = "logrr", se = "se", mod = "year"),
  coffee_mort_add = c(dose = "dose", cases = "cases", n = "n", logrr = "logrr", se = "se"),
  coffee_stroke = c(dose = "dose", cases = "cases", n = "n", logrr = "logrr", se = "se", mod = "nordic"),
  fish_ra = c(dose = "dose", cases = "cases", n = "n", logrr = "logrr", se = "se"),
  milk_mort = c(dose = "dose", cases = "cases", n = "n", logrr = "logrr", se = "se"),
  milk_ov = c(dose = "dose", cases = "case", n = "n", logrr = "logrr", se = "se"),
  oc_breast = c(dose = "duration", cases = "cases", n = "n", logrr = "logor", se = "se"),
  process_bc = c(dose = "dose", cases = "cases", n = "n", logrr = "logrr", se = "se"),
  red_bc = c(dose = "dose", cases = "cases", n = "n", logrr = "logrr", se = "se"),
  sim_os = c(dose = "dose", cases = "cases", n = "n", logrr = "logrr", se = "se")
)
PROBS <- list(rcs3 = c(.10, .50, .90), rcs4 = c(.05, .35, .65, .95), rcs5 = c(.05, .275, .50, .725, .95))

num <- function(x) ifelse(is.finite(x), formatC(x, digits = 17, format = "g"), "null")
vec <- function(x) paste0("[", paste(num(as.numeric(x)), collapse = ","), "]")
str <- function(s) paste0('"', gsub('["\\\\\n\r\t]', " ", s), '"')
obj <- function(...) { a <- list(...); a <- a[!vapply(a, is.null, NA)]; paste0("{", paste(paste0('"', names(a), '":', unlist(a)), collapse = ","), "}") }

fitone <- function(d, model, covariance, proc, method, mod = NULL) {
  k <- if (startsWith(model, "rcs")) as.numeric(quantile(d$dose, PROBS[[model]])) else NULL
  fml <- switch(model, linear = logrr ~ dose, quadratic = logrr ~ dose + I(dose^2), logrr ~ rcs(dose, k))
  environment(fml) <- environment()
  args <- list(formula = fml, id = d$id, type = d$type, se = d$se, cases = d$cases, n = d$n, data = d,
               covariance = covariance, proc = proc, method = method)
  if (!is.null(mod)) args$mod <- as.formula(paste("~", mod))
  f <- try(suppressWarnings(do.call(dosresmeta, args)), silent = TRUE)
  head <- list(model = str(model), covariance = str(covariance), proc = str(proc), method = str(method),
               mod = if (is.null(mod)) NULL else str(mod), knots = if (is.null(k)) NULL else vec(k))
  if (inherits(f, "try-error")) return(do.call(obj, c(head, list(ok = "false", error = str(substr(as.character(f), 1, 200))))))
  b <- coef(f); V <- vcov(f); q <- f$dim$q
  wall <- waldtest(Sigma = V, b = b, Terms = seq_along(b))$chitest
  wnl <- if (q > 1 && is.null(mod)) waldtest(Sigma = V, b = b, Terms = 2:q)$chitest else NULL
  qt <- if (proc == "2stage") qtest(f) else NULL
  g <- try(gof(f), silent = TRUE)
  gj <- if (inherits(g, "try-error")) NULL else
    obj(D = num(g$deviance$D), df = num(g$deviance$df), p = num(g$deviance$p), R2 = num(g$R2), R2adj = num(g$R2adj),
        resid = vec(g$tdata$tresiduals))
  pj <- NULL
  if (is.null(mod)) {
    grid <- c(min(d$dose), as.numeric(quantile(d$dose, c(.1, .25, .5, .75, .9))), max(d$dose))
    p <- predict(f, data.frame(dose = grid), xref = grid[1], expo = FALSE)
    pj <- obj(dose = vec(grid), pred = vec(p$pred), se = vec((p$ci.ub - p$pred) / qnorm(0.975)))
  }
  do.call(obj, c(head, list(ok = "true", coef = vec(b), vcov = vec(V), Psi = if (is.null(f$Psi)) NULL else vec(f$Psi),
    logLik = num(as.numeric(f$logLik)), converged = if (is.null(f$converged)) NULL else tolower(as.character(f$converged)),
    q = num(q), qtest = if (is.null(qt)) NULL else obj(Q = vec(qt$Q), df = vec(qt$df), p = vec(qt$pvalue)),
    wald = vec(wall), waldNonlin = if (is.null(wnl)) NULL else vec(wnl), gof = gj, pred = pj)))
}

GRID <- list()
for (m in c("linear", "quadratic", "rcs3", "rcs4", "rcs5")) {
  for (me in c("reml", "ml", "fixed", "mm")) GRID[[length(GRID) + 1]] <- list(m, "gl", "2stage", me)
  for (me in c("reml", "ml", "fixed")) GRID[[length(GRID) + 1]] <- list(m, "gl", "1stage", me)
}
for (m in c("linear", "rcs3", "rcs4")) for (pr in c("2stage", "1stage")) GRID[[length(GRID) + 1]] <- list(m, "h", pr, "reml")
for (m in c("linear", "rcs3")) for (pr in c("2stage", "1stage")) GRID[[length(GRID) + 1]] <- list(m, "indep", pr, "reml")

dsj <- character()
for (dn in names(spec)) {
  x <- get_ds(dn); m <- spec[[dn]]
  d <- data.frame(id = as.character(x$id), type = as.character(x$type), dose = x[[m["dose"]]], cases = x[[m["cases"]]],
                  n = x[[m["n"]]], logrr = x[[m["logrr"]]], se = x[[m["se"]]], stringsAsFactors = FALSE)
  if (!is.na(m["mod"])) d$modv <- as.numeric(x[[m["mod"]]])
  bad <- unique(d$id[is.na(d$cases) | is.na(d$n)])
  d <- d[!d$id %in% bad, ]
  if (length(unique(d$id)) < 2) next
  d$id <- factor(d$id, levels = unique(d$id))
  fits <- vapply(GRID, function(g) fitone(d, g[[1]], g[[2]], g[[3]], g[[4]]), "")
  if (!is.na(m["mod"])) {
    names(d)[names(d) == "modv"] <- m["mod"]
    fits <- c(fits, vapply(c("linear", "rcs3"), function(mm) fitone(d, mm, "gl", "2stage", "reml", mod = m["mod"]), ""))
  }
  rows <- vapply(seq_len(nrow(d)), function(i) obj(id = str(as.character(d$id[i])), type = str(d$type[i]),
    dose = num(d$dose[i]), cases = num(d$cases[i]), n = num(d$n[i]), logrr = num(d$logrr[i]), se = num(d$se[i]),
    mod = if (is.na(m["mod"])) NULL else num(d[[m["mod"]]][i])), "")
  dsj <- c(dsj, sprintf('{"dataset":"%s","excluded":%d,"rows":[%s],"fits":[%s]}', dn, length(bad),
                        paste(rows, collapse = ","), paste(fits, collapse = ",")))
  cat(dn, "")
}
writeLines(sprintf('{"generator":"_dr_parity_gen.R","R":"%s","dosresmeta":"%s","rms":"%s","mixmeta":"%s","datasets":[\n%s\n]}',
                   getRversion(), packageVersion("dosresmeta"), packageVersion("rms"), packageVersion("mixmeta"),
                   paste(dsj, collapse = ",\n")), out, useBytes = TRUE)
cat("\nwrote", out, "\n")
