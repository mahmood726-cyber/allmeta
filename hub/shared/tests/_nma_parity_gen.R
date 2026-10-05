# Ground truth for the NMA parity spec (nma-netmeta-parity.spec.mjs).
#
# For every dataset shipped with netmeta 3.7.0, builds the study contrasts with pairwise() (the summary
# measure each dataset is documented with; Senn2013 and Linde2016 are already contrasts), fits netmeta()
# with its default DerSimonian-Laird tau^2 and both random-effects CI methods ("classic", "t-dist"), and
# writes the contrasts and results to _nma_parity_fixture.json (numbers with 17 significant digits).
#
#   Rscript _nma_parity_gen.R _nma_parity_fixture.json
#
# Per fit: treatments; common- and random-effects league tables (estimate, SE, CI, p); prediction
# intervals (t with df.Q, only when df.Q >= 2); Q, df, p; tau^2; I^2 with its CI; the design-based
# decomposition of Q (decomp.design: total, within designs, between designs); P-scores (netrank) with
# small values desirable and undesirable, common and random.
suppressMessages(library(netmeta))
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[1] else "_nma_parity_fixture.json"
settings.meta(digits = 17)

num <- function(x) ifelse(is.finite(x), formatC(x, digits = 17, format = "g"), "null")
vec <- function(x) paste0("[", paste(num(as.numeric(x)), collapse = ","), "]")
str <- function(s) paste0('"', gsub('["\\\\\n\r\t]', " ", s), '"')
strv <- function(s) paste0("[", paste(vapply(as.character(s), str, ""), collapse = ","), "]")
obj <- function(...) { a <- list(...); a <- a[!vapply(a, is.null, NA)]; paste0("{", paste(paste0('"', names(a), '":', unlist(a)), collapse = ","), "}") }
mat <- function(M, trts) vec(t(M[trts, trts]))   # row-major, rows/cols in the order of trts

get_ds <- function(d) { e <- new.env(); data(list = d, package = "netmeta", envir = e); get(d, envir = e) }

contrasts_of <- function(nm) {
  x <- get_ds(nm)
  switch(nm,
    Baker2009 = list(p = pairwise(treatment, exac, total, studlab = study, data = x, sm = "OR"), sm = "OR"),
    Dogliotti2014 = list(p = pairwise(treatment, stroke, total, studlab = study, data = x, sm = "OR"), sm = "OR"),
    Dong2013 = list(p = pairwise(treatment, death, randomized, studlab = id, data = x, sm = "OR"), sm = "OR"),
    Franchini2012 = , parkinson = list(p = pairwise(list(Treatment1, Treatment2, Treatment3), n = list(n1, n2, n3),
      mean = list(y1, y2, y3), sd = list(sd1, sd2, sd3), studlab = Study, data = x, sm = "MD"), sm = "MD"),
    Gurusamy2011 = list(p = pairwise(treatment, death, n, studlab = study, data = x, sm = "OR"), sm = "OR"),
    Linde2015 = list(p = pairwise(list(treatment1, treatment2, treatment3), event = list(resp1, resp2, resp3),
      n = list(n1, n2, n3), studlab = id, data = x, sm = "OR"), sm = "OR"),
    Linde2016 = list(p = data.frame(studlab = x$id, treat1 = x$treat1, treat2 = x$treat2, TE = x$lnOR, seTE = x$selnOR), sm = "OR"),
    Senn2013 = list(p = data.frame(studlab = x$studlab, treat1 = x$treat1, treat2 = x$treat2, TE = x$TE, seTE = x$seTE), sm = "MD"),
    Stowe2010 = list(p = pairwise(list(t1, t2, t3), n = list(n1, n2, n3), mean = list(y1, y2, y3), sd = list(sd1, sd2, sd3),
      studlab = study, data = x, sm = "MD"), sm = "MD"),
    Woods2010 = list(p = pairwise(treatment, event = r, n = N, studlab = author, data = x, sm = "OR"), sm = "OR"),
    dietaryfat = list(p = pairwise(list(treat1, treat2, treat3), event = list(d1, d2, d3), time = list(years1, years2, years3),
      studlab = ID, data = x, sm = "IRR"), sm = "IRR"),
    smokingcessation = list(p = pairwise(list(treat1, treat2, treat3), event = list(event1, event2, event3),
      n = list(n1, n2, n3), data = x, sm = "OR"), sm = "OR"))
}

fitone <- function(p, sm, ci) {
  f <- try(suppressWarnings(netmeta(TE, seTE, treat1, treat2, studlab, data = p, sm = sm, common = TRUE, random = TRUE,
                                    prediction = TRUE, method.random.ci = ci)), silent = TRUE)
  head <- list(method_random_ci = str(ci))
  if (inherits(f, "try-error")) return(do.call(obj, c(head, list(ok = "false", error = str(substr(as.character(f), 1, 200))))))
  tr <- f$trts
  dd <- try(decomp.design(f, warn = FALSE), silent = TRUE)
  qd <- if (inherits(dd, "try-error") || is.null(dd)) NULL else
    obj(Q = vec(dd$Q.decomp$Q), df = vec(dd$Q.decomp$df), pval = vec(dd$Q.decomp$pval))
  pd <- netrank(f, small.values = "desirable"); pu <- netrank(f, small.values = "undesirable")
  do.call(obj, c(head, list(ok = "true", trts = strv(tr), k = num(f$k), m = num(f$m), n = num(f$n),
    TE_common = mat(f$TE.common, tr), seTE_common = mat(f$seTE.common, tr), lower_common = mat(f$lower.common, tr),
    upper_common = mat(f$upper.common, tr), pval_common = mat(f$pval.common, tr),
    TE_random = mat(f$TE.random, tr), seTE_random = mat(f$seTE.random, tr), lower_random = mat(f$lower.random, tr),
    upper_random = mat(f$upper.random, tr), pval_random = mat(f$pval.random, tr),
    lower_predict = if (is.matrix(f$lower.predict)) mat(f$lower.predict, tr) else NULL,
    upper_predict = if (is.matrix(f$upper.predict)) mat(f$upper.predict, tr) else NULL,
    Q = num(f$Q), df_Q = num(f$df.Q), pval_Q = num(f$pval.Q), tau2 = num(f$tau2), tau = num(f$tau),
    I2 = num(f$I2), lower_I2 = num(f$lower.I2), upper_I2 = num(f$upper.I2),
    Q_decomp = qd,
    pscore_desirable = obj(common = vec(pd$ranking.common[tr]), random = vec(pd$ranking.random[tr])),
    pscore_undesirable = obj(common = vec(pu$ranking.common[tr]), random = vec(pu$ranking.random[tr])))))
}

DS <- c("Baker2009", "Dogliotti2014", "Dong2013", "Franchini2012", "Gurusamy2011", "Linde2015", "Linde2016", "Senn2013",
        "Stowe2010", "Woods2010", "dietaryfat", "parkinson", "smokingcessation")
dsj <- character()
for (nm in DS) {
  cs <- contrasts_of(nm); p <- as.data.frame(cs$p)
  p <- p[is.finite(p$TE) & is.finite(p$seTE), ]
  rows <- vapply(seq_len(nrow(p)), function(i) obj(studlab = str(p$studlab[i]), treat1 = str(p$treat1[i]),
    treat2 = str(p$treat2[i]), TE = num(p$TE[i]), seTE = num(p$seTE[i])), "")
  fits <- vapply(c("classic", "t-dist"), function(ci) fitone(p, cs$sm, ci), "")
  dsj <- c(dsj, sprintf('{"dataset":"%s","sm":"%s","contrasts":[%s],"fits":[%s]}', nm, cs$sm, paste(rows, collapse = ","), paste(fits, collapse = ",")))
  cat(nm, nrow(p), "")
}
writeLines(sprintf('{"generator":"_nma_parity_gen.R","R":"%s","netmeta":"%s","meta":"%s","datasets":[\n%s\n]}',
                   getRversion(), packageVersion("netmeta"), packageVersion("meta"), paste(dsj, collapse = ",\n")), out, useBytes = TRUE)
cat("\nwrote", out, "\n")
