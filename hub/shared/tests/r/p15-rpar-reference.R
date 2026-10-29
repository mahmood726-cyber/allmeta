# Run from the tree root: Rscript hub/shared/tests/r/p15-rpar-reference.R
# Independent package oracle. Never reads the JavaScript engine or its outputs.
suppressPackageStartupMessages({ library(robumeta); library(clubSandwich); library(jsonlite) })
invisible(Sys.setlocale("LC_COLLATE", "C"))
input_path <- "hub/shared/tests/fixtures/p15-rpar-input.json"
script_path <- "hub/shared/tests/r/p15-rpar-reference.R"
output_path <- "hub/shared/tests/fixtures/p15-rpar-reference.json"
input <- fromJSON(input_path, simplifyVector = FALSE)

# Preserve binary64 reference values, including vectors of length one.
json <- function(x) {
  if (is.null(x)) return("null")
  if (is.list(x)) {
    parts <- vapply(x, json, "")
    if (!is.null(names(x))) return(paste0("{", paste0(vapply(names(x), json, ""), ":", parts, collapse = ","), "}"))
    return(paste0("[", paste(parts, collapse = ","), "]"))
  }
  stopifnot(length(x) == 1)
  if (is.character(x)) return(as.character(toJSON(x, auto_unbox = TRUE)))
  if (is.logical(x)) return(if (is.na(x)) "null" else if (x) "true" else "false")
  if (!is.finite(x)) return("null")
  sprintf("%.17g", x)
}
array <- function(x) unname(as.list(x))
matrix_rows <- function(x) lapply(seq_len(nrow(x)), function(i) array(x[i, ]))
table_rows <- function(x) lapply(seq_len(nrow(x)), function(i) as.list(x[i, , drop = FALSE]))
as_data <- function(rows) {
  d <- data.frame(cluster = vapply(rows, function(r) r[[1]], ""),
                  yi = vapply(rows, function(r) r[[2]], 0),
                  vi = vapply(rows, function(r) r[[3]], 0))
  p <- length(rows[[1]]) - 3L
  if (p > 0L) for (j in seq_len(p)) d[[paste0("x", j)]] <- vapply(rows, function(r) r[[3L + j]], 0)
  d
}
reference <- function(ds, rho, method, centred) {
  d <- as_data(ds$rows)
  predictors <- setdiff(names(d), c("cluster", "yi", "vi"))
  means <- vapply(d[predictors], mean, 0)
  if (centred) for (nm in predictors) d[[nm]] <- d[[nm]] - means[[nm]]
  formula <- reformulate(if (length(predictors)) predictors else "1", response = "yi")
  warnings <- character()
  id <- paste(ds$id, method, if (centred) "centred" else "raw", rho, sep = "/")
  result <- withCallingHandlers(tryCatch({
    fit <- robu(formula, data = d, studynum = cluster, var.eff.size = vi,
                modelweights = "CORR", rho = rho, small = TRUE)
    ord <- order(as.factor(d$cluster))
    stopifnot(identical(fit$data.full$effect.size, d$yi[ord]))
    weights <- numeric(nrow(d)); weights[ord] <- fit$data.full$r.weights
    X <- model.matrix(formula, d)
    m <- length(unique(d$cluster)); p <- ncol(X)
    if (method == "CR2") {
      rt <- fit$reg_table
      tab <- data.frame(estimate = rt$b.r, se = rt$SE, t = rt$t, df = rt$dfs,
                        p = rt$prob, ci_lo = rt$CI.L, ci_hi = rt$CI.U)
      V <- as.matrix(vcovCR(fit, type = "CR2"))
      ct <- as.data.frame(coef_test(fit, vcov = "CR2", test = "Satterthwaite"))
      ci <- as.data.frame(conf_int(fit, vcov = "CR2", test = "Satterthwaite", level = 0.95))
      club <- data.frame(estimate = ct$beta, se = ct$SE, t = ct$tstat, df = ct$df_Satt,
                         p = ct$p_Satt, ci_lo = ci$CI_L, ci_hi = ci$CI_U)
    } else {
      # The engine's legacy CR1 scalar is clubSandwich CR1S, NOT robu(small=FALSE).
      # Use canonical weighted lm + vcovCR with exactly the CORR fitted weights.
      model <- lm(formula, data = d, weights = weights)
      V <- as.matrix(vcovCR(model, cluster = d$cluster, type = "CR1S"))
      b <- as.numeric(coef(model)); se <- sqrt(diag(V)); df <- rep(m - p, p)
      tab <- data.frame(estimate = b, se = se, t = b / se, df = df,
                        p = 2 * pt(-abs(b / se), df),
                        ci_lo = b - qt(0.975, df) * se, ci_hi = b + qt(0.975, df) * se)
      club <- NULL
    }
    list(status = "ok", tau2 = as.numeric(fit$mod_info$tau.sq),
         m = m, k = nrow(d), p = p, weights = array(weights), covariance = matrix_rows(V),
         table = table_rows(tab), club = if (is.null(club)) NULL else table_rows(club),
         predictor_means = array(means), design = matrix_rows(X),
         kappa = kappa(crossprod(X, weights * X), exact = TRUE))
  }, error = function(e) list(status = "error", message = conditionMessage(e))),
  warning = function(w) { warnings <<- c(warnings, conditionMessage(w)); invokeRestart("muffleWarning") })
  list(id = id, dataset = ds$id, rho = rho, method = method, centred = centred,
       refusal = isTRUE(ds$refusal), warnings = array(warnings), R = result)
}
fits <- list()
for (ds in input$datasets) for (rho in ds$rho) for (method in ds$methods) for (centred in ds$centred)
  fits[[length(fits) + 1L]] <- reference(ds, rho, method, centred)
provenance <- list(R = R.version.string, platform = R.version$platform,
                   robumeta = as.character(packageVersion("robumeta")),
                   clubSandwich = as.character(packageVersion("clubSandwich")),
                   jsonlite = as.character(packageVersion("jsonlite")),
                   LC_COLLATE = Sys.getlocale("LC_COLLATE"),
                   generated_by = script_path, input_md5 = unname(tools::md5sum(input_path)),
                   script_md5 = unname(tools::md5sum(script_path)),
                   serialization = "base R; 17 significant digits",
                   CR2 = "robumeta::robu(CORR, small=TRUE); clubSandwich CR2 Satterthwaite",
                   CR1 = "robumeta CORR weights; lm; clubSandwich CR1S; t with m-p df")
writeLines(json(list(provenance = provenance, input = input, fits = fits)), output_path, useBytes = TRUE)
cat("Wrote", output_path, "with", length(fits), "fits\n")
cat(json(provenance), "\n")
for (f in fits) cat(f$id, f$R$status, if (f$R$status == "error") f$R$message else paste("tau2", f$R$tau2), "\n")
stopifnot(all(vapply(fits, function(f) f$refusal || f$R$status == "ok", TRUE)))
