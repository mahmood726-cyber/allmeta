# Report only package availability/version to identify the existing parity
# prerequisite gap. Do not read/print environment variables or library paths.
for (name in c('metafor', 'jsonlite')) {
  available <- requireNamespace(name, quietly = TRUE)
  cat(name, if (available) as.character(packageVersion(name)) else 'MISSING', '\n')
}
cat(R.version.string, '\n')
