# Reference values for tests/test_nmapro3_modules.py (R 4.6.0, netmeta 3.7.0, meta 8.5-0, metafor 5.0.1).
# Regenerate from nma-pro-v2/tests:
#   Rscript --no-environ nmapro3_reference.R nmapro3_r460.json
#
#  multiarm : netmeta() on the full Senn 2013 data (28 rows; Willms1999 is a 3-arm study given as its 3 contrasts,
#             TE/seTE) and on smokingcessation (pairwise(sm = "OR"), 24 studies, 2 three-arm, 28 rows):
#             Q, df.Q (= sum over studies of (arms - 1) - (treatments - 1)), pval.Q, I2, tau2, TE/seTE.random,
#             lower/upper.predict. Senn also with TE and seTE x 0.01 (DL).
#  common   : netmeta TE/seTE.common on the full Senn data (for the Bayesian common-effect model).
#  exactreml: for TE/seTE input netmeta's REML fits rma.mv with V = seTE^2 (netmeta.R: `else V <- dat.tau$seTE^2`),
#             i.e. without the within-study covariance of a multi-arm study's contrasts, so for Senn it is not the
#             exact likelihood. exactreml is metafor rma.mv(REML) on the same kept rows WITH that covariance (the
#             variance of the shared arm) -- the likelihood the page maximises.
#  worker   : meta::metabin(sm = "OR" / "RR") TE and seTE^2 per study (incr 0.5 only in a study with a zero cell;
#             RR.Cochrane = TRUE, i.e. n + 2*incr in the RR, the page's (RevMan) convention -- metabin's default adds
#             1*incr to n; no effect on OR).
#  registry : metabin seTE (OR, RR) for the very large trials of fixtures/nmapro2-bigtrial.csv.
#  coxyear  : lm(yi ~ year, weights = 1/vi) slope and SE on the page's Poisson-equivalent contrasts
#             yi = log(((e1+.5)/(n1+1)) / ((e2+.5)/(n2+1))), vi = 1/(e1+.5) + 1/(e2+.5).
#  mcid     : pnorm((cut - TE) / seTE) with netmeta DL TE/seTE.random on nma-tiny, y and SE x 0.01, cut -/+0.002.
#  fp       : netmeta common-effect TE/seTE on nma-tiny with SE x 0.01 (the PH model of the FP NMA).
#  mlnmr    : metafor rma(method = "EE") with mods = [treatment columns | treatment x (age - 50)], no intercept,
#             on 16 two-arm studies with SE x 1 and x 0.01 (fixtures/nmapro3-mlnmr.csv).
#  composite: netmeta DL random-effects TE/seTE and df.Q on the full Senn data with TE and seTE x 0.01.
suppressPackageStartupMessages({library(netmeta); library(meta); library(metafor); library(jsonlite)})
a <- commandArgs(trailingOnly = TRUE)
L <- function(x) as.list(x)
out <- list()
senn <- read.csv("fixtures/nmapro3-senn2013-full.csv")
sm <- read.csv("fixtures/nmapro3-smoking.csv")

nm <- function(r, ref) {
  tr <- setdiff(r$trts, ref)
  list(Q = r$Q, df = r$df.Q, pQ = r$pval.Q, I2 = r$I2, tau2 = r$tau2,
       TE = L(setNames(r$TE.random[tr, ref], tr)), seTE = L(setNames(r$seTE.random[tr, ref], tr)),
       lower = L(setNames(r$lower.predict[tr, ref], tr)), upper = L(setNames(r$upper.predict[tr, ref], tr)))
}
ma <- list()
ps <- pairwise(list(treat1, treat2), event = list(e1, e2), n = list(n1, n2), studlab = study, data = sm, sm = "OR")
for (m in c("DL", "REML")) {
  ma[[paste0("senn_", m)]] <- nm(netmeta(senn$yi, senn$sei, senn$treat1, senn$treat2, senn$study, sm = "MD",
                                         method.tau = m, reference.group = "plac"), "plac")
  ma[[paste0("smoke_", m)]] <- nm(netmeta(ps, method.tau = m, reference.group = "A"), "A")
}
ma$senn_s0.01_DL <- nm(netmeta(senn$yi * 0.01, senn$sei * 0.01, senn$treat1, senn$treat2, senn$study, sm = "MD",
                               method.tau = "DL", reference.group = "plac"), "plac")
out$multiarm <- ma
rc <- netmeta(senn$yi, senn$sei, senn$treat1, senn$treat2, senn$study, sm = "MD", reference.group = "plac")
tr <- setdiff(rc$trts, "plac")
out$common <- list(TE = L(setNames(rc$TE.common[tr, "plac"], tr)), seTE = L(setNames(rc$seTE.common[tr, "plac"], tr)))

# exact REML for Senn: kept rows = all two-arm rows and the two Willms1999 rows involving plac (both treat2 = plac)
w <- senn$study == "Willms1999"
d <- senn[!w | senn$treat1 == "plac" | senn$treat2 == "plac", ]
dv <- setNames(senn$sei[w]^2, paste(senn$treat1[w], senn$treat2[w]))
vplac <- unname((dv["metf plac"] + dv["acar plac"] - dv["metf acar"]) / 2)
V <- diag(d$sei^2); iw <- which(d$study == "Willms1999"); V[iw[1], iw[2]] <- V[iw[2], iw[1]] <- vplac
trts <- setdiff(sort(unique(c(senn$treat1, senn$treat2))), "plac")
X <- sapply(trts, function(t) (d$treat1 == t) - (d$treat2 == t))
d$comparison <- paste(d$treat1, d$treat2)
fr <- rma.mv(d$yi, V, mods = X, intercept = FALSE, random = ~ factor(comparison) | study, rho = 0.5,
             method = "REML", data = d, control = list(rel.tol = 1e-12, iter.max = 1000))
out$exactreml <- list(tau2 = fr$tau2, TE = L(setNames(as.numeric(coef(fr)), trts)), seTE = L(setNames(fr$se, trts)))

wk <- list()
for (s in c("OR", "RR")) {
  mb <- metabin(e1, n1, e2, n2, data = sm, sm = s, method = "Inverse", allstudies = TRUE, RR.Cochrane = TRUE)
  wk[[s]] <- list(yi = mb$TE, vi = mb$seTE^2)
}
out$worker <- wk
bt <- read.csv("fixtures/nmapro2-bigtrial.csv")
out$registry <- list(OR = metabin(e1, n1, e2, n2, data = bt, sm = "OR", method = "Inverse")$seTE,
                     RR = metabin(e1, n1, e2, n2, data = bt, sm = "RR", method = "Inverse")$seTE)

cy <- read.csv("fixtures/nmapro3-coxyear.csv")
yi <- log(((cy$e1 + .5) / (cy$n1 + 1)) / ((cy$e2 + .5) / (cy$n2 + 1))); vi <- 1 / (cy$e1 + .5) + 1 / (cy$e2 + .5)
lf <- summary(lm(yi ~ cy$year, weights = 1 / vi))$coefficients
out$coxyear <- list(slope = lf[2, 1], se = lf[2, 2])

tiny <- read.csv("nma-tiny.csv")
r <- netmeta(tiny$yi * 0.01, tiny$sei * 0.01, tiny$treat1, tiny$treat2, tiny$study, sm = "MD", method.tau = "DL",
             reference.group = "A")
tr <- setdiff(r$trts, "A")
out$mcid <- list(pBenefit = L(setNames(pnorm((-0.002 - r$TE.random[tr, "A"]) / r$seTE.random[tr, "A"]), tr)),
                 pHarm = L(setNames(pnorm((0.002 - r$TE.random[tr, "A"]) / r$seTE.random[tr, "A"],
                                          lower.tail = FALSE), tr)))
r <- netmeta(tiny$yi, tiny$sei * 0.01, tiny$treat1, tiny$treat2, tiny$study, sm = "MD", common = TRUE,
             reference.group = "A")
out$fp <- list(TE = L(setNames(r$TE.common[tr, "A"], tr)), seTE = L(setNames(r$seTE.common[tr, "A"], tr)))

sa <- read.csv("fixtures/nmapro3-mlnmr.csv")
st <- setdiff(sort(unique(c(sa$treat1, sa$treat2))), "A")
Xs <- sapply(st, function(t) (sa$treat1 == t) - (sa$treat2 == t))
Xm <- cbind(Xs, Xs * (sa$age - 50)); colnames(Xm) <- c(st, paste0(st, ":age"))
ml <- list()
for (sc in c(1, 0.01)) {
  f <- rma(sa$yi, (sa$sei * sc)^2, mods = Xm, intercept = FALSE, method = "EE")
  ml[[paste0("s", sc)]] <- list(beta = L(setNames(as.numeric(coef(f)), colnames(Xm))),
                                se = L(setNames(f$se, colnames(Xm))))
}
out$mlnmr <- ml

r <- netmeta(senn$yi * 0.01, senn$sei * 0.01, senn$treat1, senn$treat2, senn$study, sm = "MD", method.tau = "DL",
             reference.group = "plac")
tr <- setdiff(r$trts, "plac")
out$composite <- list(df = r$df.Q, tau2 = r$tau2, TE = L(setNames(r$TE.random[tr, "plac"], tr)),
                      seTE = L(setNames(r$seTE.random[tr, "plac"], tr)))
writeLines(toJSON(out, auto_unbox = TRUE, digits = NA), a[1])
