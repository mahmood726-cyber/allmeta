# R provenance for the one-click BCG example pins (lane P13w2).
suppressMessages({library(metafor); library(meta); library(metasens); library(metadat)})
expected <- c(metafor = "5.2.1", meta = "8.5.0", metasens = "1.5.3", metadat = "1.6.0")
for (pkg in names(expected)) stopifnot(as.character(packageVersion(pkg)) == expected[[pkg]])
cat("R", R.version.string, "metafor", as.character(packageVersion("metafor")), "meta", as.character(packageVersion("meta")),
    "metasens", as.character(packageVersion("metasens")), "metadat", as.character(packageVersion("metadat")), "\n")
q7 <- function(x) as.numeric(quantile(x, 0.5, type = 7))
emit <- function(tag, yi, sei) {
  k <- length(yi)
  for (m in c("FE", "DL")) {
    g <- gosh(rma(yi, sei = sei, method = m), progbar = FALSE)
    cat(sprintf("%s gosh %s k=%d n_subsets=%d median_est=%.17g median_I2=%.17g min_est=%.17g max_est=%.17g\n",
      tag, m, k, nrow(g$res), q7(g$res$estimate), q7(g$res$I2), min(g$res$estimate), max(g$res$estimate)))
  }
  mm <- metagen(yi, sei, method.tau = "DL", method.random.ci = "classic", level = .95, level.ma = .95, method.tau.ci = "")
  l <- limitmeta(mm, method.adjust = "beta0")
  cat(sprintf("%s limitmeta k=%d fe_est=%.17g fe_se=%.17g re_est=%.17g re_se=%.17g tau2=%.17g limit_est=%.17g limit_se=%.17g\n",
    tag, k, mm$TE.common, mm$seTE.common, mm$TE.random, mm$seTE.random, mm$tau2, l$TE.adjust, l$seTE.adjust))
}
d <- escalc(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = dat.bcg)
emit("EXACT_dat.bcg", as.numeric(d$yi), sqrt(as.numeric(d$vi)))
h <- read.csv("hero-bcg-input.csv", header = FALSE, col.names = c("yi", "se", "label"),
              strip.white = TRUE, stringsAsFactors = FALSE, encoding = "UTF-8")
emit("HERO_rounded", h$yi, h$se)
