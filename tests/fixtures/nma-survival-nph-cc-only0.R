# Reference for tests/test_nma_survival_nph.py::test_cc_only_zero_matches_meta_pairwise_netmeta
# meta 8.5-0 pairwise(sm = "IRR", incr = 0.5) adds the increment only in studies with a zero event count
# (its default; allincr = FALSE), then netmeta 3.7.0 (common and DL random effects, reference "A").
# Run: Rscript tests/fixtures/nma-survival-nph-cc-only0.R > tests/fixtures/nma-survival-nph-cc-only0.json
suppressMessages({ library(meta); library(netmeta); library(jsonlite) })
stopifnot(packageVersion("netmeta") == "3.7.0")
arms <- data.frame(
  study = c("s1","s1","s2","s2","s3","s3","s4","s4","s5","s5"),
  treatment = c("A","B","A","B","A","C","B","C","A","C"),
  interval = "1",
  events = c(12, 0, 30, 21, 25, 14, 9, 11, 40, 22),
  ptime = c(400, 410, 900, 880, 700, 720, 300, 310, 1200, 1150))
pw <- pairwise(treat = treatment, event = events, time = ptime, studlab = study, data = arms, sm = "IRR", incr = 0.5)
out <- list(rows = arms)
for (mod in c("common", "random")) {
  r <- netmeta(pw, reference.group = "A", common = mod == "common", random = mod == "random", method.tau = "DL")
  te <- if (mod == "common") r$TE.common else r$TE.random; se <- if (mod == "common") r$seTE.common else r$seTE.random
  tr <- setdiff(rownames(te), "A")
  out[[mod]] <- list(tau2 = r$tau^2, effects = setNames(lapply(tr, function(t) list(logHR = te[t, "A"], se = se[t, "A"])), tr))
}
cat(toJSON(out, digits = NA, auto_unbox = TRUE, pretty = TRUE))
