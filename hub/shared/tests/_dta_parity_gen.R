# Ground truth for the DTA parity spec (dta-bivariate-mada-parity.spec.mjs).
#
# Fits mada 0.5.12's reitsma() (bivariate random-effects model; mvmeta 1.0.3 underneath) to every
# dataset shipped with mada, across every estimation method and continuity-correction rule, plus
# meta-regressions on the smoking data, and writes data and results to _dta_parity_fixture.json
# (numbers with 17 significant digits).
#
#   Rscript _dta_parity_gen.R _dta_parity_fixture.json
#
# Grid: method in reml/ml/fixed/mm/vc x correction.control in all/single/none (correction 0.5).
# A fit mada refuses (e.g. correction "none" with a zero cell) is recorded with its error message.
# Per fit: coefficients, vcov, Psi, logLik (mada's Jacobian-adjusted value), AIC, BIC, convergence;
# for intercept-only random-effects fits also summary Se/FPR with 95% CIs, the random-effects
# correlation, the Rutter-Gatsonis (HSROC) parameters, AUC and partial AUC (Rutter-Gatsonis and
# naive SROC), SROC values on a grid, and the 95% confidence and prediction region ellipses
# (100 points each; prediction region = ellipse(Psi + vcov), as plot.reitsma(predict = TRUE)).
# Per dataset and correction rule: the Moses-Littenberg regression of mslSROC().
suppressMessages(library(mada))
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[1] else "_dta_parity_fixture.json"

get_ds <- function(d) { e <- new.env(); data(list = d, package = "mada", envir = e); get(d, envir = e) }
num <- function(x) ifelse(is.finite(x), formatC(x, digits = 17, format = "g"), "null")
vec <- function(x) paste0("[", paste(num(as.numeric(x)), collapse = ","), "]")
str <- function(s) paste0('"', gsub('["\\\\\n\r\t]', " ", s), '"')
obj <- function(...) { a <- list(...); a <- a[!vapply(a, is.null, NA)]; paste0("{", paste(paste0('"', names(a), '":', unlist(a)), collapse = ","), "}") }
tryq <- function(e) { r <- try(suppressWarnings(e), silent = TRUE); if (inherits(r, "try-error")) NULL else r }

FPRGRID <- c(0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 0.99)

fitone <- function(d, method, cc, formula = NULL) {
  head <- list(method = str(method), correction = str(cc), formula = if (is.null(formula)) NULL else str(deparse(formula)))
  args <- list(data = d, method = method, correction.control = cc)
  if (!is.null(formula)) args$formula <- formula
  f <- try(suppressWarnings(do.call(reitsma, args)), silent = TRUE)
  if (inherits(f, "try-error") || any(!is.finite(as.numeric(coef(f))))) {
    msg <- if (inherits(f, "try-error")) as.character(f) else "non-finite estimates"
    return(do.call(obj, c(head, list(ok = "false", error = str(substr(msg, 1, 200))))))
  }
  ll <- as.numeric(f$logLik)
  res <- list(ok = "true", p = num(nrow(f$coefficients)),
    coef = vec(f$coefficients), vcov = vec(vcov(f)), Psi = if (is.null(f$Psi)) NULL else vec(f$Psi),
    logLik = num(ll), df = num(attr(f$logLik, "df")),
    AIC = if (is.finite(ll)) num(AIC(f)) else NULL, BIC = if (is.finite(ll)) num(BIC(f)) else NULL,
    converged = if (is.null(f$converged)) NULL else tolower(as.character(f$converged)))
  if (is.null(formula) && !is.null(f$Psi)) {
    s <- summary(f)
    tf <- s$coefficients
    res$summary <- obj(sens = vec(tf["sensitivity", c(1, 5, 6)]), fpr = vec(tf["false pos. rate", c(1, 5, 6)]),
                       corRandom = num(s$corRandom[1, 2]))
    h <- mada:::calc_hsroc_coef(f)
    res$hsroc <- obj(Theta = num(h$Theta), Lambda = num(h$Lambda), beta = num(h$beta),
                     sigma2theta = num(h$sigma2theta), sigma2alpha = num(h$sigma2alpha))
    a1 <- tryq(AUC(f, sroc.type = "ruttergatsonis")); a2 <- tryq(AUC(f, sroc.type = "naive"))
    res$auc <- obj(rg = if (is.null(a1)) NULL else vec(c(a1$AUC, a1$pAUC)), naive = if (is.null(a2)) NULL else vec(c(a2$AUC, a2$pAUC)))
    res$sroc <- obj(fpr = vec(FPRGRID), rg = vec(sroc(f, fpr = FPRGRID, type = "ruttergatsonis")[, 2]),
                    naive = vec(sroc(f, fpr = FPRGRID, type = "naive")[, 2]))
    mu <- f$coefficients["(Intercept)", ]
    ce <- ROCellipse(f, add = FALSE)$ROCellipse
    pe <- ellipse::ellipse(f$Psi + vcov(f), centre = mu, level = 0.95)
    res$conf <- obj(fpr = vec(ce[, 1]), sens = vec(ce[, 2]))
    res$pred <- obj(fpr = vec(plogis(pe[, 2])), sens = vec(plogis(pe[, 1])))
  }
  do.call(obj, c(head, res))
}

DS <- c("AuditC", "Dementia", "IAQ", "SAQ", "skin_tests", "smoking")
METHODS <- c("reml", "ml", "fixed", "mm", "vc")
CC <- c("all", "single", "none")
REG <- list(smoking = list(~ type, ~ population, ~ type + population))

dsj <- character()
for (dn in DS) {
  x <- as.data.frame(get_ds(dn))
  d <- data.frame(TP = x$TP, FN = x$FN, FP = x$FP, TN = x$TN)
  if (!is.null(x$type)) d$type <- as.character(x$type)
  if (!is.null(x$population)) d$population <- as.character(x$population)
  fits <- character()
  for (cc in CC) for (me in METHODS) fits <- c(fits, fitone(d, me, cc))
  for (fm in REG[[dn]]) for (me in METHODS) {
    rhs <- paste(deparse(fm[[2]]), collapse = "")
    fits <- c(fits, fitone(d, me, "all", as.formula(paste("cbind(tsens, tfpr) ~", rhs))))
  }
  ms <- vapply(CC, function(cc) {
    m <- tryq(mslSROC(d, correction.control = cc, extrapolate = TRUE))
    if (is.null(m) || !all(is.finite(c(m$A1, m$B1)))) return(obj(correction = str(cc), ok = "false"))
    obj(correction = str(cc), ok = "true", A1 = num(m$A1), B1 = num(m$B1))
  }, "")
  rows <- vapply(seq_len(nrow(d)), function(i) obj(TP = num(d$TP[i]), FN = num(d$FN[i]), FP = num(d$FP[i]), TN = num(d$TN[i]),
    type = if (is.null(d$type)) NULL else str(d$type[i]), population = if (is.null(d$population)) NULL else str(d$population[i])), "")
  dsj <- c(dsj, sprintf('{"dataset":"%s","rows":[%s],"moses":[%s],"fits":[%s]}', dn,
                        paste(rows, collapse = ","), paste(ms, collapse = ","), paste(fits, collapse = ",")))
  cat(dn, length(fits), "")
}
writeLines(sprintf('{"generator":"_dta_parity_gen.R","R":"%s","mada":"%s","mvmeta":"%s","ellipse":"%s","datasets":[\n%s\n]}',
                   getRversion(), packageVersion("mada"), packageVersion("mvmeta"), packageVersion("ellipse"),
                   paste(dsj, collapse = ",\n")), out, useBytes = TRUE)
cat("\nwrote", out, "\n")
