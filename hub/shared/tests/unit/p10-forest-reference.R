# Run from wt/: Rscript hub/shared/tests/unit/p10-forest-reference.R
# The retained oracle is a fixture, not test output. Never overwrite it.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
folder <- "hub/shared/tests/unit"
target <- file.path(folder, "p10-forest-reference.json")
if (file.exists(target)) stop("Refusing to overwrite the recorded R reference")
input_path <- file.path(folder, "p10-forest-input.json")
input <- fromJSON(input_path)

# Base R serialization retains 17 significant digits from the actual R run.
json <- function(x) {
  if (is.list(x)) {
    fields <- vapply(x, json, character(1))
    if (!is.null(names(x))) {
      fields <- paste0(encodeString(names(x), quote = '"'), ":", fields)
      return(paste0("{", paste(fields, collapse = ","), "}"))
    }
    return(paste0("[", paste(fields, collapse = ","), "]"))
  }
  if (length(x) != 1L) return(json(as.list(x)))
  if (is.character(x)) return(encodeString(x, quote = '"'))
  if (is.numeric(x) && is.finite(x)) return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  stop("Unsupported oracle value")
}

cases <- lapply(input, function(csv) {
  d <- read.csv(text = csv, header = FALSE, col.names = c("label", "e1", "n1", "e2", "n2"))
  measures <- lapply(c("OR", "RR", "RD"), function(measure) {
    e <- escalc(measure = measure, ai = e1, bi = n1 - e1, ci = e2, di = n2 - e2,
                add = 0.5, to = "only0", data = d)
    lapply(seq_len(nrow(d)), function(i) list(label = d$label[i], yi = e$yi[i], vi = e$vi[i],
      lo = e$yi[i] - qnorm(0.975) * sqrt(e$vi[i]), hi = e$yi[i] + qnorm(0.975) * sqrt(e$vi[i])))
  })
  names(measures) <- c("OR", "RR", "RD")
  measures
})
reference <- list(provenance = list(script = "p10-forest-reference.R", R = R.version.string,
  metafor = as.character(packageVersion("metafor")), jsonlite = as.character(packageVersion("jsonlite")),
  input_md5 = unname(tools::md5sum(input_path)), serialization = "base R; 17 significant digits"),
  input = input, cases = cases)
encoded <- json(reference)
writeLines(encoded, target, useBytes = TRUE)
cat(encoded, "\n")
