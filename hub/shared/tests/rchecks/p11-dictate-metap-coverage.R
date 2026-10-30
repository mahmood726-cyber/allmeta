# P11-D13: reproduce the omission without changing the historical corpus.
# Run from wt/: Rscript hub/shared/tests/rchecks/p11-dictate-metap-coverage.R
# Reference output goes to the system temporary directory, even on failure.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(metadat))
suppressPackageStartupMessages(library(jsonlite))

versions <- c(R = as.character(getRversion()),
              metafor = as.character(packageVersion("metafor")),
              metadat = as.character(packageVersion("metadat")),
              jsonlite = as.character(packageVersion("jsonlite")))
print(versions)
stopifnot(identical(unname(versions), c("4.6.0", "5.2.1", "1.6.0", "2.0.0")))

corpus <- fromJSON("influence/validate/corpus/corpus.json", simplifyVector = FALSE)
datasets <- vapply(corpus, function(x) x$data$dataset, character(1))
ids <- vapply(corpus, function(x) x$id, character(1))

# Positive control: the already included BCG data really yield usable inputs.
bcg <- escalc(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg,
              data = metadat::dat.bcg)
bcg_record <- corpus[[match("dat.bcg::RR", ids)]]$data
stopifnot(all(is.finite(bcg$yi)), all(is.finite(bcg$vi) & bcg$vi > 0),
          "dat.bcg" %in% datasets,
          isTRUE(all.equal(as.numeric(bcg$yi), unlist(bcg_record$yi), tolerance = 1e-12)),
          isTRUE(all.equal(as.numeric(bcg$vi), unlist(bcg_record$vi), tolerance = 1e-12)))
cat("CONTROL_PASS: included BCG inputs match real escalc(RR)\n")

# Negative control: a collection of p-values alone has no sampling variances.
metap <- metadat::dat.metap
p_only <- metap$beckerp
stopifnot(is.numeric(p_only), is.null(dim(p_only)), all(p_only >= 0 & p_only <= 1))
p_only_error <- tryCatch({
  rma.uni(yi = p_only, method = "REML")
  ""
}, error = function(e) conditionMessage(e))
stopifnot(nzchar(p_only_error), grepl("vi|sei|variance", p_only_error))
cat("CONTROL_PASS: p-value-only member cannot supply an effect/variance fit\n")

# These two explicit mappings demonstrate the omission. They are not an
# exhaustive eligibility policy or a replacement corpus/release generator.
cholest <- escalc(measure = "OR", ai = dtreat, n1i = ntreat,
                  ci = dcontrol, n2i = ncontrol, data = metap$cholest,
                  add = 0.5, to = "only0", drop00 = FALSE)
validity <- escalc(measure = "ZCOR", ri = r, ni = n, data = metap$validity)
record <- function(member, measure, inputs, result) {
  stopifnot(nrow(inputs) >= 3, all(is.finite(result$yi)),
            all(is.finite(result$vi) & result$vi > 0))
  list(member = member, measure = measure, inputs = inputs,
       rows = seq_len(nrow(inputs)), yi = as.numeric(result$yi), vi = as.numeric(result$vi))
}
members <- list(
  record("cholest", "OR", metap$cholest, cholest),
  record("validity", "ZCOR", metap$validity, validity)
)
for (x in members) cat("ELIGIBLE:", paste0("dat.metap$", x$member),
                      x$measure, length(x$yi), "finite effect/positive-variance pairs\n")

covered <- any(datasets == "dat.metap" | startsWith(datasets, "dat.metap$") |
               startsWith(ids, "dat.metap::") | startsWith(ids, "dat.metap$"))
fixture <- list(
  finding = "P11-D13", versions = as.list(versions),
  script = "hub/shared/tests/rchecks/p11-dictate-metap-coverage.R",
  script_md5 = unname(tools::md5sum("hub/shared/tests/rchecks/p11-dictate-metap-coverage.R")),
  scope = "Two explicit counterexamples, not an exhaustive inclusion policy or release corpus",
  or_options = list(add = 0.5, to = "only0", drop00 = FALSE),
  members = members,
  controls = list(
    bcg = list(id = "dat.bcg::RR", inputs = metadat::dat.bcg,
               yi = as.numeric(bcg$yi), vi = as.numeric(bcg$vi)),
    p_only = list(member = "beckerp", inputs = p_only, error = p_only_error)
  ),
  historical = list(configurations = length(corpus), datasets = length(unique(datasets)),
                    rows = sum(vapply(corpus, function(x) length(x$data$yi), integer(1))),
                    metap_covered = covered)
)
output <- file.path(dirname(tempdir()), "dict-P11-f1-p11-d13-reference.json")
write_json(fixture, output, pretty = TRUE, auto_unbox = TRUE, digits = NA)
cat("REFERENCE_FIXTURE:", normalizePath(output, winslash = "/"), "\n")

# Keep this failing assertion until a separately reviewed release includes the
# eligible nested data. Do not convert the known omission into a passing check.
if (!covered) stop("P11-D13_COVERAGE: dat.metap has usable escalc ingredients but is absent from the pinned corpus.")
cat("COVERAGE_PASS\n")
