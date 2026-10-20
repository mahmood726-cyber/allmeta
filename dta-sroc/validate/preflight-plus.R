print(.libPaths())
missing <- character()
for (p in c("mada", "metadat", "mvmeta", "jsonlite")) {
  cat(p, ": ")
  if (requireNamespace(p, quietly = TRUE)) {
    print(packageVersion(p))
  } else {
    cat("MISSING\n")
    missing <- c(missing, p)
  }
}
if (length(missing)) quit(status = 2)
