# Inspect actual installed metafor hooks before changing the exporter's refits.
suppressPackageStartupMessages(library(metafor))
cat(R.version.string, "; metafor", as.character(packageVersion("metafor")), "\n")
for (f in c("leave1out.rma.uni", "influence.rma.uni", "baujat.rma")) {
  lines <- deparse(getFromNamespace(f, "metafor"))
  writeLines(lines, file.path(dirname(tempdir()), paste0("p11-r4-", f, ".R")))
  ix <- grep("code2|tau2.fix|tau2 =|control =", lines)
  show <- sort(unique(unlist(lapply(ix, function(i) seq.int(max(1, i-3), min(length(lines), i+5))))))
  cat("\n", f, "\n")
  for (i in show) cat(sprintf("%d: %s\n", i, lines[i]))
}
# The fitter can compare against the boundary even when an interior start was
# supplied. Show that policy too; a selected mode must survive the actual fit.
lines <- deparse(getFromNamespace("rma.uni", "metafor"))
writeLines(lines, file.path(dirname(tempdir()), "p11-r4-rma.uni.R"))
ix <- grep("ll0|ll1|ll[.]REML|ll[.]ML|tau2[.]fix", lines)
show <- sort(unique(unlist(lapply(ix, function(i) seq.int(max(1, i-2), min(length(lines), i+4))))))
cat("\nrma.uni mode and fixed-tau policy\n")
for (i in show) cat(sprintf("%d: %s\n", i, lines[i]))
