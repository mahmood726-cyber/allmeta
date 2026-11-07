# Read-only investigation of P16-R1; does not regenerate or replace the oracle.
# Run p16-prepare-reference.py first. All diagnostic output goes to the wrapper.
suppressPackageStartupMessages(library(netmeta))
source(file.path(dirname(tempdir()), "rpar-P16-input.R"), local = TRUE)
stopifnot(identical(prepared_input_md5,
  unname(tools::md5sum("hub/shared/tests/fixtures/p16-nma-inconsistency-input.json"))))
cat("VERSIONS", R.version.string, "netmeta", as.character(packageVersion("netmeta")), "\n")
for (id in c("tree_k3", "tree_replicated", "tau_zero", "triangle_k3")) {
  case <- Filter(function(x) identical(x$id, id), inputs$networks)[[1]]
  d <- do.call(rbind, lapply(case$rows, as.data.frame, stringsAsFactors = FALSE))
  tr <- sort(unique(c(d$A, d$B)))
  m <- netmeta(TE = d$te, seTE = d$se, treat1 = d$A, treat2 = d$B,
    studlab = d$study, sm = "MD", reference.group = tr[1],
    common = TRUE, random = TRUE, method.tau = "DL", tau.preset = NULL,
    sep.trts = " ~~ ", warn = FALSE)
  cat("RAW DL", id, "\n")
  dput(list(k = nrow(d), treatments = length(tr), df = m$df.Q,
    Q = m$Q, tau = m$tau, tau2 = m$tau^2,
    tau_is_na = is.na(m$tau), tau_is_nan = is.nan(m$tau),
    common = m$TE.common[, tr[1]], random = m$TE.random[, tr[1]],
    se_common = m$seTE.common[, tr[1]], se_random = m$seTE.random[, tr[1]]))
}

# Print only tau assignments and their immediate context from installed
# netmeta functions. This records the actual package branch, not a conjecture
# about whether the unavailable value originates from 0/0 or an explicit guard.
ns <- asNamespace("netmeta")
for (name in ls(ns, all.names = TRUE)) {
  fn <- get(name, envir = ns, inherits = FALSE)
  if (!is.function(fn)) next
  lines <- deparse(body(fn), width.cutoff = 100)
  hits <- grep("^ *tau(2)? *<-", lines)
  if (!length(hits) || !any(grepl("df", lines, fixed = TRUE))) next
  indices <- sort(unique(unlist(lapply(hits, function(i) seq.int(max(1L, i - 5L), min(length(lines), i + 5L))))))
  cat("PACKAGE SOURCE", name, "(numbered deparse lines)\n")
  cat(sprintf("%4d %s\n", indices, lines[indices]), sep = "")
}
