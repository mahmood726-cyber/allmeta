# Re-run the pinned producer in R's temporary directory; never overwrite the oracle.
main <- function() {
  source_root <- normalizePath(".", winslash = "/", mustWork = TRUE)
  # The job runner may keep jsonlite in an existing ancestor rvendor library.
  # Reuse it only when normal package resolution fails; never install a package.
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    ancestor <- source_root
    repeat {
      vendor_library <- file.path(ancestor, "rvendor")
      if (file.exists(file.path(vendor_library, "jsonlite", "DESCRIPTION"))) {
        .libPaths(c(.libPaths(), vendor_library))
        break
      }
      parent <- dirname(ancestor)
      if (identical(parent, ancestor)) stop("The native-R replay requires an installed jsonlite package")
      ancestor <- parent
    }
  }
  stopifnot(requireNamespace("jsonlite", quietly = TRUE))
  fixture_dir <- "hub/shared/tests/unit"
  recorded <- jsonlite::fromJSON(file.path(source_root, fixture_dir, "p07-extras-reference.json"),
                                 simplifyVector = FALSE)
  work <- tempfile("p07-native-r-")
  dir.create(file.path(work, fixture_dir), recursive = TRUE)
  original_directory <- getwd()
  on.exit({ setwd(original_directory); unlink(work, recursive = TRUE) }, add = TRUE)
  for (name in c("p07-extras-input.json", "p07-extras-reference.R")) {
    stopifnot(file.copy(file.path(source_root, fixture_dir, name), file.path(work, fixture_dir, name)))
  }
  setwd(work)
  source(file.path(fixture_dir, "p07-extras-reference.R"), local = new.env())
  fresh <- jsonlite::fromJSON(file.path(fixture_dir, "p07-extras-reference.json"), simplifyVector = FALSE)
  stopifnot(identical(fresh$input, recorded$input))
  for (key in c("input_md5", "script_md5")) {
    stopifnot(identical(fresh$provenance[[key]], recorded$provenance[[key]]))
  }
  checks <- 0L
  maximum <- 0
  near <- function(actual, expected) {
    actual <- unlist(actual)
    expected <- unlist(expected)
    stopifnot(length(actual) == length(expected), all(is.finite(actual)), all(is.finite(expected)))
    difference <- abs(actual - expected) / pmax(1, abs(expected))
    stopifnot(all(difference <= 1e-6)) # The unchanged unit-suite comparison tolerance.
    checks <<- checks + length(actual)
    maximum <<- max(maximum, difference)
  }
  stopifnot(length(fresh$fits) == length(recorded$fits))
  for (i in seq_along(recorded$fits)) {
    actual <- fresh$fits[[i]]
    expected <- recorded$fits[[i]]
    stopifnot(identical(actual$effect, expected$effect), length(actual$profiles) == length(expected$profiles))
    near(actual$logLik, expected$logLik)
    for (j in seq_along(expected$profiles)) {
      a <- actual$profiles[[j]]
      e <- expected$profiles[[j]]
      stopifnot(identical(a$ub_sign, e$ub_sign), a$lower == 0, a$upper > 0,
                abs(a$endpoint_gap) < 1e-7, length(a$x) == 9L, length(a$ll) == 9L)
      for (key in c("estimate", "lower", "upper", "x", "ll")) near(a[[key]], e[[key]])
    }
  }
  cat(sprintf("P07 fresh native R: %d/%d comparisons PASS; maximum relative difference %.17g; pinned MD5s unchanged.\n",
              checks, checks, maximum))
}
main()
