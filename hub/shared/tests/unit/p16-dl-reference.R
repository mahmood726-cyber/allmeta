# Run from wt/ to record the independent native R reference:
# Rscript hub/shared/tests/unit/p16-dl-reference.R
# Independent uncentred moment calculation, not centred rma.uni or netmeta.
fixture_dir <- "hub/shared/tests/unit"
reference_path <- file.path(fixture_dir, "p16-dl-reference.json")
if (file.exists(reference_path)) stop("Refusing to overwrite the recorded native R reference")
# Base-R input mirror generated mechanically from the unchanged JSON input.
# The unit tests require the resulting reference input to match that JSON exactly.
source(file.path(fixture_dir, "p16-dl-input.R"), local = TRUE)

design <- function(d, ref = sort(unique(c(d$A, d$B)))[1]) {
  trts <- setdiff(sort(unique(c(d$A, d$B))), ref)
  X <- vapply(trts, function(t) as.numeric(d$A == t) - as.numeric(d$B == t), numeric(nrow(d)))
  matrix(X, nrow = nrow(d), dimnames = list(NULL, trts))
}
wls <- function(d, tau2 = 0, X = design(d)) {
  w <- 1 / (d$se^2 + tau2)
  f <- lm.wfit(X, d$te, w)
  stopifnot(f$rank == ncol(X))
  # diag(H) from the weighted orthonormal QR basis avoids the app's trace subtraction.
  leverage <- rowSums(qr.Q(f$qr)[, seq_len(f$rank), drop = FALSE]^2)
  list(Q = sum(w * f$residuals^2), df = nrow(d) - f$rank,
       C = sum(w * (1 - leverage)), fitted = f$fitted.values,
       beta = f$coefficients, cov = chol2inv(chol(crossprod(X, X * w))))
}
analyse <- function(d, name, scale) {
  f0 <- wls(d)
  tau2 <- max(0, (f0$Q - f0$df) / f0$C)
  f <- wls(d, tau2)
  pairs <- apply(d[, c("A", "B")], 1, function(x) paste(sort(x), collapse = " vs "))
  Z <- model.matrix(~ factor(pairs) - 1)
  Z <- Z * ifelse(d$A < d$B, 1, -1)
  full <- wls(d, tau2, Z)
  Q <- sum((full$fitted - f$fitted)^2 / (d$se^2 + tau2))
  df <- f$df - full$df
  splits <- lapply(sort(unique(pairs)), function(pair) {
    labels <- strsplit(pair, " vs ", fixed = TRUE)[[1]]
    direct <- d[pairs == pair, ]
    others <- d[pairs != pair, ]
    weight <- 1 / (direct$se^2 + tau2)
    direct_mean <- sum(weight * direct$te * ifelse(direct$A == labels[1], 1, -1)) / sum(weight)
    direct_se <- sqrt(1 / sum(weight))
    X <- design(others, labels[1])
    indirect <- wls(others, tau2, X)
    j <- match(labels[2], colnames(X))
    indirect_mean <- -indirect$beta[j]
    indirect_se <- sqrt(indirect$cov[j, j])
    difference <- direct_mean - indirect_mean
    se_difference <- sqrt(direct_se^2 + indirect_se^2)
    z <- difference / se_difference
    list(comparison = pair, direct = list(mean = direct_mean, se = direct_se),
         indirect = list(mean = indirect_mean, se = indirect_se), diff = difference,
         seDiff = se_difference, z = z, p = pchisq(z^2, 1, lower.tail = FALSE))
  })
  list(name = name, scale = scale, C = f0$C, Qfixed = f0$Q, tau2 = tau2,
       global = list(Q = Q, df = df, p = pchisq(Q, df, lower.tail = FALSE)), splits = splits)
}
fits <- list()
for (name in names(input$cases)) for (scale in unlist(input$scales)) {
  d <- do.call(rbind, lapply(input$cases[[name]], as.data.frame))
  d$te <- d$te * scale
  d$se <- d$se * scale
  fits[[length(fits) + 1L]] <- analyse(d, name, scale)
}
# Serialize native doubles at 17 significant digits without extra packages.
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
  if (is.numeric(x) && is.finite(x)) return(trimws(formatC(x, digits = 17, format = "g", decimal.mark = ".")))
  stop("Unsupported native reference value")
}
reference <- list(provenance = list(
  R = R.version.string, stats = as.character(packageVersion("stats")),
  input_r_md5 = unname(tools::md5sum(file.path(fixture_dir, "p16-dl-input.R"))),
  input_md5 = unname(tools::md5sum(file.path(fixture_dir, "p16-dl-input.json"))),
  script_md5 = unname(tools::md5sum(file.path(fixture_dir, "p16-dl-reference.R"))),
  method = "uncentred weighted QR; C=sum(w*(1-leverage)); native stats::pchisq",
  serialization = "base R; 17 significant digits"), input = input, fits = fits)
# The reference fixture is the required retained R evidence, not a test log.
encoded <- json(reference)
writeLines(encoded, reference_path, useBytes = TRUE)
cat(encoded, "\n")
