# Reference values for tests/test_nmapro5_modules.py (R 4.6.0, netmeta 3.7.0, meta 8.5-0, metafor 5.0.1).
# Regenerate from nma-pro-v2/tests:
#   Rscript --no-environ nmapro5_reference.R nmapro5_r460.json
#
#  rd      : smokingcessation + a 3-arm study "25" whose arm C has 0 events (fixtures/nmapro4-smoking-zero.csv),
#            pairwise(sm = "RD") (one 0.5 increment in the variance of EVERY arm of a study with a zero cell; TE is the
#            raw p1 - p2): study 25's TE / seTE and netmeta(method.tau = "DL"): tau2, Q, TE / seTE.random vs A.
#  loo     : the full Senn 2013 data (TE/seTE; Willms1999 is a 3-arm study, 3 rows): netmeta(DL; REML for the 3-arm
#            study and design) without selected STUDIES (all its rows) -- tau2, Q, TE.random vs plac -- and without each DESIGN (the sorted set of a
#            study's arms, as netmeta decomp.design: "acar:metf:plac" is Willms1999's design) -- tau2.
#  bridge  : fixtures/nmapro5-bridge.csv, A-B x3, B-C x1 (b4, the only link), C-D x2, C-E, D-E. netmeta without b4
#            stops (the network falls into two sub-networks); its message is recorded.
#  dis     : a disconnected network (A-B x2, C-D x2): netmeta's message.
#  scale   : Senn 2013 with TE and seTE x 1, x 1e-6 and x 1e-7: netmeta DL / REML tau2, Q and TE / seTE.random of
#            acar vs plac (the page must give the x 1 numbers rescaled). netmeta is not scale-equivariant itself: x 1e-6
#            gives Q 97.38 (x 1: 96.99) and at x 1e-7 its solve() fails; that error is recorded.
#  tacc    : pairwise(incr = "TACC") on study 25 -- netmeta's pairwise() has no treatment-arm continuity correction.
#  na      : pairwise(sm = "OR") on S1 A 10/100 vs B NA/100, S2 A 12/100 vs B 15/100, S3 B 7/90 vs C 9/90, S4 A 8/80 vs
#            C 11/80, S5 A 6/70 vs C 9/70: pairwise() leaves the comparison with a missing event count out ("1 table with
#            NAs omitted"), and netmeta runs on the rest.
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[1] else "nmapro5_r460.json"
.libPaths(c("C:/Users/mahmo/wt/rlib2", "C:/Users/mahmo/AppData/Local/R/win-library/4.6", .libPaths()))
suppressMessages({library(netmeta); library(meta); library(jsonlite)})
fx <- function(f) file.path("fixtures", f)
res <- list(versions = list(R = R.version.string, netmeta = as.character(packageVersion("netmeta")),
                            meta = as.character(packageVersion("meta"))))
vec <- function(x) as.list(x)

# ---------------------------------------------------------------- rd
d <- read.csv(fx("nmapro4-smoking-zero.csv"))
a <- unique(rbind(data.frame(s = d$study, t = d$treat1, e = d$e1, n = d$n1), data.frame(s = d$study, t = d$treat2, e = d$e2, n = d$n2)))
sp <- split(a, a$s); k <- max(sapply(sp, nrow))
L <- lapply(1:k, function(j) sapply(sp, function(x) if (nrow(x) >= j) x$t[j] else NA))
E <- lapply(1:k, function(j) sapply(sp, function(x) if (nrow(x) >= j) x$e[j] else NA))
N <- lapply(1:k, function(j) sapply(sp, function(x) if (nrow(x) >= j) x$n[j] else NA))
p <- pairwise(L, event = E, n = N, studlab = names(sp), sm = "RD")
r25 <- p[p$studlab == "25", ]
nm <- netmeta(p, method.tau = "DL", reference.group = "A")
res$rd <- list(row25 = setNames(lapply(seq_len(nrow(r25)), function(i) list(TE = r25$TE[i], seTE = r25$seTE[i])),
                                paste(r25$treat1, r25$treat2, sep = ":")),
               tau2 = nm$tau^2, Q = nm$Q, df = nm$df.Q, TE = vec(nm$TE.random[, "A"]), se = vec(nm$seTE.random[, "A"]))

# ---------------------------------------------------------------- loo (study and design)
senn <- read.csv(fx("nmapro3-senn2013-full.csv"))
fit <- function(dd, mt) netmeta(yi, sei, treat1, treat2, study, data = dd, sm = "MD", reference.group = "plac",
                                 method.tau = mt, common = FALSE)
studies <- unique(senn$study)
design <- sapply(studies, function(s) { x <- senn[senn$study == s, ]; paste(sort(unique(c(x$treat1, x$treat2))), collapse = ":") })
res$loo <- list(designOf = vec(design))
# netmeta 3.7.0 takes ~16 s CPU per fit here, so a selection: the 3-arm study, three two-arm studies (one sharing a
# design with others), the 3-arm design, a 6-study design and a 3-study design; DL, and REML for the 3-arm study/design.
pick_s <- list(DL = c("Willms1999", "DeFronzo1995", "Oyama2008", "Moulin2006"), REML = c("Willms1999"))
pick_d <- list(DL = c("acar:metf:plac", "plac:rosi", "metf:plac"), REML = c("acar:metf:plac"))
for (mt in c("DL", "REML")) {
  st <- list()
  for (s in pick_s[[mt]]) { f <- fit(senn[senn$study != s, ], mt)
    st[[s]] <- list(tau2 = f$tau^2, Q = f$Q, df = f$df.Q, TE = vec(f$TE.random[, "plac"])) }
  de <- list()
  for (g in pick_d[[mt]]) { keep <- !(senn$study %in% studies[design == g])
    f <- fit(senn[keep, ], mt); de[[g]] <- list(tau2 = f$tau^2, nStudies = length(unique(senn$study[keep]))) }
  res$loo[[mt]] <- list(study = st, design = de, nStudies = length(studies), nDesigns = length(unique(design)))
}

# ---------------------------------------------------------------- bridge / disconnected
br <- read.csv(fx("nmapro5-bridge.csv"))
fb <- function(dd) netmeta(yi, sei, treat1, treat2, study, data = dd, sm = "MD", reference.group = "A", method.tau = "DL")
res$bridge <- list(full_tau2 = fb(br)$tau^2,
                   without_b4 = tryCatch({fb(br[br$study != "b4", ]); "ran"}, error = function(e) conditionMessage(e)),
                   without_b7_tau2 = fb(br[br$study != "b7", ])$tau^2)
dis <- data.frame(study = c("a", "b", "c", "d"), treat1 = c("A", "A", "C", "C"), treat2 = c("B", "B", "D", "D"),
                  yi = c(0.1, 0.3, -0.2, 0), sei = c(0.2, 0.25, 0.2, 0.3))
res$dis <- tryCatch({fb(dis); "ran"}, error = function(e) conditionMessage(e))

# ---------------------------------------------------------------- scale
res$scale <- list()
for (sc in c(1, 1e-6, 1e-7)) {
  dd <- transform(senn, yi = yi * sc, sei = sei * sc)
  for (mt in if (sc == 1e-6) "DL" else c("DL", "REML")) {
    # netmeta itself is not scale-equivariant: at small scales solve() of its Laplacian fails ("computationally singular")
    res$scale[[paste0(mt, "_", format(sc))]] <- tryCatch({ f <- fit(dd, mt)
      list(sc = sc, tau2 = f$tau^2, Q = f$Q, TE = f$TE.random["acar", "plac"], se = f$seTE.random["acar", "plac"]) },
      error = function(e) list(sc = sc, error = conditionMessage(e))) }
}

# ---------------------------------------------------------------- tacc / NA
res$tacc <- tryCatch({pairwise(list("A", "B", "C"), event = list(5, 8, 0), n = list(50, 60, 40), studlab = "25",
                               sm = "OR", incr = "TACC"); "ran"}, error = function(e) conditionMessage(e))
na <- data.frame(study = c("S1", "S2", "S3", "S4", "S5"), t1 = c("A", "A", "B", "A", "A"), t2 = c("B", "B", "C", "C", "C"),
                 e1 = c(10, 12, 7, 8, 6), n1 = c(100, 100, 90, 80, 70), e2 = c(NA, 15, 9, 11, 9), n2 = c(100, 100, 90, 80, 70))
# (pairwise(..., data = na) itself errors on the NA -- "arguments imply differing number of rows: 4, 5" -- so the
# columns are passed as vectors; pairwise() then drops the study with a warning)
w <- NULL
pn <- withCallingHandlers(pairwise(list(na$t1, na$t2), event = list(na$e1, na$e2), n = list(na$n1, na$n2), studlab = na$study, sm = "OR"),
                          warning = function(x) { w <<- c(w, conditionMessage(x)); invokeRestart("muffleWarning") })
nn <- withCallingHandlers(netmeta(pn, method.tau = "DL", reference.group = "A"),
                          warning = function(x) { w <<- c(w, conditionMessage(x)); invokeRestart("muffleWarning") })
res$na <- list(pairwise_studlab = pn$studlab, k = nn$k, m = nn$m, studlab = nn$studlab,
               warning = w, tau2 = nn$tau^2, Q = nn$Q, TE = vec(nn$TE.random[, "A"]))

writeLines(toJSON(res, auto_unbox = TRUE, digits = NA, pretty = TRUE), out)
cat("wrote", out, "\n")
