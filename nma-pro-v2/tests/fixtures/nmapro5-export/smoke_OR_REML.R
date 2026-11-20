# NMA Pro v8.1 - R netmeta script reproducing the page's analysis
# effect measure OR, estimator REML, zero-cell haldane, correction hksj, level 0.95
# NOTE: netmeta's REML treats the contrasts of a multi-arm study as independent (its REML uses V = seTE^2); the page maximises the exact likelihood WITH the multi-arm covariance (as metafor rma.mv), so net$tau^2 differs from the page; net.page fixes tau2 at the page's value and reproduces its estimates and SEs
# NOTE: the page's "hksj" small-sample correction scales the variance (HKSJ: by max(1, Q/df.Q)) and uses t on df.Q; netmeta 3.7.0 has no such interval, so the CIs / p-values below are the uncorrected ones (tau2, Q, estimates and SEs before the correction are comparable)
library(netmeta)

# arm-level data: one row per study and arm (a k-arm study is ONE study with k arms)
arms <- data.frame(
  study = c("1", "1", "1", "2", "2", "2", "3", "3", "4", "4", "5", "5", "6", "6", "7", "7", "8", "8", "9", "9", "10", "10", "11", "11", "12", "12", "13", "13", "14", "14", "15", "15", "16", "16", "17", "17", "18", "18", "19", "19", "20", "20", "21", "21", "22", "22", "23", "23", "24", "24"),
  treat = c("A", "C", "D", "B", "C", "D", "A", "C", "A", "C", "A", "C", "A", "C", "A", "C", "A", "C", "A", "C", "A", "B", "A", "B", "A", "C", "A", "C", "A", "C", "A", "D", "A", "B", "A", "C", "A", "C", "A", "C", "A", "C", "B", "C", "B", "D", "C", "D", "C", "D"),
  event = c(9, 23, 10, 11, 12, 29, 75, 363, 2, 9, 58, 237, 0, 9, 3, 31, 1, 26, 6, 17, 79, 77, 18, 21, 64, 107, 5, 8, 20, 34, 0, 9, 8, 19, 95, 143, 15, 36, 78, 73, 69, 54, 20, 16, 7, 32, 12, 20, 9, 3),
  n = c(140, 140, 138, 78, 85, 170, 731, 714, 106, 205, 549, 1561, 33, 48, 100, 98, 31, 95, 39, 77, 702, 694, 671, 535, 642, 761, 62, 90, 234, 237, 20, 20, 116, 149, 1107, 1031, 187, 504, 584, 675, 1177, 888, 49, 43, 66, 127, 76, 74, 55, 26)
)
sp <- split(arms, factor(arms$study, levels = unique(arms$study)))
k <- max(sapply(sp, nrow))
wide <- function(v) lapply(seq_len(k), function(j) unname(sapply(sp, function(x) if (nrow(x) >= j) x[[v]][j] else NA)))
p1 <- pairwise(treat = wide("treat"), event = wide("event"), n = wide("n"),
               studlab = names(sp), sm = "OR", incr = 0.5, allstudies = TRUE)

net <- netmeta(TE, seTE, treat1, treat2, studlab, data = p1, sm = "OR",
               reference.group = "A", common = FALSE, random = TRUE, method.tau = "REML",
               level = 0.95, level.ma = 0.95)

# the page's analysis: tau2 fixed at its exact-likelihood REML value
net.page <- netmeta(TE, seTE, treat1, treat2, studlab, data = p1, sm = "OR",
               reference.group = "A", common = FALSE, random = TRUE, tau.preset = sqrt(0.4502301047310387),
               level = 0.95, level.ma = 0.95)
