repos <- getOption("repos")
repos["CRAN"] <- "https://cloud.r-project.org"
options(repos = repos)

required_packages <- c(
  "jsonlite",
  "metafor",
  "meta",
  "survival",
  "lme4",
  "cmprsk",
  "flexsurvcure"
)

installed <- rownames(installed.packages())
missing <- setdiff(required_packages, installed)

if (length(missing) > 0) {
  cat("Installing missing R packages:", paste(missing, collapse = ", "), "\n")
  install.packages(missing, Ncpus = max(1L, parallel::detectCores(logical = FALSE)))
} else {
  cat("All required R packages are already installed.\n")
}

cat("R parity dependencies available:", paste(required_packages, collapse = ", "), "\n")
