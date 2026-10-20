# Restore .github/r/renv.lock for one xplat-verify row (every OS/R row, including the rocker container).
#   Rscript .github/r/restore.R      (from the repo root)
# Never falls back: if a system requirement, the restore, or the version check fails, this stops with an error
# and the row fails. On success it appends R_LIBS_USER, XPLAT_PACKAGES_VIA=renv and XPLAT_INSTALL to $GITHUB_ENV.
#   Linux:   installs the lock's system requirements (pak::pkg_sysreqs -> apt-get) before the restore, because
#            renv::restore() does not (e.g. igraph's P3M binary needs libglpk40 at load time).
#   all OS:  renv installs from the lockfile's repositories: a dated P3M snapshot (binaries for Windows, Linux
#            and, where P3M has them, macOS; renv rewrites it to the __linux__ URL on Linux), then CRAN.
# r-lib/actions/setup-r exports RENV_CONFIG_REPOS_OVERRIDE=<P3M latest>, which would make renv ignore the lock's
# dated snapshot and fetch whatever is current; restore from the lock's own repositories instead.
Sys.unsetenv("RENV_CONFIG_REPOS_OVERRIDE")
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

# An explicit library: renv::paths$library() of a never-activated project is not where restore() installs.
lib <- file.path(project, "renv", "xplat-library")
dir.create(lib, recursive = TRUE, showWarnings = FALSE)
lib <- normalizePath(lib, winslash = "/")
renv::restore(project = project, library = lib, lockfile = lock_path, prompt = FALSE, clean = FALSE)

# Verify what the checks will actually load: a fresh R with R_LIBS_USER=<lib> (as run-checks.R gets it) reports the
# version and library of every locked package. A package renv left alone because this R bundles the same version
# (e.g. boot) counts only if that version equals the lock.
probe <- tempfile(fileext = ".R")
writeLines(c(sprintf("for (p in c(%s)) {", paste(sprintf('"%s"', names(want)), collapse = ", ")),
  '  v <- tryCatch(as.character(utils::packageVersion(p)), error = function(e) NA_character_)',
  '  path <- tryCatch(normalizePath(dirname(find.package(p)), winslash = "/"), error = function(e) NA_character_)',
  '  cat("PKG", p, v, path, sep = "\t"); cat("\n")', "}"), probe)
rscript <- file.path(R.home("bin"), if (.Platform$OS.type == "windows") "Rscript.exe" else "Rscript")
Sys.setenv(R_LIBS_USER = lib)   # inherited by the child (system2's env= is ignored on Windows)
out <- system2(rscript, c("--vanilla", shQuote(probe)), stdout = TRUE)
rows <- do.call(rbind, strsplit(out[startsWith(out, "PKG\t")], "\t", fixed = TRUE))
got <- setNames(rows[, 3], rows[, 2])[names(want)]
from <- setNames(rows[, 4], rows[, 2])[names(want)]
got[got == "NA"] <- NA
bad <- is.na(got) | got != want
in_lib <- !is.na(from) & tolower(from) == tolower(lib)
for (p in names(want)) cat(sprintf("  %-14s lock %-12s loads %-12s from %s%s\n", p, want[[p]], got[[p]],
  if (in_lib[[p]]) "renv library" else from[[p]], if (bad[[p]]) "  MISMATCH" else ""))
if (any(bad)) stop("renv::restore did not provide the locked versions of: ", paste(names(want)[bad], collapse = ", "))
cat(sprintf("RENV_RESTORED %d/%d packages at the locked versions (%d from %s, %d bundled with this R at the same version)\n",
  sum(!bad), length(want), sum(in_lib), lib, sum(!bad) - sum(in_lib)))

env_file <- Sys.getenv("GITHUB_ENV")
if (nzchar(env_file)) cat(sprintf("R_LIBS_USER=%s\nXPLAT_PACKAGES_VIA=renv\nXPLAT_INSTALL=renv %s restore of .github/r/renv.lock (%d/%d packages at locked versions)\n",
  lib, utils::packageVersion("renv"), sum(!bad), length(want)), file = env_file, append = TRUE)
