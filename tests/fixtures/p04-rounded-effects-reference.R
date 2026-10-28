# Fresh P04-R1 oracle. Outputs go to the OS temporary directory, never the tree.
suppressMessages(library(netmeta))
# CSV mirrors the JSON input without requiring an optional JSON package in R.
# The unit tests compare every oracle row with the original JSON input.
all_rows <- read.csv("tests/fixtures/p04-rounded-effects-input.csv",
  stringsAsFactors = FALSE)
inputs <- lapply(unique(all_rows$case), function(nm)
  all_rows[all_rows$case == nm, setdiff(names(all_rows), "case"), drop = FALSE])
names(inputs) <- unique(all_rows$case)

# Dependency-free JSON for these ASCII fixture names and finite R numbers.
# Lists remain arrays (including length-one lists); named lists are objects.
to_json <- function(x) {
  if (is.data.frame(x)) x <- unname(lapply(seq_len(nrow(x)), function(i)
    as.list(x[i, , drop = FALSE])))
  if (is.list(x)) {
    values <- vapply(x, to_json, character(1))
    if (!is.null(names(x))) return(paste0("{", paste0(
      encodeString(names(x), quote = '"'), ":", values, collapse = ","), "}"))
    return(paste0("[", paste(values, collapse = ","), "]"))
  }
  if (length(x) != 1L) return(to_json(unname(as.list(x))))
  if (is.na(x)) return("null")
  if (is.character(x)) return(encodeString(x, quote = '"'))
  if (is.logical(x)) return(if (x) "true" else "false")
  stopifnot(is.numeric(x), is.finite(x))
  sprintf("%.17g", x)
}
out <- list(provenance = list(R = R.version.string,
  netmeta = as.character(packageVersion("netmeta")),
  meta = as.character(packageVersion("meta")),
  metafor = as.character(packageVersion("metafor")),
  script = "tests/fixtures/p04-rounded-effects-reference.R"), cases = list())
for (nm in names(inputs)) {
  d <- inputs[[nm]]
  for (renamed in c(FALSE, TRUE)) {
    if (renamed) {
      d$t1[d$t1 == "A"] <- "Z"
      d$t2[d$t2 == "A"] <- "Z"
    }
    fit <- netmeta(TE = -d$est, seTE = d$se, treat1 = d$t1, treat2 = d$t2,
      studlab = d$study, sm = "MD", common = TRUE, random = TRUE,
      method.tau = "DL", reference.group = if (renamed) "Z" else "A")
    tr <- rownames(fit$TE.common)
    mat <- function(M) unname(lapply(tr, function(i) unname(sapply(tr, function(j) M[i, j]))))
    dd <- decomp.design(fit)$Q.decomp
    out$cases[[paste0(nm, if (renamed) "_renamed" else "")]] <- list(
      rows = d, treatments = tr, common = list(TE = mat(fit$TE.common), seTE = mat(fit$seTE.common)),
      random = list(TE = mat(fit$TE.random), seTE = mat(fit$seTE.random)),
      Q = fit$Q, df = fit$df.Q, tau2 = fit$tau2,
      decomp = list(Q = unname(dd$Q), df = unname(dd$df)))
  }
}
dest <- file.path(dirname(tempdir()), "p04-f1-oracle.json")
writeLines(to_json(out), dest, useBytes = TRUE)
cat("ORACLE_PATH:", dest, "\n")
cat(to_json(out), "\n")
# Inspect the installed implementation, rather than relying on a different package version.
for (nm in c("netmeta", "nma_ruecker", "prepare", "multiarm", "chkmultiarm", "decomp.design", "decomp.tau")) {
  if (!exists(nm, envir = asNamespace("netmeta"), inherits = FALSE)) next
  src <- deparse(get(nm, envir = asNamespace("netmeta")))
  source_path <- file.path(dirname(tempdir()), paste0("p04-f1-", nm, ".R"))
  writeLines(src, source_path)
  cat("SOURCE_PATH:", source_path, "\n")
}
