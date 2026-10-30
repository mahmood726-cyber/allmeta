# P04-R7 controls: fresh R references; runtime output stays in the OS temp directory.
suppressMessages(library(netmeta))
to_json <- function(x) {
  if (is.data.frame(x)) x <- unname(lapply(seq_len(nrow(x)), function(i) as.list(x[i, , drop = FALSE])))
  if (is.list(x)) {
    values <- vapply(x, to_json, character(1))
    if (!is.null(names(x))) return(paste0("{", paste0(encodeString(names(x), quote = '"'), ":", values, collapse = ","), "}"))
    return(paste0("[", paste(values, collapse = ","), "]"))
  }
  if (length(x) != 1L) return(to_json(unname(as.list(x))))
  if (is.na(x)) return("null")
  if (is.character(x)) return(encodeString(x, quote = '"'))
  stopifnot(is.numeric(x), is.finite(x))
  sprintf("%.17g", x)
}
out <- list(provenance = list(R = R.version.string,
  netmeta = as.character(packageVersion("netmeta")), meta = as.character(packageVersion("meta")),
  metafor = as.character(packageVersion("metafor")), script = "tests/fixtures/p04-r7-range-reference.R"), cases = list())
for (nm in c("homogeneous", "heterogeneous")) {
  d <- data.frame(study = paste0("S", 1:3), t1 = "A", t2 = "B",
    est = if (nm == "homogeneous") c(0.1, 0.2, 0.3) else c(-2, 2, 3), se = 1)
  f <- netmeta(TE = d$est, seTE = d$se, treat1 = d$t2, treat2 = d$t1,
    studlab = d$study, sm = "MD", common = TRUE, random = TRUE, method.tau = "DL", reference.group = "A")
  out$cases[[nm]] <- list(rows = d, Q = f$Q, tau2 = f$tau2,
    common = list(TE = f$TE.common["B", "A"], seTE = f$seTE.common["B", "A"]),
    random = list(TE = f$TE.random["B", "A"], seTE = f$seTE.random["B", "A"]))
}
dest <- file.path(dirname(tempdir()), "p04-r7-range-oracle.json")
writeLines(to_json(out), dest, useBytes = TRUE)
cat("ORACLE_PATH:", dest, "\n")
cat(to_json(out), "\n")
