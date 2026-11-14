# Reference values for tests/test_nmapro4_modules.py (R 4.6.0, netmeta 3.7.0, meta 8.5-0, metafor 5.0.1).
# Regenerate from nma-pro-v2/tests:
#   Rscript --no-environ nmapro4_reference.R nmapro4_r460.json
#
#  decomp   : netmeta::decomp.design() on the full Senn 2013 data (TE/seTE, one 3-arm study) and on smokingcessation
#             (pairwise(sm = "OR"), two 3-arm studies): Q.decomp (Total / Within designs / Between designs: Q, df),
#             Q.het.design per design (Q, df; design = the sorted set of the study's arms), Q.inc.design summed
#             within each design (its share of the between-designs Q) and Q.inc.random
#             (between-designs Q under the full design-by-treatment interaction random-effects model, tau.within).
#  netsplit : netmeta::netsplit() (back-calculation) on the same two networks, DL: direct / indirect / network TE and
#             seTE and the direct-minus-indirect z test, random effects (network tau2) and common effect.
#             Orientation: comparison t1:t2 with t1 the alphabetically first treatment (the page's).
#  refuse   : the Senn data with Willms1999 metf-acar changed from -0.2 to -0.1 (fixtures/nmapro4-senn-inconsistent.csv):
#             netmeta() stops; its message is recorded here.
#  mlnmr    : the ML-NMR population-adjustment model y = X beta + (X * (age - 50)) gamma, all SEs x 0.3.
#             two-arm (fixtures/nmapro3-mlnmr.csv): the generalised moment (DL) estimator tau2 = (Q - df) / tr(P),
#             P = W - W Z (Z'W Z)^-1 Z'W, in matrix algebra; with the treatment columns only, the same formula
#             reproduces netmeta's DL tau2 (dlcheck). NOT metafor rma(method = "DL", mods, intercept = FALSE): metafor's
#             moment estimators use the mean-centred y (rma.uni: Ymc <- scale(yi, center = TRUE, scale = FALSE);
#             RSS <- crossprod(Ymc, P) %*% Ymc), which equals the residual Q only when the column space holds the
#             intercept -- it does not for an NMA design, so metafor reports QE 24.32 for a residual Q of 12.16 here.
#             multi-arm (fixtures/nmapro3-mlnmr.csv plus a 3-arm study M17 given as its 3 TE/seTE contrasts,
#             fixtures/nmapro4-mlnmr-multiarm.csv): GLS
#             with the 3-arm study's covariance on the kept rows -- metafor rma.mv(method = "FE") for beta / se -- and
#             the generalised moment estimator tau2 = (Q - df) / tr(P R) written out in matrix algebra below (netmeta's
#             DL for a network; R = 1 on the diagonal, 0.5 * shared-arm signs off it).
#  rr       : metabin(sm = "RR") default (RR.Cochrane = FALSE: incr 0.5 added to the events and once to n, only in a
#             study with a zero cell) TE / seTE^2 per smokingcessation contrast (and RR.Cochrane = TRUE for contrast),
#             and netmeta(pairwise(sm = "RR")) DL: Q, df, tau2, TE / seTE.random vs A (the multi-arm covariance is the
#             variance of the shared arm's log risk, 1/e - 1/n).
#  design2  : per two-arm design, the common-effect direct and network estimate of a0 - a1 (a0 alphabetically first).
#  zero     : smokingcessation + a 3-arm study with a zero arm, pairwise() OR / RR and netmeta DL (Q, tau2, TE/seTE.random).
suppressPackageStartupMessages({library(netmeta); library(meta); library(metafor); library(jsonlite)})
a <- commandArgs(trailingOnly = TRUE)
L <- function(x) as.list(x)
out <- list()
senn <- read.csv("fixtures/nmapro3-senn2013-full.csv")
sm <- read.csv("fixtures/nmapro3-smoking.csv")
ps <- pairwise(list(treat1, treat2), event = list(e1, e2), n = list(n1, n2), studlab = study, data = sm, sm = "OR")
nets <- list(
  senn = netmeta(senn$yi, senn$sei, senn$treat1, senn$treat2, senn$study, sm = "MD", method.tau = "DL",
                 reference.group = "plac"),
  smoke = netmeta(ps, method.tau = "DL", reference.group = "A"))
key <- function(d) sapply(strsplit(as.character(d), ":"), function(z) paste(sort(z), collapse = ":"))

dec <- list(); nsp <- list()
for (nm in names(nets)) {
  x <- nets[[nm]]; d <- decomp.design(x)
  qd <- d$Q.decomp; hd <- d$Q.het.design
  dec[[nm]] <- list(Q = qd$Q, df = qd$df,
                    design = setNames(lapply(seq_len(nrow(hd)), function(i) list(Q = hd$Q[i], df = hd$df[i])),
                                      key(hd$design)),
                    incDesign = L(tapply(as.numeric(d$Q.inc.design), key(names(d$Q.inc.design)), sum)),
                    Qrandom = d$Q.inc.random$Q, dfRandom = d$Q.inc.random$df, tauWithin = d$Q.inc.random$tau.within)
  s <- netsplit(x)
  one <- function(net, dir, ind, cmp) {
    rows <- list()
    for (i in seq_len(nrow(net))) {
      tr <- strsplit(as.character(net$comparison[i]), ":")[[1]]
      sg <- if (tr[1] < tr[2]) 1 else -1
      k <- paste(sort(tr), collapse = ":")
      if (is.na(dir$TE[i])) next
      r <- list(network = sg * net$TE[i], seNetwork = net$seTE[i], direct = sg * dir$TE[i], seDirect = dir$seTE[i])
      if (!is.na(ind$TE[i])) r <- c(r, list(indirect = sg * ind$TE[i], seIndirect = ind$seTE[i],
                                            diff = sg * cmp$TE[i], seDiff = cmp$seTE[i], p = cmp$p[i]))
      rows[[k]] <- r
    }
    rows
  }
  nsp[[nm]] <- list(random = one(s$random, s$direct.random, s$indirect.random, s$compare.random),
                    common = one(s$common, s$direct.common, s$indirect.common, s$compare.common),
                    tau2 = x$tau2)
}
out$decomp <- dec; out$netsplit <- nsp

inc <- read.csv("fixtures/nmapro4-senn-inconsistent.csv")
msg <- tryCatch({netmeta(inc$yi, inc$sei, inc$treat1, inc$treat2, inc$study, sm = "MD"); "no error"},
                error = function(e) conditionMessage(e))
out$refuse <- list(message = msg)

# ---- ML-NMR ----
sa <- read.csv("fixtures/nmapro3-mlnmr.csv")
st <- setdiff(sort(unique(c(sa$treat1, sa$treat2))), "A")
Xs <- sapply(st, function(t) (sa$treat1 == t) - (sa$treat2 == t))
Xm <- cbind(Xs, Xs * (sa$age - 50))
sc <- 0.3   # SE x 0.3 so that Q > df and the DL tau2 is positive (at SE x 1 tau2 = 0 in both)
sa$sei <- sa$sei * sc
gdl <- function(y, V, Z, R = diag(length(y))) {
  Si <- solve(V); P <- Si - Si %*% Z %*% solve(t(Z) %*% Si %*% Z) %*% t(Z) %*% Si
  Q <- as.numeric(t(y) %*% P %*% y); df <- length(y) - ncol(Z)
  list(Q = Q, df = df, tau2 = max(0, (Q - df) / sum(diag(P %*% R))))
}
g2 <- gdl(sa$yi, diag(sa$sei^2), Xm)
ncheck <- netmeta(sa$yi, sa$sei, sa$treat1, sa$treat2, sa$study, sm = "MD", method.tau = "DL")
dlcheck <- list(formula = gdl(sa$yi, diag(sa$sei^2), Xs)$tau2, netmeta = ncheck$tau2)
fm <- rma(sa$yi, sa$sei^2, mods = Xm, intercept = FALSE, method = "DL")
mm <- read.csv("fixtures/nmapro4-mlnmr-multiarm.csv"); mm$sei <- mm$sei * sc
w <- mm$study == "M17"
d <- mm[!w | mm$treat1 == "A" | mm$treat2 == "A", ]
dv <- setNames(mm$sei[w]^2, paste(mm$treat1[w], mm$treat2[w]))
vA <- unname((dv["B A"] + dv["D A"] - dv["D B"]) / 2)
V <- diag(d$sei^2); iw <- which(d$study == "M17"); V[iw[1], iw[2]] <- V[iw[2], iw[1]] <- vA
Rr <- diag(nrow(d)); Rr[iw[1], iw[2]] <- Rr[iw[2], iw[1]] <- 0.5   # both kept M17 rows have treat2 = A
trts <- setdiff(sort(unique(c(mm$treat1, mm$treat2))), "A")
X0 <- sapply(trts, function(t) (d$treat1 == t) - (d$treat2 == t))
Xd <- cbind(X0, X0 * (d$age - 50)); colnames(Xd) <- c(trts, paste0(trts, ":age"))
fe <- rma.mv(d$yi, V, mods = Xd, intercept = FALSE, method = "FE")
Si <- solve(V); P <- Si - Si %*% Xd %*% solve(t(Xd) %*% Si %*% Xd) %*% t(Xd) %*% Si
Qm <- as.numeric(t(d$yi) %*% P %*% d$yi); dfm <- nrow(d) - ncol(Xd)
out$mlnmr <- list(twoarm = list(tau2 = g2$tau2, Q = g2$Q, df = g2$df, metaforQE = fm$QE, metaforTau2 = fm$tau2),
                  dlcheck = dlcheck,
                  multiarm = list(beta = L(setNames(as.numeric(coef(fe)), colnames(Xd))),
                                  se = L(setNames(fe$se, colnames(Xd))), Q = Qm, df = dfm,
                                  tau2 = max(0, (Qm - dfm) / sum(diag(P %*% Rr)))))

# ---- RR continuity correction (metabin default) and the RR multi-arm covariance ----
mb <- metabin(e1, n1, e2, n2, data = sm, sm = "RR", method = "Inverse", allstudies = TRUE)
mc <- metabin(e1, n1, e2, n2, data = sm, sm = "RR", method = "Inverse", allstudies = TRUE, RR.Cochrane = TRUE)
pr <- pairwise(list(treat1, treat2), event = list(e1, e2), n = list(n1, n2), studlab = study, data = sm, sm = "RR")
nr <- netmeta(pr, method.tau = "DL", reference.group = "A")
tr <- setdiff(nr$trts, "A")
out$rr <- list(yi = mb$TE, vi = mb$seTE^2, yiCochrane = mc$TE, viCochrane = mc$seTE^2,
               net = list(Q = nr$Q, df = nr$df.Q, tau2 = nr$tau2, TE = L(setNames(nr$TE.random[tr, "A"], tr)),
                          seTE = L(setNames(nr$seTE.random[tr, "A"], tr))))
# a 3-arm study with a zero arm (fixtures/nmapro4-smoking-zero.csv = smokingcessation + study 25): pairwise() adds the
# increment to ALL arms of a multi-arm study with a zero cell, so its contrasts stay consistent
sz <- read.csv("fixtures/nmapro4-smoking-zero.csv")
zero <- list()
for (s in c("OR", "RR")) {
  pz <- pairwise(list(treat1, treat2), event = list(e1, e2), n = list(n1, n2), studlab = study, data = sz, sm = s)
  nz <- netmeta(pz, method.tau = "DL", reference.group = "A"); tr <- setdiff(nz$trts, "A")
  zero[[s]] <- list(rowTE = pz$TE[pz$studlab == 25], rowSE = pz$seTE[pz$studlab == 25], Q = nz$Q, tau2 = nz$tau2,
                    TE = L(setNames(nz$TE.random[tr, "A"], tr)), seTE = L(setNames(nz$seTE.random[tr, "A"], tr)))
}
out$zero <- zero
# ---- per two-arm design: direct (common-effect pooled) and network (common) estimate, oriented a0 - a1 with a0 the
# alphabetically first arm -- the label "a0 vs a1" the Q Decomposition module prints
dd2 <- list()
for (nm in names(nets)) {
  x <- nets[[nm]]; dsg <- list()
  dl <- data.frame(s = x$studlab, t1 = x$treat1, t2 = x$treat2, TE = x$TE, se = x$seTE)
  arms <- tapply(c(dl$t1, dl$t2), c(dl$s, dl$s), function(z) paste(sort(unique(z)), collapse = ":"))
  for (k in unique(arms)) {
    ar <- strsplit(k, ":")[[1]]; if (length(ar) != 2) next
    r <- dl[arms[dl$s] == k, ]; te <- ifelse(r$t1 == ar[1], r$TE, -r$TE)
    w <- 1 / r$se^2
    dsg[[k]] <- list(direct = sum(w * te) / sum(w), network = x$TE.common[ar[1], ar[2]])
  }
  dd2[[nm]] <- dsg
}
out$design2 <- dd2
# ---- Bayesian / GLS on RR multi-arm counts: netmeta common effect (the matrices the Bayesian model is given)
trr <- setdiff(nr$trts, "A"); out$rr$common <- L(setNames(nr$TE.common[trr, "A"], trr))
writeLines(toJSON(out, auto_unbox = TRUE, digits = NA), a[1])
