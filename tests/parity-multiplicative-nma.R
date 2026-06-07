# Parity oracle for shared/multiplicative-nma.js — run on an R-enabled machine
# with netmeta installed. The two-arm contrast-based common-effect NMA is
# ordinary WLS on the treatment-incidence design, so netmeta's common-effect
# model is the exact oracle; the multiplicative SEs are seTE.common * sqrt(phi),
# phi = Q / df.Q.  Reproduces the numbers asserted (vs an independent Python WLS
# oracle) in tests/test_multiplicative_nma.py on the same triangle network.
#
#   Rscript tests/parity-multiplicative-nma.R
#
# Expected (triangle A/B/C, two-arm contrasts):
#   TE.common[B vs A], TE.common[C vs A], Q, df.Q, phi, and the multiplicative SEs.

suppressMessages(library(netmeta))

# The triangle network used by the JS test (effect = trtB vs trtA).
d <- data.frame(
  treat1 = c("A", "A", "B"),
  treat2 = c("B", "C", "C"),
  TE     = c(0.50, 0.80, 0.40),
  seTE   = c(0.20, 0.25, 0.30),
  studlab = c("s1", "s2", "s3"),
  stringsAsFactors = FALSE
)

nm <- netmeta(TE, seTE, treat1, treat2, studlab, data = d,
              reference.group = "A", common = TRUE, random = TRUE, sm = "MD")

Q  <- nm$Q
df <- nm$df.Q
phi <- Q / df

# Relative effects vs reference A (common-effect column) and the √φ inflation.
te_common  <- nm$TE.common[, "A"]      # column = vs reference A
se_common  <- nm$seTE.common[, "A"]
se_mult    <- se_common * sqrt(phi)

cat(sprintf("Q        = %.10f\n", Q))
cat(sprintf("df.Q     = %d\n", df))
cat(sprintf("phi      = %.10f\n", phi))
for (t in c("B", "C")) {
  cat(sprintf("%s vs A : TE.common = %.10f  seFE = %.10f  seMult = %.10f\n",
              t, te_common[t], se_common[t], se_mult[t]))
}
cat(sprintf("tau2(PM/REML, additive) = %.10f\n", nm$tau2))
