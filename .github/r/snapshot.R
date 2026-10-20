# Generate .github/r/renv.lock for xplat-verify (run by the workflow's `snapshot` job; never edit the lock by hand).
#   Rscript .github/r/snapshot.R      (ubuntu, R 4.5.1; writes ./renv.lock)
# Installs exactly the refs in .github/r/pinned.txt with pak, checks every pinned version, then records those
# packages and all their recursive dependencies with renv::snapshot(). A human reviews and commits the artifact.
refs <- readLines(".github/r/pinned.txt")
refs <- refs[nzchar(trimws(refs))]
pkgs <- sub("^any::", "", sub("@.*$", "", refs))
install.packages("pak", repos = sprintf("https://r-lib.github.io/p/pak/stable/%s/%s/%s",
  .Platform$pkgType, R.version$os, R.version$arch))
install.packages(c("renv", "jsonlite"))
pak::pkg_install(refs, ask = FALSE, dependencies = NA)
# renv validates the full Depends/Imports/LinkingTo closure (binary installs skip LinkingTo, e.g. cpp11, RcppEigen),
# and a source restore needs them, so install whatever of that closure is still missing.
closure <- unique(unlist(tools::package_dependencies(pkgs, db = utils::available.packages(),
  which = c("Depends", "Imports", "LinkingTo"), recursive = TRUE)))
missing <- setdiff(closure, c(rownames(utils::installed.packages()), "R"))
if (length(missing)) { cat("installing LinkingTo/closure packages:", missing, "\n"); pak::pkg_install(missing, ask = FALSE, dependencies = NA) }
want <- setNames(sub("^.*@", "", refs[grepl("@", refs)]), sub("@.*$", "", refs[grepl("@", refs)]))
got <- vapply(names(want), function(p) as.character(utils::packageVersion(p)), "")
bad <- want[package_version(gsub("-", ".", want)) != package_version(got)]
if (length(bad)) stop("pinned versions not installed: ", paste(names(bad), bad, "got", got[names(bad)], collapse = "; "))
proj <- file.path(tempdir(), "xplat-renv")
dir.create(proj, showWarnings = FALSE)
writeLines(sprintf("library(%s)", pkgs), file.path(proj, "deps.R"))
# `packages` limits the lockfile to these packages plus their recursive dependencies (renv ignores `type` then).
renv::snapshot(project = proj, library = .libPaths(), lockfile = "renv.lock", packages = pkgs, type = "all", prompt = FALSE)
lock <- jsonlite::fromJSON("renv.lock")
cat(sprintf("renv.lock: R %s, %d packages\n", lock$R$Version, length(lock$Packages)))
for (p in names(want)) cat(sprintf("  %-13s %s\n", p, lock$Packages[[p]]$Version))
