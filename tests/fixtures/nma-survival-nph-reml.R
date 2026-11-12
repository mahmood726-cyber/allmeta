# Reference for tests/test_nma_survival_nph.py::test_reml_ml_tau2_match_netmeta
# netmeta 3.7.0 (metafor 5.2.1), R 4.6.0: per-interval contrasts built exactly as shared/nma-survival-nph.js
# builds them (log((events + 0.5)/ptime) differences, var 1/(e1+0.5) + 1/(e2+0.5), every arm pair),
# then netmeta(..., reference.group = "A", method.tau = "REML" / "ML" / "DL").
# "exact_REML"/"exact_ML": metafor::rma.mv on each study's basic contrasts (vs its alphabetically first arm)
# with the FULL sampling covariance (shared-arm variance 1/(e_base + 0.5) off the diagonal), random =
# ~ factor(comparison) | studlab, rho = 0.5 -- the model netmeta fits for REML/ML, but netmeta 3.7.0 given
# only TE/seTE uses a DIAGONAL V (V <- seTE^2 in netmeta()), i.e. it ignores the within-study covariance
# of multi-arm trials. The two agree when every trial has two arms.
# Run: Rscript tests/fixtures/nma-survival-nph-reml.R > tests/fixtures/nma-survival-nph-reml.json
suppressMessages({ library(netmeta); library(metafor); library(jsonlite) })
stopifnot(packageVersion("netmeta") == "3.7.0")
arms <- data.frame(
  interval = c(rep("1", 12), rep("2", 13), rep("3", 8)),
  study = c("a1","a1","a2","a2","a3","a3","a4","a4","a5","a5","a6","a6",
            "b1","b1","b2","b2","b3","b3","b4","b4","b4","b5","b5","b6","b6",
            "c1","c1","c2","c2","c3","c3","c4","c4"),
  treatment = c("A","B","A","B","A","C","A","C","B","C","A","B",
                "A","B","A","C","B","C","A","B","C","A","B","A","C",
                "A","B","A","B","A","C","B","C"),
  events = c(40,30, 50,20, 45,20, 30,28, 28,22, 60,59,
             40,30, 45,8, 28,22, 50,33,25, 12,30, 60,55,
             40,36, 44,40, 38,30, 35,29),
  ptime = c(1000,1000, 900,950, 900,900, 800,820, 850,800, 1500,1400,
            1000,1000, 900,900, 850,800, 1200,1100,1150, 400,420, 1500,1400,
            1000,1000, 1100,1100, 950,960, 900,910))
cc <- 0.5
out <- list(rows = arms, intervals = list())
for (iv in unique(arms$interval)) {
  a <- arms[arms$interval == iv, ]
  pw <- do.call(rbind, lapply(split(a, a$study), function(d) {
    d <- d[order(d$treatment), ]; o <- NULL
    for (i in 1:(nrow(d) - 1)) for (j in (i + 1):nrow(d))
      o <- rbind(o, data.frame(studlab = d$study[1], treat1 = d$treatment[i], treat2 = d$treatment[j],
        TE = log((d$events[j] + cc) / d$ptime[j]) - log((d$events[i] + cc) / d$ptime[i]),
        seTE = sqrt(1 / (d$events[j] + cc) + 1 / (d$events[i] + cc))))
    o }))
  res <- list()
  for (m in c("DL", "REML", "ML")) {
    r <- netmeta(TE, seTE, treat2, treat1, studlab, data = pw, reference.group = "A",
                 common = FALSE, random = TRUE, method.tau = m)
    tr <- setdiff(rownames(r$TE.random), "A")
    res[[m]] <- list(tau2 = r$tau^2,
      effects = setNames(lapply(tr, function(t) list(logHR = r$TE.random[t, "A"], se = r$seTE.random[t, "A"])), tr))
  }
  # exact likelihood with the full multi-arm covariance
  bc <- NULL; Vb <- list()
  for (s in unique(a$study)) {
    d <- a[a$study == s, ]; d <- d[order(d$treatment), ]
    vb <- 1 / (d$events[1] + cc); va <- 1 / (d$events[-1] + cc)
    bc <- rbind(bc, data.frame(studlab = s, treat1 = d$treatment[1], treat2 = d$treatment[-1],
      TE = log((d$events[-1] + cc) / d$ptime[-1]) - log((d$events[1] + cc) / d$ptime[1])))
    Vb[[s]] <- matrix(vb, length(va), length(va)) + diag(va, length(va))
  }
  V <- bldiag(Vb[unique(bc$studlab)])
  trs <- sort(unique(c(bc$treat1, bc$treat2))); nonref <- setdiff(trs, "A")
  X <- sapply(nonref, function(t) (bc$treat2 == t) - (bc$treat1 == t))
  bc$comparison <- paste(bc$treat1, bc$treat2)
  for (m in c("REML", "ML")) {
    r <- rma.mv(bc$TE, V, mods = X, intercept = FALSE, random = ~ factor(comparison) | studlab, rho = 0.5,
                struct = "CS", method = m, data = bc, control = list(rel.tol = 1e-10, iter.max = 10000))
    res[[paste0("exact_", m)]] <- list(tau2 = r$tau2,
      effects = setNames(lapply(seq_along(nonref), function(k) list(logHR = unname(r$beta[k]), se = unname(r$se[k]))), nonref))
  }
  out$intervals[[iv]] <- res
}
cat(toJSON(out, digits = NA, auto_unbox = TRUE, pretty = TRUE))
