# Reference values for tests/test_secondary_modules.py (R 4.6.0, netmeta 3.7.0, meta 8.5-0, metafor 5.0.1).
# Regenerate from nma-pro-v2/tests:
#   Rscript --no-environ secondary_reference.R secondary_r460.json
#
#  pi    : netmeta prediction intervals vs the reference. netmeta (netmeta.R, 3.7.0):
#            df.Q <- res.c$df;  if (df.Q >= 2) ci(TE.random, sqrt(seTE.random^2 + tau^2), level.predict, df.Q)
#            else lower/upper.predict = NA
#          i.e. t with df = df.Q = sum(arms - 1) - (treatments - 1), and no interval when df.Q < 2.
#  rd    : meta::metabin(sm = "RD") TE / seTE per study (TE from the raw proportions; the variance uses
#          incr = 0.5 in every cell of a study with a zero cell, method.incr = "only0"; no other additive term),
#          and netmeta(pairwise(sm = "RD")) random-effects (DL) TE / seTE vs A.
#  metareg: metafor rma(method = "EE") on the baseline-risk design [treatment columns | centred baseline logit],
#          no intercept -- the common-effect meta-regression the page fits in CBMBaselineDualNMA (estimator FE).
#  cluster: metafor robust(rma.mv(REML, random = ~1 | study), cluster = study, adjust = TRUE) -- with one contrast
#          per study the page's CR factor M/(M-1) * (n-1)/(n-p) equals metafor's k/(k-p).
#  cnma  : netmeta::netcomb(inactive = NULL) common-effect component estimates and SEs.
suppressPackageStartupMessages({library(netmeta); library(metafor); library(jsonlite)})
a <- commandArgs(trailingOnly = TRUE)
L <- function(x) as.list(x)
out <- list()

# ---- prediction intervals ----
data(Senn2013)
s0 <- subset(Senn2013, studlab != "Willms1999")      # the 25 two-arm studies
senn <- data.frame(study = s0$studlab, treat1 = s0$treat1, treat2 = s0$treat2, yi = s0$TE, sei = s0$seTE)
write.csv(senn, "fixtures/nmapro2-senn2013-2arm.csv", row.names = FALSE)
tiny <- read.csv("nma-tiny.csv")
tri <- read.csv("fixtures/nmapro2-triangle.csv")
pi_case <- function(d, sc, ref, m) {
  r <- netmeta(TE = d$yi * sc, seTE = d$sei * sc, treat1 = d$treat1, treat2 = d$treat2, studlab = d$study, sm = "MD",
               random = TRUE, common = TRUE, method.tau = m, reference.group = ref)
  tr <- setdiff(r$trts, ref)
  list(df = r$df.Q, tau2 = r$tau2,
       TE = L(setNames(r$TE.random[tr, ref], tr)), seTE = L(setNames(r$seTE.random[tr, ref], tr)),
       lower = L(setNames(r$lower.predict[tr, ref], tr)), upper = L(setNames(r$upper.predict[tr, ref], tr)))
}
out$pi <- list(
  senn_REML = pi_case(senn, 1, "plac", "REML"), senn_DL = pi_case(senn, 1, "plac", "DL"),
  tiny_s0.01_REML = pi_case(tiny, 0.01, "A", "REML"), tiny_s1_DL = pi_case(tiny, 1, "A", "DL"),
  triangle_DL = pi_case(tri, 1, "A", "DL"))

# ---- risk difference ----
rd <- read.csv("fixtures/nmapro2-rd.csv")
mb <- metabin(rd$e1, rd$n1, rd$e2, rd$n2, sm = "RD")
pw <- pairwise(treat = list(rd$treat1, rd$treat2), event = list(rd$e1, rd$e2), n = list(rd$n1, rd$n2),
               studlab = rd$study, sm = "RD")
nmr <- netmeta(pw, method.tau = "DL", reference.group = "A")
out$rd <- list(study = rd$study, TE = mb$TE, seTE = mb$seTE, incr = mb$incr, method.incr = mb$method.incr,
               nma = list(tau2 = nmr$tau2, TE = L(setNames(nmr$TE.random[c("B", "C"), "A"], c("B", "C"))),
                          seTE = L(setNames(nmr$seTE.random[c("B", "C"), "A"], c("B", "C")))))

# ---- baseline-risk meta-regression (common effect) ----
bt <- read.csv("fixtures/nmapro2-bigtrial.csv"); bt[4:7] <- lapply(bt[4:7], as.numeric)
yi <- log((bt$e1 * (bt$n2 - bt$e2)) / ((bt$n1 - bt$e1) * bt$e2))
vi <- 1 / bt$e1 + 1 / (bt$n1 - bt$e1) + 1 / bt$e2 + 1 / (bt$n2 - bt$e2)
bl <- qlogis((bt$e2 + 0.5) / (bt$n2 + 1)); blc <- bl - mean(bl)
trs <- c("B", "C", "D")
X <- sapply(trs, function(t) (bt$treat1 == t) - (bt$treat2 == t))
mr <- rma(yi, vi, mods = cbind(X, blc), intercept = FALSE, method = "EE")
out$metareg <- list(yi = yi, vi = vi, beta = L(setNames(as.vector(coef(mr)), c(trs, "slope"))),
                    se = L(setNames(as.vector(mr$se), c(trs, "slope"))))

# ---- cluster-robust (REML) on nma-tiny, SEs x 1 and x 0.01 ----
out$cluster <- list()
for (sc in c(1, 0.01)) {
  Xt <- sapply(c("B", "C", "D"), function(t) (tiny$treat1 == t) - (tiny$treat2 == t))
  fit <- rma.mv(tiny$yi, (tiny$sei * sc)^2, mods = Xt, intercept = FALSE, random = ~ 1 | study, data = tiny,
                method = "REML")
  rb <- robust(fit, cluster = tiny$study, adjust = TRUE)
  out$cluster[[sprintf("s%s", sc)]] <- list(tau2 = fit$sigma2, beta = L(setNames(as.vector(coef(rb)), c("B", "C", "D"))),
                                            se = L(setNames(as.vector(rb$se), c("B", "C", "D"))))
}

# ---- component NMA (additive, common effect) ----
cn <- read.csv("fixtures/nmapro2-cnma.csv")
out$cnma <- list()
for (sc in c(1, 0.01)) {
  nm <- netmeta(cn$yi, cn$sei * sc, cn$treat1, cn$treat2, cn$study, sm = "MD", reference.group = "P")
  nc <- netcomb(nm, inactive = NULL)
  out$cnma[[sprintf("s%s", sc)]] <- list(est = L(setNames(nc$Comp.common, nc$comps)),
                                         se = L(setNames(nc$seComp.common, nc$comps)))
}

out$R <- R.version.string
out$versions <- list(netmeta = as.character(packageVersion("netmeta")), meta = as.character(packageVersion("meta")),
                     metafor = as.character(packageVersion("metafor")))
writeLines(toJSON(out, auto_unbox = TRUE, digits = I(17), na = "null"), a[1])
