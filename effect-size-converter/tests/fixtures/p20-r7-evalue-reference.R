# Run from wt/: Rscript effect-size-converter/tests/fixtures/p20-r7-evalue-reference.R
# Generate before the production fix. Never overwrite or rebaseline the oracle.
stopifnot(requireNamespace("jsonlite", quietly = TRUE))
destination <- "effect-size-converter/tests/fixtures/p20-r7-evalue-reference.json"
if (file.exists(destination)) stop("Refusing to overwrite the recorded R reference")

# Pass 1 found no installed EValue namespace. Use verified, unmodified source
# functions from the same pinned version as the existing input oracle if needed.
source_provenance <- list()
if (requireNamespace("EValue", quietly = TRUE)) {
  rr_function <- EValue::evalues.RR
  evalue_version <- as.character(utils::packageVersion("EValue"))
  method <- "Installed native EValue::evalues.RR(point, lo, hi)"
} else {
  source_dir <- tempfile("p20-r7-evalue-source-")
  dir.create(source_dir)
  status <- system2("python", c(
    shQuote("effect-size-converter/tests/fixtures/p20-r7-fetch-evalue.py"),
    shQuote(source_dir)))
  if (status != 0) stop("Could not fetch and verify the pinned EValue source")
  description <- read.dcf(file.path(source_dir, "DESCRIPTION"))
  stopifnot(description[1, "Package"] == "EValue",
            description[1, "Version"] == "4.1.4")
  evalue_version <- description[1, "Version"]
  pins <- c("R/EValue.R" = "13c8b75aef067f6e203e923a2b7342066179dc3b",
            "R/effect_measures.R" = "13af2244f6b1c04d13363fdc2b6a549351933105",
            "R/utils.R" = "83966e9c541da39100487711f54c4895e8ddd7f9")
  evalue_env <- new.env(parent = globalenv())
  for (file in names(pins)) sys.source(file.path(source_dir, file), envir = evalue_env)
  rr_function <- evalue_env$evalues.RR
  stopifnot(is.function(rr_function))
  method <- paste("Fresh execution of unmodified pinned EValue evalues.RR source;",
                  "not an installed package namespace")
  source_provenance <- list(
    source = "https://github.com/cran/EValue/tree/44c2dc41ce49444619bc2d97c16d87c7caef6f07",
    source_git_blobs = as.list(pins),
    verification = "Python hashlib SHA-1 of git blob header and downloaded bytes; no git process")
}

case <- function(id, point, lo, hi) {
  result <- tryCatch({
    r <- suppressMessages(rr_function(point, lo, hi))
    list(accepted = TRUE,
         expected = list(point = unname(r[2, 1]), ci = unname(min(r[2, 2:3], na.rm = TRUE))),
         native = unclass(r))
  }, error = function(e) list(accepted = FALSE, error = conditionMessage(e)))
  c(list(id = id, measure = "RR", point = point, lo = lo, hi = hi), result)
}
reference <- list(
  provenance = c(list(R = R.version.string,
                    EValue = evalue_version,
                    jsonlite = as.character(utils::packageVersion("jsonlite")),
                    script = "p20-r7-evalue-reference.R",
                    method = method,
                    disclosure = "Synthetic complete confidence intervals, not clinical data."),
                    source_provenance),
  cases = list(case("reversed", 2, 3, 1.5), case("outside", 2, 3, 4),
               case("valid", 2, 1.5, 2.7), case("crossing", 2, 0.8, 3)))
# Do not freeze a broken reference setup as if it were statistical evidence.
for (control in reference$cases[3:4]) {
  if (!isTRUE(control$accepted)) stop(paste("Native control failed:", control$id, control$error))
}
jsonlite::write_json(reference, destination, pretty = TRUE, auto_unbox = TRUE, digits = 17)
cat(jsonlite::toJSON(reference, pretty = TRUE, auto_unbox = TRUE, digits = 17), "\n")
