# From repo root: Rscript tests/fixtures/evalue-input-reference.R SOURCE_DIR [OUTPUT]
# SOURCE_DIR holds unmodified EValue 4.1.4 files from cran/EValue commit below.
# This sources pinned package functions, not an installed package namespace.
stopifnot(as.character(getRversion()) == "4.6.0")
stopifnot(requireNamespace("jsonlite", quietly=TRUE))
stopifnot(as.character(packageVersion("jsonlite")) == "2.0.0")
args <- commandArgs(trailingOnly=TRUE)
stopifnot(length(args) >= 1)
pins <- c("R/EValue.R"="13c8b75aef067f6e203e923a2b7342066179dc3b",
          "R/effect_measures.R"="13af2244f6b1c04d13363fdc2b6a549351933105",
          "R/utils.R"="83966e9c541da39100487711f54c4895e8ddd7f9")
for (file in names(pins)) {
  path <- file.path(args[[1]], file)
  stopifnot(identical(system2("git", c("hash-object", shQuote(path)), stdout=TRUE), pins[[file]]))
  source(path)
}
case <- function(id, measure, point, lo=NA_real_, hi=NA_real_, rare=FALSE) {
  f <- get(paste0("evalues.", measure))
  r <- suppressMessages(f(point, lo, hi, rare=rare))
  ci <- r[2, 2:3]
  ci <- if (all(is.na(ci))) NA_real_ else min(ci, na.rm=TRUE)
  list(id=id, measure=measure, point=point, lo=lo, hi=hi, rare=rare,
       expected=list(point=unname(r[2,1]), ci=unname(ci),
                     rr=list(point=unname(r[1,1]), lo=unname(r[1,2]), hi=unname(r[1,3]))))
}
cases <- list(
  case("rr-harmful", "RR", 2, 1.5, 2.7),
  case("rr-protective", "RR", .6, .4, .9),
  case("rr-null", "RR", 1, 1, 1),
  case("rr-crossing", "RR", 2, .9, 3),
  case("rr-missing-ci", "RR", 2),
  case("rr-near-null", "RR", 1.000001, 1, 1.000002),
  case("rr-large", "RR", 100, 20, 200),
  case("or-common", "OR", 2, 1.5, 2.7),
  case("or-rare", "OR", 2, 1.5, 2.7, TRUE),
  case("or-protective", "OR", .6, .4, .9),
  case("hr-common", "HR", 1.6, 1.2, 2.1),
  case("hr-rare", "HR", 1.6, 1.2, 2.1, TRUE),
  case("hr-protective", "HR", .6, .4, .9)
)
out <- list(R=as.character(getRversion()), EValue="4.1.4", jsonlite="2.0.0",
            source="https://github.com/cran/EValue/tree/44c2dc41ce49444619bc2d97c16d87c7caef6f07",
            source_git_blobs=as.list(pins),
            method="Fresh execution of unmodified pinned EValue source functions; not an installed package namespace",
            disclosure="All cases are synthetic software test inputs, not clinical data.", cases=cases)
destination <- if(length(args) > 1) args[[2]] else "tests/fixtures/evalue-input-oracle.json"
jsonlite::write_json(out, destination, pretty=TRUE, auto_unbox=TRUE, digits=16, na="null")
cat(length(cases), "fresh EValue source-reference cases generated\n")
