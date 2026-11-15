# Reference values for tests/test_nmapro5b_modules.py (R 4.6.0, netmeta 3.7.0, metafor 5.0.1).
# Regenerate from nma-pro-v2/tests (after `node nmapro5b_harness.cjs --write-scripts`):
#   Rscript --no-environ nmapro5b_reference.R nmapro5b_r460.json
#
#  export : every script in fixtures/nmapro5-export/<case>.R (written by the page's RScriptBuilder) is run as is:
#           tau2 (0 for a common-effect model), Q, df.Q, TE / seTE vs the reference of the model it fits, or the
#           error. For REML / ML with a multi-arm study the script fits `net` (netmeta's REML / ML, which ignores the
#           multi-arm covariance: recorded as tau2_netmeta) and `net.page` (tau2 fixed at the page's exact-likelihood
#           value); the comparison uses net.page. The benchmark scripts senn_PM.bench.R (must stop: netmeta has no PM) and smoke_OR_REML.bench.R
#           (must run and write its JSON) as well.
#  hk     : the two-arm Senn 2013 network (fixtures/nmapro2-senn2013-2arm.csv): REML tau2 by rma.mv (rma.uni with mods
#           and intercept = FALSE does not return the regression REML here), then rma.uni(mods, intercept = FALSE, tau2 =
#           that) with test = "z" (no correction) and test = "adhoc" (Knapp-Hartung with the max(1, .) truncation, t on
#           k - p = df.Q): b, se, ci.lb, ci.ub, pval.
#  qp     : confint(rma(..., method = "PM"), type = "QP") LIMITS on the star / het networks (harness out.qp.data), y and
#           SE x 1, 10, 100, control(tau2.max = 1e8) (metafor's default cap 100 binds at x 100). rma.uni's PM POINT estimate
#           with mods and no intercept is not the regression PM (het: 0.5647, residual Q 3.96, not df = 4; the page's
#           0.5588 gives Q = 4.000), so only the limits are compared: solved tightly (uniroot, tol 1e-15) on the residual
#           Q(tau2), and metafor's own confint values (uniroot tol ~1e-4) kept for a looser check.
#  cbm    : the two-arm studies of smokingcessation, log OR (0.5 only in a study with a zero cell), design = treatment
#           contrasts + the centred baseline logit(e2 + 0.5)/(n2 + 1) of the row's second arm: REML / ML tau2 by rma.mv;
#           PM as the root of the residual Q(tau2) = k - p and DL as (Q - df) / tr(P) in matrix algebra (rma.uni's
#           estimators do not give the regression values for a no-intercept design, see nmapro4_reference.R); slope /
#           SE / TE by rma.uni with tau2 fixed at that value.
#  ms     : log-likelihood / AIC / BIC / AICc (metafor fitstats) of the RE and the common-effect model, REML and ML:
#           two-arm Senn by rma.mv (one random effect per row); full Senn (Willms1999 3-arm) by rma.mv on the kept rows (those with the study's
#           first arm) with the back-calculated multi-arm covariance and the RE structure tau2 * (1 on the diagonal,
#           0.5 within the study): random = ~ factor(row) | study, struct = "CS", rho = +-0.5 (the sign of the shared arm). LRT from the two logLik,
#           p = 0.5 * pchisq(LRT, 1, lower.tail = FALSE).
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[1] else "nmapro5b_r460.json"
.libPaths(c("C:/Users/mahmo/wt/rlib2", "C:/Users/mahmo/wt/rlib", "C:/Users/mahmo/AppData/Local/R/win-library/4.6", .libPaths()))
suppressMessages({library(netmeta); library(metafor); library(jsonlite)})
res <- list(versions = list(R = R.version.string, netmeta = as.character(packageVersion("netmeta")),
                            metafor = as.character(packageVersion("metafor"))))
here <- getwd()

# ---------------------------------------------------------------- export scripts
res$export <- local({ ex <- list()  # local(): the scripts' objects must not leak into the metafor code below
for (f in sort(list.files(file.path(here, "fixtures", "nmapro5-export"), pattern = "\\.R$", full.names = TRUE))) {
  nm <- sub("\\.R$", "", basename(f))
  if (grepl("\\.bench$", nm) && !(nm %in% c("senn_PM.bench", "smoke_OR_REML.bench"))) next
  e <- new.env()
  td <- tempfile("nmapro5b"); dir.create(td); old <- setwd(td)
  r <- tryCatch({ sys.source(f, envir = e); "ran" }, error = function(err) paste("ERROR:", conditionMessage(err)))
  setwd(old)
  if (r != "ran") { ex[[nm]] <- list(error = r); next }
  net0 <- e$net; net <- if (!is.null(e$net.page)) e$net.page else net0  # net.page: tau2 fixed at the page's exact-likelihood value
  ref <- net$reference.group; rnd <- isTRUE(net$random)
  TEv <- if (rnd) net$TE.random[, ref] else net$TE.common[, ref]
  sev <- if (rnd) net$seTE.random[, ref] else net$seTE.common[, ref]
  ex[[nm]] <- list(tau2 = if (rnd) net$tau^2 else 0, Q = net$Q, df = net$df.Q, k = net$k,
                           method.tau = net0$method.tau, tau2_netmeta = if (isTRUE(net0$random)) net0$tau^2 else 0,
                           has_net_page = !is.null(e$net.page), TE = as.list(TEv), se = as.list(sev),
                           json = file.exists(file.path(td, "nma_external_benchmark.json")))
}
ex })

# ---------------------------------------------------------------- hk
s2 <- read.csv(file.path("fixtures", "nmapro2-senn2013-2arm.csv"))
des <- function(d, ref) { tr <- setdiff(sort(unique(c(d$treat1, d$treat2))), ref)
  X <- sapply(tr, function(t) (d$treat1 == t) - (d$treat2 == t)); colnames(X) <- tr; X }
X2 <- des(s2, "plac")
res$hk <- list()
# metafor rma.uni(mods, intercept = FALSE) does NOT return the regression REML tau2 for this no-intercept design
# (two-arm Senn: rma.uni REML 0.19656, rma.mv REML 0.10953 = the page); rma.mv gives tau2, and the Knapp-Hartung interval is
# rma.uni with tau2 FIXED at that value (no estimation inside rma.uni).
t2r <- rma.mv(s2$yi, s2$sei^2, mods = X2, intercept = FALSE, random = ~ 1 | study, data = s2, method = "REML")$sigma2
for (tst in c("z", "adhoc")) {
  m <- rma(s2$yi, sei = s2$sei, mods = X2, intercept = FALSE, tau2 = t2r, test = tst)
  res$hk[[tst]] <- list(tau2 = t2r, b = as.list(setNames(c(m$b), colnames(X2))), se = as.list(setNames(m$se, colnames(X2))),
                        lo = as.list(setNames(m$ci.lb, colnames(X2))), hi = as.list(setNames(m$ci.ub, colnames(X2))),
                        p = as.list(setNames(m$pval, colnames(X2))), dfs = if (tst == "z") NA else m$ddf[1])
}

# ---------------------------------------------------------------- qp
mk <- function(rows) data.frame(study = sapply(rows, `[[`, 1), treat1 = sapply(rows, `[[`, 2), treat2 = sapply(rows, `[[`, 3),
                                yi = sapply(rows, `[[`, 4), sei = sapply(rows, `[[`, 5))
qpd <- list(star = list(list("S1", "B", "A", -0.3, 0.2), list("S2", "B", "A", -0.1, 0.25), list("S3", "C", "A", 0.2, 0.2),
                        list("S4", "C", "A", 0.5, 0.3), list("S5", "D", "A", -0.4, 0.2), list("S6", "D", "A", 0.1, 0.22),
                        list("S7", "D", "B", 0.0, 0.3)),
            het = list(list("H1", "B", "A", -0.9, 0.2), list("H2", "B", "A", 0.4, 0.25), list("H3", "C", "A", 0.2, 0.2),
                       list("H4", "C", "A", 1.3, 0.3), list("H5", "D", "A", -0.8, 0.2), list("H6", "D", "A", 0.6, 0.22),
                       list("H7", "D", "B", 0.0, 0.3)))
res$qp <- list()
for (nm in names(qpd)) { d <- mk(qpd[[nm]]); X <- des(d, "A")
  for (sc in c(1, 10, 100)) { m <- rma(d$yi * sc, sei = d$sei * sc, mods = X, intercept = FALSE, method = "PM",
                                       control = list(tau2.max = 1e8))  # metafor's default tau2.max = 100 caps the QP search
    ci <- suppressWarnings(confint(m, type = "QP"))$random[1, ]
    # the same limits solved tightly: residual Q(tau2) of the no-intercept regression = qchisq targets (uniroot tol 1e-15)
    y <- d$yi * sc; v <- (d$sei * sc)^2; df <- nrow(d) - ncol(X)
    Qf <- function(t2) { W <- diag(1 / (v + t2)); A <- solve(t(X) %*% W %*% X); r <- y - X %*% A %*% t(X) %*% W %*% y; c(t(r) %*% W %*% r) }
    lim <- function(tg) if (Qf(0) <= tg) 0 else uniroot(function(t) Qf(t) - tg, c(0, 1e4 * sc^2), tol = 1e-15 * sc^2)$root
    res$qp[[paste0(nm, "_", sc)]] <- list(lower = lim(qchisq(0.975, df)), upper = lim(qchisq(0.025, df)),
                                          metafor_lower = ci[["ci.lb"]], metafor_upper = ci[["ci.ub"]]) } }

# ---------------------------------------------------------------- cbm
smk <- read.csv(file.path("fixtures", "nmapro3-smoking.csv"))
two <- smk[!(smk$study %in% smk$study[duplicated(smk$study)]), ]
z <- with(two, e1 == 0 | e2 == 0 | e1 == n1 | e2 == n2); cc <- ifelse(z, 0.5, 0)
yi <- with(two, log(((e1 + cc) * (n2 - e2 + cc)) / ((n1 - e1 + cc) * (e2 + cc))))
vi <- with(two, 1 / (e1 + cc) + 1 / (n1 - e1 + cc) + 1 / (e2 + cc) + 1 / (n2 - e2 + cc))
pb <- with(two, (e2 + 0.5) / (n2 + 1)); b <- log(pb / (1 - pb)); b <- b - mean(b)
Xc <- cbind(des(two, "A"), base = b)
res$cbm <- list(studies = as.character(two$study))
cbmfit <- function(t2) { m <- rma(yi, vi, mods = Xc, intercept = FALSE, tau2 = t2)
  list(tau2 = t2, slope = m$b["base", 1], slopeSE = m$se[ncol(Xc)], TE = as.list(setNames(c(m$b)[1:3], colnames(Xc)[1:3]))) }
dd <- data.frame(yi = yi, vi = vi, id = seq_along(yi))
for (mt in c("REML", "ML")) res$cbm[[mt]] <- cbmfit(rma.mv(yi, vi, mods = Xc, intercept = FALSE, random = ~ 1 | id, data = dd, method = mt)$sigma2)
Qt <- function(t2) { W <- diag(1 / (vi + t2)); A <- solve(t(Xc) %*% W %*% Xc); r <- yi - Xc %*% A %*% t(Xc) %*% W %*% yi; c(t(r) %*% W %*% r) }
dfb <- length(yi) - ncol(Xc)
res$cbm$PM <- cbmfit(if (Qt(0) <= dfb) 0 else uniroot(function(t) Qt(t) - dfb, c(0, 100), tol = 1e-14)$root)
W <- diag(1 / vi); A <- solve(t(Xc) %*% W %*% Xc); P <- W - W %*% Xc %*% A %*% t(Xc) %*% W
res$cbm$DL <- cbmfit(max(0, (Qt(0) - dfb) / sum(diag(P))))

# ---------------------------------------------------------------- ms
fst <- function(m) { f <- fitstats(m); list(logL = f[1, 1], deviance = f[2, 1], AIC = f[3, 1], BIC = f[4, 1], AICc = f[5, 1]) }
res$ms <- list()
for (mt in c("REML", "ML")) {
  re <- rma.mv(s2$yi, s2$sei^2, mods = X2, intercept = FALSE, random = ~ 1 | study, data = s2, method = mt)
  fe <- rma.mv(s2$yi, s2$sei^2, mods = X2, intercept = FALSE, data = s2, method = mt)
  lrt <- 2 * (logLik(re)[1] - logLik(fe)[1])
  res$ms[[paste0("senn2_", mt)]] <- list(re = c(fst(re), tau2 = re$sigma2), fe = fst(fe), lrt = lrt,
                                         p = 0.5 * pchisq(lrt, 1, lower.tail = FALSE))
}
senn <- read.csv(file.path("fixtures", "nmapro3-senn2013-full.csv"))
w <- senn[senn$study == "Willms1999", ]; arms <- sort(unique(c(w$treat1, w$treat2)))
d3 <- sapply(arms, function(a) sum(w$sei[w$treat1 == a | w$treat2 == a]^2)); S <- sum(w$sei^2)
va <- (d3 - S / 2) / 1                       # k = 3: v_a = (sum of its two contrast variances - S/2) / (k - 2)
keep <- !(senn$study == "Willms1999" & senn$treat1 != arms[1] & senn$treat2 != arms[1])
sk <- senn[keep, ]; n <- nrow(sk); V <- diag(sk$sei^2)
iw <- which(sk$study == "Willms1999")
sg <- function(r, a) (sk$treat1[r] == a) - (sk$treat2[r] == a)
for (i in iw) for (j in iw) if (i != j) V[i, j] <- sum(sapply(arms, function(a) sg(i, a) * sg(j, a) * va[[a]]))
Xs <- des(sk, "plac"); sk$row <- seq_len(n)
rr <- 0.5 * sum(sapply(arms, function(a) sg(iw[1], a) * sg(iw[2], a)))  # RE correlation of the two kept rows (-0.5 here: acar is treat2 in one, treat1 in the other)
for (mt in c("REML", "ML")) {
  re <- rma.mv(sk$yi, V, mods = Xs, intercept = FALSE, random = ~ factor(row) | study, struct = "CS", rho = rr,
               data = sk, method = mt)
  fe <- rma.mv(sk$yi, V, mods = Xs, intercept = FALSE, data = sk, method = mt)
  lrt <- 2 * (logLik(re)[1] - logLik(fe)[1])
  res$ms[[paste0("senn_", mt)]] <- list(re = c(fst(re), tau2 = re$tau2), fe = fst(fe), lrt = lrt,
                                        p = 0.5 * pchisq(lrt, 1, lower.tail = FALSE), k = n)
}
writeLines(toJSON(res, auto_unbox = TRUE, digits = NA, pretty = TRUE), out)
cat("wrote", out, "\n")
