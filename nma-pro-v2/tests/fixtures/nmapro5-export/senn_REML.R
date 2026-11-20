# NMA Pro v8.1 - R netmeta script reproducing the page's analysis
# effect measure MD, estimator REML, zero-cell haldane, correction hksj, level 0.95
# NOTE: netmeta's REML treats the contrasts of a multi-arm study as independent (its REML uses V = seTE^2); the page maximises the exact likelihood WITH the multi-arm covariance (as metafor rma.mv), so net$tau^2 differs from the page; net.page fixes tau2 at the page's value and reproduces its estimates and SEs
# NOTE: the page's "hksj" small-sample correction scales the variance (HKSJ: by max(1, Q/df.Q)) and uses t on df.Q; netmeta 3.7.0 has no such interval, so the CIs / p-values below are the uncorrected ones (tau2, Q, estimates and SEs before the correction are comparable)
library(netmeta)

studies <- data.frame(
  studlab = c("DeFronzo1995", "Lewin2007", "Willms1999", "Davidson2007", "Wolffenbuttel1999", "Kipnes2001", "Kerenyi2004", "Hanefeld2004", "Derosa2004", "Baksi2004", "Rosenstock2008", "Zhu2003", "Yang2003", "Vongthavaravat2002", "Oyama2008", "Costa1997", "Hermansen2007", "Garber2008", "Alex1998", "Johnston1994", "Johnston1998a", "Kim2007", "Johnston1998b", "Gonzalez-Ortiz2004", "Stucci1996", "Moulin2006", "Willms1999", "Willms1999"),
  treat1 = c("metf", "metf", "metf", "rosi", "rosi", "piog", "rosi", "piog", "piog", "rosi", "rosi", "rosi", "rosi", "rosi", "acar", "acar", "sita", "vild", "metf", "migl", "migl", "rosi", "migl", "metf", "benf", "benf", "metf", "acar"),
  treat2 = c("plac", "plac", "acar", "plac", "plac", "plac", "plac", "metf", "rosi", "plac", "plac", "plac", "metf", "sulf", "sulf", "plac", "plac", "plac", "sulf", "plac", "plac", "metf", "plac", "plac", "plac", "plac", "plac", "plac"),
  TE = c(-1.9, -0.82, -0.2, -1.34, -1.1, -1.3, -0.77, 0.16, 0.1, -1.3, -1.09, -1.5, -0.14, -1.2, -0.4, -0.8, -0.57, -0.7, -0.37, -0.74, -1.41, 0, -0.68, -0.4, -0.23, -1.01, -1.2, -1),
  seTE = c(0.1414, 0.0992, 0.3579, 0.1435, 0.1141, 0.1268, 0.1078, 0.0849, 0.1831, 0.1014, 0.2263, 0.1624, 0.2239, 0.1436, 0.1549, 0.1432, 0.1291, 0.1273, 0.1184, 0.1839, 0.2235, 0.2339, 0.2828, 0.4356, 0.3467, 0.1366, 0.3758, 0.4669)
)
p1 <- studies

net <- netmeta(TE, seTE, treat1, treat2, studlab, data = p1, sm = "MD",
               reference.group = "plac", common = FALSE, random = TRUE, method.tau = "REML",
               level = 0.95, level.ma = 0.95)

# the page's analysis: tau2 fixed at its exact-likelihood REML value
net.page <- netmeta(TE, seTE, treat1, treat2, studlab, data = p1, sm = "MD",
               reference.group = "plac", common = FALSE, random = TRUE, tau.preset = sqrt(0.09991745999675816),
               level = 0.95, level.ma = 0.95)
