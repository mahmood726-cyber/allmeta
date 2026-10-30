# Run from wt: Rscript hub/shared/tests/r/nma-edge-parity.R
# Fresh references only; output and inspected package source go to the OS temp directory.
suppressPackageStartupMessages(library(netmeta))
script <- "hub/shared/tests/r/nma-edge-parity.R"
to_json <- function(x) {
  if (is.null(x)) return("null")
  if (is.data.frame(x)) x <- unname(lapply(seq_len(nrow(x)), function(i) as.list(x[i, , drop = FALSE])))
  if (is.list(x)) {
    v <- vapply(x, to_json, character(1))
    if (!is.null(names(x))) return(paste0("{", paste0(encodeString(names(x), quote = '"'), ":", v, collapse = ","), "}"))
    return(paste0("[", paste(v, collapse = ","), "]"))
  }
  if (length(x) != 1L) return(to_json(unname(as.list(x))))
  if (is.na(x) || (is.numeric(x) && !is.finite(x))) return("null")
  if (is.character(x)) return(encodeString(x, quote = '"'))
  if (is.logical(x)) return(if (x) "true" else "false")
  sprintf("%.17g", x)
}
rows <- function(study, t1, t2, est, se) data.frame(study, t1, t2, est, se, stringsAsFactors = FALSE)
cases <- list()
add <- function(id, family, d, sm = "MD", arms = NULL) {
  cases[[id]] <<- list(id = id, family = family, sm = sm, rows = d, arms = arms)
}
add("single_two", "k1", rows("One", "A", "B", .4, .2))
single_three <- rows("Three", c("A", "A", "B"), c("B", "C", "C"), c(.3, .7, .4), sqrt(c(.05, .08, .09)))
add("single_three", "k1", single_three)
add("two_pair_tau0", "k2", rows(c("S1", "S2"), "A", "B", c(.2, .2), c(.1, .15)))
add("two_pair_heterogeneous", "k2", rows(c("S1", "S2"), "A", "B", c(-.4, .8), c(.1, .15)))
add("two_tree", "k2", rows(c("S1", "S2"), c("A", "B"), c("B", "C"), c(.2, .4), c(.1, .15)))
other_three <- single_three
other_three$study <- "Other"
other_three$est <- c(-.5, .2, .7)
add("two_multiarm", "k2", rbind(single_three, other_three))
# Four two-arm studies / three treatments: df.Q = 2, k - 1 = 3.
# Symmetric replicated designs put Q just below, exactly at, and above df.
boundary_scales <- c(zero = 0, below = sqrt(1 - 1e-4), at = 1, above = sqrt(1 + 1e-4))
for (id in names(boundary_scales)) {
  s <- boundary_scales[[id]]
  add(paste0("boundary_", id), "tau_boundary", rows(paste0("S", 1:4), "A", c("B", "B", "C", "C"), c(-s, s, 0, 0), 1))
}
add("pi_df2", "prediction", rows(paste0("S", 1:4), "A", c("B", "B", "C", "C"), c(-1, 1, -.4, .8), c(.1, .2, .15, .25)))
add("pi_pair_df2", "prediction", rows(paste0("S", 1:3), "A", "B", c(-.5, .2, 1), c(.1, .2, .15)))
add("pi_df3", "prediction", rows(paste0("S", 1:5), c("A", "A", "A", "A", "B"), c("B", "B", "C", "C", "C"), c(-1, 1, -.4, .8, .2), c(.1, .2, .15, .25, .18)))

# The same raw arms are passed to meta::pairwise and the app's extraction converter.
# Canonical pairwise defaults (only0, increment 0.5, allstudies FALSE) are explicit;
# double-zero omissions are preserved, never silently removed from app input.
base_arms <- data.frame(study = rep(paste0("S", 1:4), each = 2),
  treatment = c("A", "B", "A", "B", "A", "C", "B", "C"),
  events = c(4, 9, 8, 3, 5, 10, 7, 12), n = c(40, 45, 55, 50, 48, 52, 60, 65))
for (sm in c("OR", "RR")) for (kind in c("nonzero", "single_zero", "multiarm_zero", "double_zero")) {
  a <- base_arms
  if (kind == "single_zero") a$events[1] <- 0
  if (kind == "double_zero") a$events[1:2] <- 0
  if (kind == "multiarm_zero") a <- rbind(a, data.frame(study = "ZeroThree", treatment = c("A", "B", "C"), events = c(0, 4, 9), n = c(30, 40, 50)))
  p <- pairwise(treat = treatment, event = events, n = n, studlab = study, data = a,
    sm = sm, incr = .5, method.incr = "only0", allstudies = FALSE, warn = FALSE)
  d <- rows(as.character(p$studlab), as.character(p$treat2), as.character(p$treat1), p$TE, p$seTE)
  add(paste0(tolower(sm), "_", kind), "zero_cells", d, sm, a)
}

fit_case <- function(c, ci) {
  warnings <- character()
  f <- tryCatch(withCallingHandlers(netmeta(TE = c$rows$est, seTE = c$rows$se,
    treat1 = c$rows$t2, treat2 = c$rows$t1, studlab = c$rows$study, sm = c$sm,
    common = TRUE, random = TRUE, method.tau = "DL", method.random.ci = ci,
    prediction = TRUE, reference.group = "A"), warning = function(w) {
      warnings <<- c(warnings, conditionMessage(w)); invokeRestart("muffleWarning")
    }), error = function(e) e)
  if (inherits(f, "error")) return(list(ci = ci, ok = FALSE, error = conditionMessage(f), warnings = unname(as.list(warnings))))
  tr <- f$trts
  mat <- function(M) {
    if (!is.matrix(M)) return(NULL)
    unname(lapply(tr, function(t) unname(as.list(M[t, tr]))))
  }
  league <- function(model) setNames(lapply(c("TE", "seTE", "lower", "upper", "pval"), function(field) mat(f[[paste(field, model, sep = ".")]])), c("TE", "seTE", "lower", "upper", "pval"))
  rank <- function(direction) {
    p <- suppressWarnings(netrank(f, small.values = direction))
    list(common = unname(as.list(p$ranking.common[tr])), random = unname(as.list(p$ranking.random[tr])))
  }
  dd <- tryCatch(suppressWarnings(decomp.design(f, warn = FALSE)), error = function(e) NULL)
  decomp <- if (is.null(dd)) NULL else list(Q = unname(as.list(dd$Q.decomp$Q)), df = unname(as.list(dd$Q.decomp$df)), pval = unname(as.list(dd$Q.decomp$pval)))
  pred <- if (is.matrix(f$lower.predict)) list(lower = mat(f$lower.predict), upper = mat(f$upper.predict)) else NULL
  # Independently record the claimed t(df.Q) PI and the pairwise t(k-1) diagnostic.
  pi_rule <- function(df) {
    if (!(df > 0)) return(NULL)
    w <- qt(.975, df) * sqrt(f$seTE.random^2 + f$tau2)
    list(df = df, critical = qt(.975, df), lower = mat(f$TE.random - w), upper = mat(f$TE.random + w))
  }
  list(ci = ci, ok = TRUE, treatments = unname(as.list(tr)), k = f$k, m = f$m, n = f$n,
    Q = f$Q, df = f$df.Q, pvalQ = f$pval.Q, tau2 = f$tau2, tau = f$tau,
    I2 = f$I2, lowerI2 = f$lower.I2, upperI2 = f$upper.I2,
    common = league("common"), random = league("random"), predict = pred, decomp = decomp,
    pscore = list(desirable = rank("desirable"), undesirable = rank("undesirable")),
    pi_q_df = pi_rule(f$df.Q), pi_k_minus_1 = pi_rule(f$k - 1), warnings = unname(as.list(warnings)))
}
for (id in names(cases)) {
  cases[[id]]$fits <- lapply(c("classic", "t-dist"), function(ci) fit_case(cases[[id]], ci))
  cat(id, paste(vapply(cases[[id]]$fits, function(f) if (f$ok) paste0("OK(k=", f$k, ",df=", f$df, ")") else paste("REFUSED", f$error), ""), collapse = " / "), "\n")
}
out <- list(provenance = list(R = R.version.string, netmeta = as.character(packageVersion("netmeta")),
  meta = as.character(packageVersion("meta")), metafor = as.character(packageVersion("metafor")),
  generator = script, generator_md5 = unname(tools::md5sum(script)),
  method_tau = "DL", level = .95, continuity = "pairwise(incr=0.5, method.incr='only0', allstudies=FALSE)",
  orientation = "app est=t2-t1; netmeta treat1=app t2, treat2=app t1",
  prediction = "netmeta prediction=TRUE; independent qt(.975,df.Q) and qt(.975,k-1) diagnostics"), cases = unname(cases))
dest <- file.path(dirname(tempdir()), "nma-edge-parity-reference.json")
writeLines(to_json(out), dest, useBytes = TRUE)
cat("ORACLE_PATH:", dest, "\n")
for (nm in c("netmeta", "nma_ruecker", "decomp.design")) {
  if (exists(nm, envir = asNamespace("netmeta"), inherits = FALSE)) {
    dest <- file.path(dirname(tempdir()), paste0("nma-edge-source-", nm, ".R"))
    writeLines(deparse(get(nm, envir = asNamespace("netmeta"))), dest)
    cat("SOURCE_PATH:", dest, "\n")
  }
}
for (nm in c("pairwise", "metabin")) {
  pkg <- if (exists(nm, envir = asNamespace("meta"), inherits = FALSE)) "meta" else "netmeta"
  dest <- file.path(dirname(tempdir()), paste0("nma-edge-source-", nm, ".R"))
  writeLines(deparse(get(nm, envir = asNamespace(pkg), inherits = FALSE)), dest)
  cat("SOURCE_PATH:", dest, "(namespace", pkg, ")\n")
}
