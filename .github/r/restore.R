# Restore .github/r/renv.lock for one xplat-verify row (every OS/R row, including the rocker container).
#   Rscript .github/r/restore.R      (from the repo root)
# Never falls back: if a system requirement, the restore, or the version check fails, this stops with an error
# and the row fails. On success it appends R_LIBS_USER, XPLAT_PACKAGES_VIA=renv and XPLAT_INSTALL to $GITHUB_ENV.
#   Linux:   installs the lock's system requirements (pak::pkg_sysreqs -> apt-get) before the restore, because
#            renv::restore() does not (e.g. igraph's P3M binary needs libglpk40 at load time).
#   all OS:  renv installs from the lockfile's repositories: a dated P3M snapshot (binaries for Windows, Linux
#            and, where P3M has them, macOS; renv rewrites it to the __linux__ URL on Linux), then CRAN.
project <- normalizePath(".github/r", winslash = "/")
lock_path <- file.path(project, "renv.lock")
tools_lib <- file.path(tempdir(), "xplat-tools")
dir.create(tools_lib, showWarnings = FALSE)
.libPaths(c(tools_lib, .libPaths()))
install.packages("renv", lib = tools_lib, repos = "https://cloud.r-project.org")
lock <- renv::lockfile_read(lock_path)
want <- vapply(lock$Packages, function(p) p$Version, "")
cat(sprintf("renv %s; lockfile: R %s, %d packages; this row: %s\n", utils::packageVersion("renv"), lock$R$Version,
  length(want), R.version.string))
print(lock$R$Repositories)

if (Sys.info()[["sysname"]] == "Linux") {
  install.packages("pak", lib = tools_lib, repos = sprintf("https://r-lib.github.io/p/pak/stable/%s/%s/%s",
    .Platform$pkgType, R.version$os, R.version$arch))
  sr <- pak::pkg_sysreqs(names(want), upgrade = FALSE)
  cmds <- c(sr$pre_install, sr$install_scripts, sr$post_install)
  cmds <- cmds[nzchar(cmds)]
  sudo <- if (Sys.info()[["effective_user"]] == "root") "" else "sudo "
  cat("system requirements:", if (length(cmds)) "" else "none", "\n")
  for (cmd in cmds) {
    cat("+", sudo, cmd, "\n", sep = "")
    if (system(paste0(sudo, cmd)) != 0L) stop("system requirement install failed: ", cmd)
  }
}

renv::restore(project = project, lockfile = lock_path, prompt = FALSE, clean = FALSE)

lib <- normalizePath(renv::paths$library(project = project), winslash = "/")
ip <- utils::installed.packages(lib.loc = lib, noCache = TRUE)
got <- ip[match(names(want), ip[, "Package"]), "Version"]
bad <- is.na(got) | got != want
for (p in names(want)) cat(sprintf("  %-14s lock %-12s installed %s%s\n", p, want[[p]], got[[p]], if (bad[[p]]) "  MISMATCH" else ""))
if (any(bad)) stop("renv::restore did not install the locked versions of: ", paste(names(want)[bad], collapse = ", "))
cat(sprintf("RENV_RESTORED %d/%d packages at the locked versions into %s\n", sum(!bad), length(want), lib))

env_file <- Sys.getenv("GITHUB_ENV")
if (nzchar(env_file)) cat(sprintf("R_LIBS_USER=%s\nXPLAT_PACKAGES_VIA=renv\nXPLAT_INSTALL=renv %s restore of .github/r/renv.lock (%d/%d packages at locked versions)\n",
  lib, utils::packageVersion("renv"), sum(!bad), length(want)), file = env_file, append = TRUE)
