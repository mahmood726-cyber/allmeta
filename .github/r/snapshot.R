# Generate .github/r/renv.lock for xplat-verify (run by the workflow's `snapshot` job; never edit the lock by hand).
#   Rscript .github/r/snapshot.R      (ubuntu, R 4.5.1; writes ./renv.lock)
# Installs exactly the refs in .github/r/pinned.txt with pak from a dated P3M snapshot (XPLAT_P3M_DATE, default
# two days ago), checks every pinned version, then records those packages and all their recursive dependencies
# with renv::snapshot(). A human reviews and commits the artifact.
# The lock's repositories are that dated snapshot (RSPM) plus CRAN, so every row of the matrix (Windows, macOS,
# Linux, R oldrel and release) can restore the same versions as binaries; restore.R installs them.
refs <- readLines(".github/r/pinned.txt")
refs <- refs[nzchar(trimws(refs))]
pkgs <- sub("^any::", "", sub("@.*$", "", refs))
date <- Sys.getenv("XPLAT_P3M_DATE", format(Sys.Date() - 2))
codename <- system2("sh", c("-c", shQuote(". /etc/os-release && echo $VERSION_CODENAME")), stdout = TRUE)
p3m <- sprintf("https://packagemanager.posit.co/cran/%s", date)
options(repos = c(CRAN = sprintf("https://packagemanager.posit.co/cran/__linux__/%s/%s", codename, date)))
cat("installing from", getOption("repos"), "\n")
install.packages("pak", repos = sprintf("https://r-lib.github.io/p/pak/stable/%s/%s/%s",
  .Platform$pkgType, R.version$os, R.version$arch))
install.packages(c("renv", "jsonlite"))
pak::pkg_install(refs, ask = FALSE, dependencies = NA)
# renv validates the full Depends/Imports/LinkingTo closure (binary installs skip LinkingTo, e.g. cpp11, RcppEigen),
# and a source restore needs them, so install whatever of that closure is still missing.
db <- utils::available.packages()
closure <- unique(unlist(tools::package_dependencies(pkgs, db = db, which = c("Depends", "Imports", "LinkingTo"), recursive = TRUE)))
missing <- setdiff(closure, c(rownames(utils::installed.packages()), "R"))
if (length(missing)) { cat("installing LinkingTo/closure packages:", missing, "\n"); pak::pkg_install(missing, ask = FALSE, dependencies = NA) }
# Recommended packages in the closure (Matrix, nlme, MASS, lattice, boot) would otherwise be recorded at the versions
# bundled with this R. Those are archived source-only versions elsewhere (Matrix 1.7-3 does not even compile on
# R 4.6), so lock the snapshot's CRAN builds instead: install them into the user library, which snapshot reads first.
ip <- utils::installed.packages()
rec <- intersect(closure, rownames(ip)[ip[, "Priority"] %in% "recommended"])
if (length(rec)) { cat("installing snapshot builds of recommended packages:", rec, "\n"); utils::install.packages(rec, lib = .libPaths()[1]) }
want <- setNames(sub("^.*@", "", refs[grepl("@", refs)]), sub("@.*$", "", refs[grepl("@", refs)]))
got <- vapply(names(want), function(p) as.character(utils::packageVersion(p)), "")
bad <- want[package_version(gsub("-", ".", want)) != package_version(got)]
if (length(bad)) stop("pinned versions not installed: ", paste(names(bad), bad, "got", got[names(bad)], collapse = "; "))
proj <- file.path(tempdir(), "xplat-renv")
dir.create(proj, showWarnings = FALSE)
writeLines(sprintf("library(%s)", pkgs), file.path(proj, "deps.R"))
# Recorded repositories: P3M binaries carry `Repository: RSPM`, so name the dated snapshot RSPM (renv rewrites it to
# the __linux__ binary URL on Linux; Windows/macOS get binaries from the same URL).
options(repos = c(RSPM = p3m, CRAN = "https://cloud.r-project.org"))
# `packages` limits the lockfile to these packages plus their recursive dependencies (renv ignores `type` then).
renv::snapshot(project = proj, library = .libPaths(), lockfile = "renv.lock", packages = pkgs, type = "all", prompt = FALSE)
lock <- jsonlite::fromJSON("renv.lock")
cat(sprintf("renv.lock: R %s, %d packages, P3M snapshot %s\n", lock$R$Version, length(lock$Packages), date))
for (p in names(want)) cat(sprintf("  %-13s %s\n", p, lock$Packages[[p]]$Version))
src <- vapply(lock$Packages, function(p) paste(p$Source, p$Repository %||% ""), "")
print(table(src))
stale <- names(lock$Packages)[vapply(lock$Packages, function(p) !identical(p$Repository, "RSPM"), logical(1))]
if (length(stale)) stop("lock entries not from the dated P3M snapshot (restore could not get them as binaries): ", paste(stale, collapse = ", "))
