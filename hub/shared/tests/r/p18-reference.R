# Run from wt/: Rscript hub/shared/tests/r/p18-reference.R
# Direct metafor oracles only: no JS values, profile replacement or boundary adjudication.
# Writes an R reference to the OS temporary directory. Retain those exact bytes as
# p18-reference.json after the first run; this script never overwrites that fixture.
suppressPackageStartupMessages({ library(metafor); library(jsonlite) })
folder <- "hub/shared/tests/r"
script <- file.path(folder, "p18-reference.R")
input_path <- file.path(folder, "p18-input.json")
input <- fromJSON(input_path, simplifyVector = FALSE)
vec <- function(x) unname(as.numeric(unlist(x)))
rows <- function(x) lapply(seq_len(nrow(x)), function(i) as.list(unname(x[i, ])))
mv_control <- list(optimizer = "nlminb", rel.tol = 1e-12, x.tol = 1e-12,
                   iter.max = 10000, eval.max = 20000)
uni_control <- list(threshold = 1e-12, maxiter = 10000)
capture <- function(fn) {
  warnings <- character()
  result <- withCallingHandlers(tryCatch(fn(), error = function(e)
    list(status = "error", message = conditionMessage(e))), warning = function(w) {
      warnings <<- c(warnings, conditionMessage(w)); invokeRestart("muffleWarning")
    })
  result$warnings <- as.list(warnings)
  result
}
reference <- function(studies) {
  Y <- do.call(rbind, lapply(studies, function(s) vec(s$y)))
  S <- lapply(studies, function(s) do.call(rbind, lapply(s$S, vec)))
  k <- nrow(Y)
  d <- data.frame(yi = as.vector(t(Y)), outcome = factor(rep(c("A", "B"), k), levels = c("A", "B")),
                  study = rep(seq_len(k), each = 2))
  mv <- capture(function() {
    f <- rma.mv(yi, V = bldiag(S), mods = ~ outcome - 1, random = ~ outcome | study,
                struct = "UN", method = "REML", test = "z", data = d, control = mv_control)
    list(status = "ok", k = k, m = 2, mu = as.list(vec(coef(f))), muSE = as.list(vec(f$se)),
         muVcov = rows(vcov(f)), G = rows(f$G), rho = as.numeric(f$rho),
         logLik = as.numeric(logLik(f)), z = as.list(vec(f$zval)), p = as.list(vec(f$pval)),
         ciLo = as.list(vec(f$ci.lb)), ciHi = as.list(vec(f$ci.ub)))
  })
  uni <- lapply(1:2, function(j) capture(function() {
    f <- rma(yi = Y[, j], vi = vapply(S, function(s) s[j, j], 0),
              method = "REML", test = "z", control = uni_control)
    list(status = "ok", k = f$k, mu = as.numeric(coef(f)), se = as.numeric(f$se),
         tau2 = f$tau2, logLik = as.numeric(logLik(f)), z = as.numeric(f$zval),
         p = as.numeric(f$pval), ciLo = as.numeric(f$ci.lb), ciHi = as.numeric(f$ci.ub))
  }))
  list(multivariate = mv, univariate = uni)
}
cases <- lapply(input$cases, function(c) {
  cat("R case:", c$id, "\n")
  c(list(id = c$id), reference(c$studies))
})
source <- Filter(function(c) c$id == input$sweep$caseId, input$cases)[[1]]
sweep <- lapply(input$sweep$grid, function(rw) {
  studies <- lapply(source$studies, function(s) {
    cv <- rw * sqrt(s$S[[1]][[1]] * s$S[[2]][[2]])
    s$S[[1]][[2]] <- cv; s$S[[2]][[1]] <- cv; s
  })
  cat("R sweep:", rw, "\n")
  list(rhoW = rw, multivariate = reference(studies)$multivariate)
})

# Explicit arrays and 17 significant digits preserve R doubles including zero.
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
  if (is.numeric(x) && is.finite(x)) return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  stop("Non-finite or unsupported oracle value")
}
out <- list(schema = "p18-rpar-reference-v1", provenance = list(
  R = R.version.string, metafor = as.character(packageVersion("metafor")),
  packages = lapply(c("metafor", "metadat", "Matrix", "nlme", "numDeriv", "jsonlite"),
    function(p) list(package = p, version = as.character(packageVersion(p)))),
  input_md5 = unname(tools::md5sum(input_path)), script_md5 = unname(tools::md5sum(script)),
  method = "metafor::rma.mv UN REML and metafor::rma REML, test='z'",
  mv_control = mv_control, uni_control = uni_control,
  serialization = "base R; 17 significant digits", adjudication = "none",
  pi = "Not offered by this app; no predict() PI is used"),
  input = input, normal975 = qnorm(.975), joint95 = qchisq(.95, 2), cases = cases, sweep = sweep)
path <- file.path(dirname(tempdir()), "p18-rpar-reference.json")
writeLines(json(out), path, useBytes = TRUE)
cat(R.version.string, "\nmetafor", as.character(packageVersion("metafor")), "\n")
cat("Saved p18-rpar-reference.json in the OS temporary directory\n")
for (c in cases) cat(c$id, c$multivariate$status, if (is.null(c$multivariate$message)) "" else c$multivariate$message, "\n")
