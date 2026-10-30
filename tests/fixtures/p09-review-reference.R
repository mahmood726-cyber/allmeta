# Fresh reference for the protections identified in the PR #322 review.
# Writes only to the system temporary directory; import its exact bytes as the fixture.
suppressMessages(library(netmeta))
suppressMessages(library(metafor))
library(jsonlite)
out <- list(provenance = list(R = R.version.string,
  netmeta = as.character(packageVersion("netmeta")),
  metafor = as.character(packageVersion("metafor")),
  meta = as.character(packageVersion("meta")), jsonlite = as.character(packageVersion("jsonlite"))))
# Print the primary-source weighting implementation even if a subsequent fit fails.
cat(toJSON(out$provenance, auto_unbox = TRUE), "\n")
cat("NETMETA_MULTIARM_SOURCE\n")
print(getFromNamespace("multiarm", "netmeta"))
for (name in c("netmeta", "nma", "netmeta.netmeta", "netmeta0")) {
  if (!exists(name, envir = asNamespace("netmeta"), inherits = FALSE)) next
  lines <- deparse(getFromNamespace(name, "netmeta"))
  hits <- grep("multiarm|Q <-|tau2 <-|seTE.adj|TE.adj|Q.het|tau.preset|tcrossprod|crossprod", lines)
  keep <- sort(unique(unlist(lapply(hits, function(i) seq(max(1, i - 3), min(length(lines), i + 5))))))
  cat("NETMETA_WEIGHTING_EXCERPTS:", name, "\n")
  cat(paste(keep, lines[keep], sep = ": "), sep = "\n")
}
target <- file.path(dirname(tempdir()), "rev-P09-f7-reference.json")
save_reference <- function() {
  writeLines(toJSON(out, digits = NA, auto_unbox = TRUE, dataframe = "rows", pretty = TRUE), target, useBytes = TRUE)
  cat("REFERENCE_FILE:", normalizePath(target, winslash = "/"), "\n")
}
out$nma <- list()
for (arms in c(3, 4)) for (rounded in c(FALSE, TRUE)) for (heterogeneous in c(FALSE, TRUE)) {
  theta <- c(0, .3, .5, .8)[seq_len(arms)]
  av <- c(.011, .023, .031, .047)[seq_len(arms)]
  pairs <- t(combn(seq_len(arms), 2))
  d <- data.frame(study = "Multi", t1 = LETTERS[pairs[,1]], t2 = LETTERS[pairs[,2]],
    est = theta[pairs[,2]] - theta[pairs[,1]], se = sqrt(av[pairs[,1]] + av[pairs[,2]]))
  if (rounded) d$est[nrow(d)] <- d$est[nrow(d)] + .0006
  d <- rbind(d, data.frame(study = c("Two1", "Two2"), t1 = "A", t2 = "B",
    est = if (heterogeneous) c(-.5, 1.1) else c(.2, .4), se = c(.15, .19)))
  f <- suppressWarnings(netmeta(TE = -d$est, seTE = d$se, treat1 = d$t1, treat2 = d$t2,
    studlab = d$study, sm = "MD", common = TRUE, random = TRUE, reference.group = "A"))
  tr <- LETTERS[seq_len(arms)]
  mat <- function(m) unname(lapply(tr, function(i) unname(sapply(tr, function(j) m[i,j]))))
  id <- paste(arms, if (rounded) "rounded" else "consistent", if (heterogeneous) "heterogeneous" else "quiet", sep = "-")
  out$nma[[id]] <- list(rows = d, treatments = tr,
    common = list(TE = mat(f$TE.common), seTE = mat(f$seTE.common)),
    random = list(TE = mat(f$TE.random), seTE = mat(f$seTE.random)),
    Q = f$Q, tau2 = f$tau2)
}
save_reference()
out$reml <- list()
synthetic <- data.frame(cluster = rep(0:5, each = 3),
  y = rep((0:5 - 2) / 2, each = 3) + rep((-1:1) / 4, 6), v = rep((1:3) / 64, 6))
kon <- fromJSON("hub/shared/tests/_kon_data.json")
datasets <- list(synthetic = synthetic, konstantopoulos = data.frame(cluster = kon$district, y = kon$yi, v = kon$vi))
for (id in names(datasets)) {
  d <- datasets[[id]]; d$unit <- seq_len(nrow(d))
  # A centered parameterization avoids cancellation in the independent R oracle too.
  origin <- d$y[1]
  cat("REML_DATASET:", id, "\n")
  control <- list(rel.tol = 1e-12, iter.max = 10000, eval.max = 20000)
  f <- tryCatch(rma.mv(yi = d$y - origin, V = d$v, random = ~ 1 | cluster/unit, data = d, method = "REML",
    control = control), error = function(e) e)
  first_error <- NULL
  if (inherits(f, "error")) {
    first_error <- conditionMessage(f)
    cat("NLMINB_ERROR:", first_error, "\n")
    control <- list(optimizer = "optim", optmethod = "BFGS", reltol = 1e-12, maxit = 10000)
    f <- rma.mv(yi = d$y - origin, V = d$v, random = ~ 1 | cluster/unit, data = d, method = "REML",
      control = control)
  }
  out$reml[[id]] <- list(rows = d[c("cluster", "y", "v")], expected = list(mu = as.numeric(f$b) + origin,
    se = as.numeric(f$se), sigma2Between = f$sigma2[1], sigma2Within = f$sigma2[2],
    logLik = as.numeric(logLik(f)), ciLo = as.numeric(f$ci.lb) + origin, ciHi = as.numeric(f$ci.ub) + origin),
    optimizer = list(control = control, initial_nlminb_error = first_error))
  save_reference()
}
cat("REFERENCE_COMPLETE\n")
