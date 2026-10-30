# Run from wt/ before modifying shared/multivariate-ma.js.
# This immutable reference is an intentional fixture, not a test log.
suppressPackageStartupMessages(library(metafor))
destination <- "hub/shared/tests/unit/p18-r5-reference.json"
if (file.exists(destination)) stop("Refusing to overwrite the recorded R reference")
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
  stop("Non-finite or unsupported reference value")
}
rows <- function(M) lapply(seq_len(nrow(M)), function(i) as.list(M[i, ]))
profile <- function(studies, G) {
  Vs <- lapply(studies, function(s) s$S + G)
  Ws <- lapply(Vs, solve)
  C <- solve(Reduce(`+`, Ws))
  mu <- as.vector(C %*% Reduce(`+`, Map(function(w, s) w %*% s$y, Ws, studies)))
  ld <- function(M) as.numeric(determinant(M, logarithm = TRUE)$modulus)
  quad <- sum(unlist(Map(function(w, s) { r <- s$y - mu; as.numeric(t(r) %*% w %*% r) }, Ws, studies)))
  objective <- (sum(vapply(Vs, ld, numeric(1))) + ld(Reduce(`+`, Ws)) + quad) / 2
  list(objective = objective, mu = mu, muVcov = rows(C), muSE = sqrt(diag(C)),
       logLik = -objective - (length(studies) - 1) * log(2 * pi) + log(length(studies)))
}
scales <- c(1, 1e-100, 1e100, 1e-200, 1e200)
cases <- list()
for (v in scales) for (shape in c("zero", "correlated")) {
  if (shape == "zero") {
    studies <- replicate(3, list(y = c(0, 0), S = diag(v, 2)), simplify = FALSE)
    G <- matrix(0, 2, 2)
  } else {
    ys <- list(c(-0.5, 1), c(0.75, -0.25), c(1, 0.5))
    studies <- lapply(1:3, function(i) list(y = sqrt(v) * ys[[i]],
      S = v * matrix(c(1 + i / 4, (-1)^i / 4, (-1)^i / 4, 2 + i / 3), 2, 2)))
    G <- v * matrix(c(0.4, -0.1, -0.1, 0.3), 2, 2)
  }
  cases[[length(cases) + 1L]] <- list(scale = v, shape = shape,
    studies = lapply(studies, function(s) list(y = s$y, S = rows(s$S))),
    G = rows(G), expected = profile(studies, G))
}
pd <- c(.47, .20, .40, .26, .56); al <- c(-.32, -.60, -.12, -.31, -.39)
vp <- c(.0075, .0057, .0021, .0029, .0148); va <- c(.0077, .0008, .0014, .0015, .0304)
cv <- c(.0030, .0009, .0007, .0009, .0072)
berkey <- lapply(1:5, function(i) list(y = c(al[i], pd[i]), S = matrix(c(va[i], cv[i], cv[i], vp[i]), 2, 2)))
V <- bldiag(lapply(berkey, function(s) s$S))
study <- rep(1:5, each = 2); outcome <- factor(rep(c("AL", "PD"), 5))
y <- unlist(lapply(berkey, function(s) s$y))
f <- rma.mv(y, V, mods = ~ outcome - 1, random = ~ outcome | study, struct = "UN", method = "REML")
reference <- list(provenance = list(R = R.version.string, metafor = as.character(packageVersion("metafor")),
  script = "p18-r5-reference.R", script_md5 = unname(tools::md5sum("hub/shared/tests/unit/p18-r5-reference.R")),
  objective_method = "base R solve and determinant(logarithm=TRUE); actual scaled matrices",
  berkey_method = "metafor::rma.mv, REML, UN; outcome order AL,PD"),
  cases = cases, berkey = list(studies = lapply(berkey, function(s) list(y = s$y, S = rows(s$S))),
    mu = as.vector(coef(f)), muSE = as.vector(f$se), G = rows(f$G), rho = as.numeric(f$rho), logLik = as.numeric(logLik(f))))
writeLines(json(reference), destination, useBytes = TRUE)
cat("Recorded", length(cases), "scaled objectives and Berkey REML fit;", R.version.string,
    "; metafor", as.character(packageVersion("metafor")), "\n")
