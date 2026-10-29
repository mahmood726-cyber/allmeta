# Run once from wt/ before changing component-nma/index.html:
# Rscript hub/shared/tests/unit/p19-scale-reference.R
# This file creates the requested immutable reference fixture, not a test log.
suppressPackageStartupMessages(library(metafor))
reference_path <- "hub/shared/tests/unit/p19-scale-reference.json"
if (file.exists(reference_path)) stop("Refusing to overwrite the recorded R reference")
scales <- c(0.001, 1, 100000, 1000000, 2000000)
input <- list(scales = scales, se = c(2, 4),
              heterogeneous = c(0, 8), homogeneous = c(1, 1))

# Preserve native doubles with 17 significant digits and no hand-entered results.
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
  if (is.character(x) && !is.na(x)) return(encodeString(x, quote = '"'))
  if (is.numeric(x) && is.finite(x)) {
    return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  }
  stop("Unsupported value in native R reference")
}

fits <- unlist(lapply(c("heterogeneous", "homogeneous"), function(kind) {
  lapply(scales, function(scale) {
    effects <- input[[kind]] * scale
    se <- input$se * scale
    f <- rma.uni(yi = effects, sei = se, method = "DL", test = "z")
    list(kind = kind, scale = scale, effects = effects, se = se,
         values = list(tau2 = as.numeric(f$tau2), Q = as.numeric(f$QE),
                       df = as.numeric(f$k - f$p), beta = as.numeric(coef(f)),
                       variance = as.numeric(vcov(f)), se = as.numeric(f$se)))
  })
}), recursive = FALSE)
reference <- list(
  provenance = list(script = "p19-scale-reference.R", R = R.version.string,
                    script_md5 = unname(tools::md5sum("hub/shared/tests/unit/p19-scale-reference.R")),
                    method = 'metafor::rma.uni(yi = effects, sei = se, method = "DL", test = "z")',
                    serialization = "base R; 17 significant digits",
                    packages = lapply(c("metafor", "metadat", "Matrix", "nlme", "numDeriv"), function(pkg) {
                      list(package = pkg, version = as.character(packageVersion(pkg)))
                    })),
  input = input, fits = fits)
encoded <- json(reference)
writeLines(encoded, reference_path, useBytes = TRUE)
cat(encoded, "\n")
