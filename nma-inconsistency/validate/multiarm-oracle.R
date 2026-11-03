## multiarm-oracle.R -- netmeta reference for multi-arm networks in nma-inconsistency.
##
## Run from the repository root:
##   Rscript nma-inconsistency/validate/multiarm-oracle.R
## Writes nma-inconsistency/validate/multiarm-oracle.json.
##
## Parity targets (per dataset, per page model FE / DL / PM):
##   * consistency fit   netmeta(): TE/seTE of every treatment vs the first
##                       treatment in radix order (common for FE, random for
##                       DL/PM), Q total and its df, tau2 (DL = netmeta's own
##                       method.tau = "DL"; FE = 0; PM see below).
##   * node-splitting    netsplit(method = "Back-calculation", tol.direct = 0):
##                       every comparison with finite direct AND indirect
##                       estimates, oriented "a vs b" with a < b in radix
##                       order (the page's orientation): direct, direct SE,
##                       indirect, indirect SE, difference, its SE, z, p.
##   * design-by-treatment decomp.design(): Q.decomp (Total / Within designs /
##                       Between designs) for FE; Q.inc.random.preset with
##                       tau.preset = the model's tau for DL and PM (the page's
##                       global test). Q.inc.design (per-design FE
##                       contributions) is recorded for reference.
##
## Paule-Mandel: netmeta has no network PM. The PM reference is the root of
## Q_RE(tau2) = df, where Q_RE is netmeta's own random-effects quadratic form
##   (TE - TE.nma.random)' W.matrix.random (TE - TE.nma.random)
## taken from netmeta(..., tau.preset = tau). For two-arm-only data this is
## the uncentred metafor .QE.func equation the page's two-arm PM reference
## uses; that identity is checked below on tests/fixtures/inco-het.csv and the
## run stops if it does not hold.
##
## Datasets: (1) a synthetic network built from arm-level means (two 3-arm
## studies of the same design, one further 3-arm study, one 4-arm study and
## two-arm studies); (2) netmeta's smokingcessation (two 3-arm studies) and
## (3) Woods2010 (one 4-arm and 3-arm studies) via pairwise(); (4) Senn2013
## (one 3-arm study, contrast-level input); (5) every distinct input of the
## pinned page corpus that the page used to refuse as multi-arm
## (validate/corpus/corpus.json), so the replay can be re-anchored.
## Inputs are written with 17 significant digits, exactly as the page parses
## them; the oracle refits netmeta on those printed values.
suppressPackageStartupMessages({ library(netmeta); library(metafor); library(jsonlite) })
root <- "nma-inconsistency"
if (!dir.exists(root)) stop("Run from the repository root.")
versions <- list(R = paste(R.version$major, R.version$minor, sep = "."),
                 netmeta = as.character(packageVersion("netmeta")),
                 metafor = as.character(packageVersion("metafor")),
                 meta = as.character(packageVersion("meta")))

f17 <- function(x) sprintf("%.17g", x)
csv_text <- function(d) paste(sprintf('"%s","%s",%s,%s,"%s"', d$A, d$B, f17(d$te), f17(d$se), d$study), collapse = "\n")
from_pairwise <- function(p) {
  d <- data.frame(A = as.character(p$treat1), B = as.character(p$treat2), te = p$TE, se = p$seTE,
                  study = as.character(p$studlab), stringsAsFactors = FALSE)
  d <- d[is.finite(d$te) & is.finite(d$se) & d$se > 0, ]
  # Round-trip through the 17-digit text the page will parse.
  d$te <- as.numeric(f17(d$te)); d$se <- as.numeric(f17(d$se))
  d
}

## Largest multi-arm consistency residual (netmeta chkmultiarm definition).
resid_multiarm <- function(d) {
  out <- 0
  for (s in unique(d$study)) {
    x <- d[d$study == s, ]
    if (nrow(x) < 2) next
    tr <- sort(unique(c(x$A, x$B)), method = "radix")
    k <- length(tr)
    if (nrow(x) != k * (k - 1) / 2) next
    X <- t(sapply(seq_len(nrow(x)), function(i) as.numeric(tr == x$A[i]) - as.numeric(tr == x$B[i])))
    out <- max(out, abs(x$te - X %*% MASS::ginv(X) %*% x$te))
  }
  out
}

qre <- function(m) {
  r <- m$TE - m$TE.nma.random
  as.numeric(t(r) %*% m$W.matrix.random %*% r)
}
nm <- function(d, ref, tau.preset = NULL)
  netmeta(TE = d$te, seTE = d$se, treat1 = d$A, treat2 = d$B, studlab = d$study, sm = "MD",
          reference.group = ref, common = TRUE, random = TRUE, method.tau = "DL",
          tau.preset = tau.preset, sep.trts = " ~~ ", warn = FALSE)
## Same quadratic form via netmeta's own internals (prepare + nma_ruecker), which
## skips netsplit/netmeasures/decomp and is ~5x faster inside uniroot. The
## final fit re-checks it against the full netmeta() object (qre above).
## prepare()/multiarm() assume each study's rows are oriented treat1 < treat2
## (netmeta() reorients before calling them), otherwise the contrast variances
## are matched to the wrong edges; reorient the same way here.
qre_fast <- function(d, t2) {
  tr <- sort(unique(c(d$A, d$B)))
  sw <- match(d$A, tr) > match(d$B, tr)
  if (any(sw)) { a <- d$A[sw]; d$A[sw] <- d$B[sw]; d$B[sw] <- a; d$te[sw] <- -d$te[sw] }
  p1 <- netmeta:::prepare(d$te, d$se, d$A, d$B, d$study, tau = sqrt(t2), func.inverse = netmeta:::invmat)
  dat <- p1$data
  netmeta:::nma_ruecker(dat$TE, as.matrix(p1$W), sqrt(1 / dat$weights), dat$treat1, dat$treat2, dat$treat1.pos,
    dat$treat2.pos, dat$narms, dat$studlab, "MD", 0.95, 0.95, dat$seTE, 0, ":", "DL", netmeta:::invmat, Cov0 = p1$Cov)$Q
}
pm_tau <- function(d, ref) {
  df <- sum(sapply(split(d, d$study), function(x) length(unique(c(x$A, x$B))) - 1)) - (length(unique(c(d$A, d$B))) - 1)
  if (df == 0) return(0)
  f <- function(t2) qre_fast(d, t2) - df
  if (f(0) <= 0) return(0)
  upper <- max(1, var(d$te)); while (f(upper) > 0) upper <- upper * 2
  sqrt(uniroot(f, c(0, upper), tol = .Machine$double.eps^0.75, maxiter = 1000)$root)
}

one_model <- function(d, model) {
  tr <- sort(unique(c(d$A, d$B)), method = "radix")
  ref <- tr[1]
  tau <- if (model == "FE") 0 else if (model == "PM") pm_tau(d, ref) else NULL
  m <- nm(d, ref, tau.preset = if (model == "DL") NULL else tau)
  if (model == "DL") tau <- if (is.na(m$tau)) 0 else m$tau
  suffix <- if (model == "FE") "common" else "random"
  TEm <- m[[paste0("TE.", suffix)]]; SEm <- m[[paste0("seTE.", suffix)]]
  est <- lapply(tr, function(t) list(est = -TEm[ref, t], se = SEm[ref, t]))   # t minus ref
  names(est) <- tr
  s <- netsplit(m, method = "Back-calculation", tol.direct = 0)
  dir <- s[[paste0("direct.", suffix)]]; ind <- s[[paste0("indirect.", suffix)]]; cmp <- s[[paste0("compare.", suffix)]]
  splits <- list()
  for (j in seq_len(nrow(cmp))) {
    if (!is.finite(dir$TE[j]) || !is.finite(ind$TE[j])) next
    pair <- strsplit(cmp$comparison[j], " ~~ ", fixed = TRUE)[[1]]
    ord <- sort(pair, method = "radix"); sgn <- if (pair[1] == ord[1]) 1 else -1
    splits[[length(splits) + 1]] <- list(
      comparison = paste(ord, collapse = " vs "),
      direct = sgn * dir$TE[j], directSe = dir$seTE[j],
      indirect = sgn * ind$TE[j], indirectSe = ind$seTE[j],
      diff = sgn * cmp$TE[j], seDiff = cmp$seTE[j], z = sgn * cmp$z[j], p = cmp$p[j])
  }
  dec <- decomp.design(m, tau.preset = tau, warn = FALSE)
  qd <- dec$Q.decomp
  q <- if (model == "FE") qd else dec$Q.inc.random.preset
  r <- match("Between designs", rownames(q))
  g <- list(Q = q$Q[r], df = q$df[r], p = if (q$df[r] == 0) NULL else q$pval[r])
  if (g$df == 0) g$Q <- 0
  qre_at_tau <- qre(m)
  stopifnot(abs(qre_at_tau - qre_fast(d, tau^2)) < 1e-9 * max(1, qre_at_tau))
  list(status = "ok", model = model, tau2 = tau^2, trts = tr, reference = ref, estimates = est,
       Q = as.numeric(m$Q), df = as.numeric(m$df.Q),
       Qrandom = if (model == "FE") as.numeric(m$Q) else qre_at_tau,
       decomp = list(total = list(Q = qd$Q[1], df = qd$df[1]), within = list(Q = qd$Q[2], df = qd$df[2]),
                     between = list(Q = qd$Q[3], df = qd$df[3])),
       Q.inc.design = as.list(dec$Q.inc.design),
       dbt = g, nodeSplit = splits)
}
fit_all <- function(name, source, d) {
  res <- list(name = name, source = source, text = csv_text(d), maxMultiarmResidual = resid_multiarm(d),
              nStudies = length(unique(d$study)),
              nMultiarm = sum(table(d$study) > 1), models = list())
  for (model in c("FE", "DL", "PM")) {
    res$models[[model]] <- tryCatch(one_model(d, model),
      error = function(e) list(status = "refused", model = model, netmetaError = conditionMessage(e)))
  }
  cat(sprintf("[%s] %-40s studies=%d multi-arm=%d resid=%.3g FE=%s DL tau2=%s\n", format(Sys.time(), "%H:%M:%S"), name, res$nStudies, res$nMultiarm,
              res$maxMultiarmResidual, res$models$FE$status,
              if (res$models$DL$status == "ok") format(res$models$DL$tau2, digits = 6) else "-"))
  res
}

## --- identity check: netmeta-based PM == metafor .QE.func PM on two-arm data
het <- read.csv(file.path(root, "tests/fixtures/inco-het.csv"), stringsAsFactors = FALSE)
het <- data.frame(A = het$treat1, B = het$treat2, te = het$TE, se = het$seTE, study = het$studlab, stringsAsFactors = FALSE)
tr <- sort(unique(c(het$A, het$B)), method = "radix")
X <- sapply(tr[-1], function(t) as.numeric(het$A == t) - as.numeric(het$B == t))
qe <- get(".QE.func", asNamespace("metafor"))
fq <- function(t2) qe(t2, Y = as.matrix(het$te), vi = het$se^2, X = as.matrix(X), k = nrow(het), objective = nrow(het) - ncol(X))
up <- 1; while (fq(up) > 0) up <- up * 2
pm_metafor <- uniroot(fq, c(0, up), tol = .Machine$double.eps^0.75, maxiter = 1000)$root
pm_netmeta <- pm_tau(het, tr[1])^2
cat(sprintf("PM identity on inco-het: metafor %.15g netmeta-Q %.15g\n", pm_metafor, pm_netmeta))
stopifnot(abs(pm_metafor - pm_netmeta) < 1e-9)

datasets <- list()

## (1) synthetic, arm-level means -> exactly consistent multi-arm contrasts
set.seed(20261102)
arms <- list(
  S01 = c("A", "B", "C"), S02 = c("A", "B", "C"), S03 = c("B", "C", "D"), S04 = c("A", "B", "C", "D"),
  S05 = c("A", "B"), S06 = c("A", "C"), S07 = c("B", "D"), S08 = c("C", "E"), S09 = c("A", "E"),
  S10 = c("D", "E"), S11 = c("A", "B"), S12 = c("A", "D"))
truth <- c(A = 0, B = -0.4, C = -0.7, D = -0.2, E = 0.3)
long <- do.call(rbind, lapply(names(arms), function(s) {
  t <- arms[[s]]
  n <- sample(30:120, length(t), replace = TRUE)
  sd <- runif(length(t), 0.8, 1.6)
  mu <- truth[t] + rnorm(1, 0, 0.3) + rnorm(length(t), 0, 0.25)   # study effect + heterogeneity
  data.frame(studlab = s, treat = t, mean = mu + rnorm(length(t), 0, sd / sqrt(n)), sd = sd, n = n, stringsAsFactors = FALSE)
}))
p <- pairwise(treat = treat, n = n, mean = mean, sd = sd, studlab = studlab, data = long, sm = "MD")
datasets[[length(datasets) + 1]] <- fit_all("synthetic-3arm-4arm", "synthetic arm-level means, seed 20261102", from_pairwise(p))

## (2) smokingcessation (OR, events/n, two 3-arm studies)
data(smokingcessation)
p <- pairwise(list(treat1, treat2, treat3), event = list(event1, event2, event3), n = list(n1, n2, n3),
              data = smokingcessation, sm = "OR")
datasets[[length(datasets) + 1]] <- fit_all("smokingcessation-OR", "netmeta::smokingcessation via pairwise(sm='OR')", from_pairwise(p))

## (1b-1d) rounded and planted variants: netmeta's tol.multiarm = 0.001 is an
## ABSOLUTE bound on the projection residual TE - B ginv(B) TE of each
## multi-arm study (chkmultiarm); contrast variances are checked only if
## tol.multiarm.se is set (default NULL), but a negative implied arm variance
## always stops. Rounding to 3 decimals stays inside the tolerance (and makes
## the 4-arm study's SEs inconsistent); rounding to 2 decimals and a planted
## +0.01 are the cases netmeta must decide.
syn <- from_pairwise(pairwise(treat = treat, n = n, mean = mean, sd = sd, studlab = studlab, data = long, sm = "MD"))
rnd <- function(d, digits) { d$te <- round(d$te, digits); d$se <- round(d$se, digits); d }
datasets[[length(datasets) + 1]] <- fit_all("synthetic-rounded-3dp", "synthetic network, te and se rounded to 3 decimals", rnd(syn, 3))
datasets[[length(datasets) + 1]] <- fit_all("synthetic-rounded-2dp", "synthetic network, te and se rounded to 2 decimals", rnd(syn, 2))
smk <- from_pairwise(p)
datasets[[length(datasets) + 1]] <- fit_all("smokingcessation-rounded-2dp", "smokingcessation OR contrasts rounded to 2 decimals", rnd(smk, 2))
pl <- syn; i <- which(pl$study == "S01")[1]; pl$te[i] <- pl$te[i] + 0.01
datasets[[length(datasets) + 1]] <- fit_all("synthetic-planted-0.01", "synthetic network, one S01 contrast + 0.01", pl)

## (3) Woods2010 (OR, events/n, a 4-arm study)
data(Woods2010)
p <- pairwise(treatment, event = r, n = N, studlab = author, data = Woods2010, sm = "OR")
datasets[[length(datasets) + 1]] <- fit_all("Woods2010-OR", "netmeta::Woods2010 via pairwise(sm='OR')", from_pairwise(p))

## (4) Senn2013 (MD contrasts, one 3-arm study)
data(Senn2013)
s13 <- data.frame(A = Senn2013$treat1, B = Senn2013$treat2, te = Senn2013$TE, se = Senn2013$seTE,
                  study = Senn2013$studlab, stringsAsFactors = FALSE)
datasets[[length(datasets) + 1]] <- fit_all("Senn2013-MD", "netmeta::Senn2013 (TE/seTE as supplied)", s13)

## (5) the pinned corpus inputs the page refused as multi-arm
corpus <- fromJSON(file.path(root, "validate/corpus/corpus.json"), simplifyVector = FALSE)
seen <- character()
for (item in corpus) {
  if (is.null(item$text) || !isTRUE(grepl("^netmeta::", item$key))) next
  base <- sub("::(FE|DL|PM)$", "", item$key)
  if (base %in% seen) next
  d <- read.csv(text = item$text, header = FALSE, stringsAsFactors = FALSE, colClasses = "character")
  if (ncol(d) < 5) next
  names(d)[1:5] <- c("A", "B", "te", "se", "study")
  d$te <- as.numeric(d$te); d$se <- as.numeric(d$se)
  if (!any(duplicated(d$study))) next
  seen <- c(seen, base)
  datasets[[length(datasets) + 1]] <- fit_all(base, paste0("validate/corpus/corpus.json key ", item$key, " (same text for FE/DL/PM)"), d[, 1:5])
}

out <- list(generated = format(Sys.Date()), versions = versions,
            note = "Generated by validate/multiarm-oracle.R. Inputs are the exact 17-digit texts the page parses.",
            datasets = datasets)
writeLines(toJSON(out, auto_unbox = TRUE, digits = NA, null = "null", pretty = FALSE),
           file.path(root, "validate/multiarm-oracle.json"), useBytes = TRUE)
cat("wrote", file.path(root, "validate/multiarm-oracle.json"), "with", length(datasets), "datasets\n")
