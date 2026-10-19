# nma-multiarm-rounding-reference.R -- netmeta oracle for the multi-arm variance audit
# (shared/nma-multiarm-v1.js auditStudies, PR #120).
#
# Data: one consistent four-arm study (independent arm variances .011/.023/.031/.047,
# arm effects 0/.3/.5/.8) whose contrast SEs are sqrt(v_i + v_j) ROUNDED to 3, 4 and 6
# decimal places, plus one two-arm study (A vs B, 0.2, SE 0.15). Effects are in the app's
# convention est = t2 - t1; netmeta's TE is treat1 - treat2, hence TE = -est.
# Also the PR's constructed counterexample (single four-arm study, SE 0.2 everywhere except
# C-D = sqrt(0.10)), which netmeta fits by keeping SE 0.2 (multiarm() reproduces every
# supplied variance) and which this engine refuses at full precision.
#
# Run: Rscript tests/fixtures/nma-multiarm-rounding-reference.R > tests/fixtures/nma-multiarm-rounding-oracle.json
suppressMessages(library(netmeta))
rounded <- list(
  dp3 = c(0.184, 0.205, 0.241, 0.232, 0.265, 0.279),
  dp4 = c(0.1844, 0.2049, 0.2408, 0.2324, 0.2646, 0.2793),
  dp6 = c(0.184391, 0.204939, 0.240832, 0.232379, 0.264575, 0.279285)
)
t1 <- c("A", "A", "A", "B", "B", "C"); t2 <- c("B", "C", "D", "C", "D", "D")
est <- c(0.3, 0.5, 0.8, 0.2, 0.5, 0.3)
tr <- c("A", "B", "C", "D")
mat <- function(M) unname(lapply(tr, function(i) unname(sapply(tr, function(j) M[i, j]))))
out <- list()
for (nm in names(rounded)) {
  d <- data.frame(study = c(rep("Four", 6), "Two"), t1 = c(t1, "A"), t2 = c(t2, "B"),
                  est = c(est, 0.2), se = c(rounded[[nm]], 0.15))
  fit <- netmeta(TE = -d$est, seTE = d$se, treat1 = d$t1, treat2 = d$t2, studlab = d$study,
                 sm = "MD", common = TRUE, random = TRUE, reference.group = "A")
  # netmeta TE[i, j] = i minus j, the same orientation as analyse().common.TE[i][j]
  out[[nm]] <- list(rows = d, TE_common = mat(fit$TE.common), seTE_common = mat(fit$seTE.common),
                    TE_random = mat(fit$TE.random), seTE_random = mat(fit$seTE.random),
                    tau2 = fit$tau2, Q = fit$Q)
}
ce <- data.frame(t1 = t1, t2 = t2, est = c(0.3, 0.6, 0.9, 0.3, 0.6, 0.3), se = c(rep(0.2, 5), sqrt(0.1)))
fit <- suppressWarnings(netmeta(TE = -ce$est, seTE = ce$se, treat1 = ce$t1, treat2 = ce$t2,
                                studlab = rep("S", 6), sm = "MD", common = TRUE, random = FALSE, reference.group = "A"))
out$counterexample <- list(TE_BA = fit$TE.common["B", "A"], seTE_BA = fit$seTE.common["B", "A"],
                           lower_BA = fit$lower.common["B", "A"], upper_BA = fit$upper.common["B", "A"])
out$provenance <- list(R = R.version.string, netmeta = as.character(packageVersion("netmeta")),
                       meta = as.character(packageVersion("meta")))
cat(jsonlite::toJSON(out, digits = NA, auto_unbox = TRUE, dataframe = "rows", pretty = TRUE), "\n")
