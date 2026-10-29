# Supplement the first native-R run without replacing any successful reference.
# Fixed optimizer policy, independent of JS outputs. Keep every warning/error.
# Run from wt/: Rscript hub/shared/tests/r/p18-reference-bfgs.R
suppressPackageStartupMessages({ library(metafor); library(jsonlite) })
folder <- "hub/shared/tests/r"
script <- file.path(folder, "p18-reference-bfgs.R")
input_path <- file.path(folder, "p18-input.json")
original_path <- file.path(folder, "p18-reference.json")
input <- fromJSON(input_path, simplifyVector = FALSE)
vec <- function(x) unname(as.numeric(unlist(x)))
rows <- function(x) lapply(seq_len(nrow(x)), function(i) as.list(unname(x[i, ])))
control <- list(optimizer = "optim", optmethod = "BFGS", reltol = 1e-12, maxit = 10000)
reference <- function(studies) {
  warnings <- character()
  result <- withCallingHandlers(tryCatch({
    Y <- do.call(rbind, lapply(studies, function(s) vec(s$y)))
    S <- lapply(studies, function(s) do.call(rbind, lapply(s$S, vec)))
    k <- nrow(Y)
    d <- data.frame(yi = as.vector(t(Y)),
      outcome = factor(rep(c("A", "B"), k), levels = c("A", "B")),
      study = rep(seq_len(k), each = 2))
    f <- rma.mv(yi, V = bldiag(S), mods = ~ outcome - 1,
      random = ~ outcome | study, struct = "UN", method = "REML", test = "z",
      data = d, control = control)
    list(status = "ok", k = k, m = 2, mu = as.list(vec(coef(f))),
      muSE = as.list(vec(f$se)), muVcov = rows(vcov(f)), G = rows(f$G),
      rho = as.numeric(f$rho), logLik = as.numeric(logLik(f)),
      z = as.list(vec(f$zval)), p = as.list(vec(f$pval)),
      ciLo = as.list(vec(f$ci.lb)), ciHi = as.list(vec(f$ci.ub)))
  }, error = function(e) list(status = "error", message = conditionMessage(e))),
    warning = function(w) {
      warnings <<- c(warnings, conditionMessage(w)); invokeRestart("muffleWarning")
    })
  result$warnings <- as.list(warnings)
  result
}
with_rho <- function(studies, rw) lapply(studies, function(s) {
  cv <- rw * sqrt(s$S[[1]][[1]] * s$S[[2]][[2]])
  s$S[[1]][[2]] <- cv; s$S[[2]][[1]] <- cv; s
})
cases <- lapply(input$cases, function(c) {
  cat("BFGS case:", c$id, "\n")
  list(id = c$id, multivariate = reference(c$studies))
})
source <- Filter(function(c) c$id == input$sweep$caseId, input$cases)[[1]]
sweep <- lapply(input$sweep$grid, function(rw) {
  cat("BFGS sweep:", rw, "\n")
  list(rhoW = rw, multivariate = reference(with_rho(source$studies, rw)))
})
# The previously adjudicated Craft result is the -0.3 sweep, not supplied S.
craft <- Filter(function(c) c$id == "craft-boundary", input$cases)[[1]]
extra_input <- list(id = "craft-rho-minus03", compareRho = TRUE,
  source = craft$source, rhoW = -0.3, studies = with_rho(craft$studies, -0.3))
extra <- list(input = extra_input, multivariate = reference(extra_input$studies))

# Same lossless serializer as the retained first-run generator.
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
out <- list(schema = "p18-rpar-bfgs-v1", provenance = list(
  R = R.version.string, metafor = as.character(packageVersion("metafor")),
  packages = lapply(c("metafor", "metadat", "Matrix", "nlme", "numDeriv", "jsonlite"),
    function(p) list(package = p, version = as.character(packageVersion(p)))),
  input_md5 = unname(tools::md5sum(input_path)), script_md5 = unname(tools::md5sum(script)),
  original_md5 = unname(tools::md5sum(original_path)), control = control,
  method = "metafor::rma.mv UN REML, test='z'", adjudication = "none",
  policy = "Fill only missing multivariate values; retain all successful first-run references",
  serialization = "base R; 17 significant digits"),
  cases = cases, sweep = sweep, additional = list(extra))
writeLines(json(out), file.path(dirname(tempdir()), "p18-rpar-bfgs.json"), useBytes = TRUE)
for (c in cases) cat(c$id, c$multivariate$status,
  if (is.null(c$multivariate$logLik)) c$multivariate$message else format(c$multivariate$logLik, digits = 17), "\n")
for (s in sweep) cat("rhoW", s$rhoW, s$multivariate$status, "\n")
cat(extra_input$id, extra$multivariate$status, "\n")
cat(R.version.string, "\nmetafor", as.character(packageVersion("metafor")), "\n")
cat("Saved supplementary p18-rpar-bfgs.json in the OS temporary directory\n")
