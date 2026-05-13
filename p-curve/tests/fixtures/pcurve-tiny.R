suppressPackageStartupMessages(library(jsonlite))
d <- read.csv(commandArgs(trailingOnly = TRUE)[1])
# Keep only significant p-values (0 < p < 0.05)
d <- d[d$p > 0 & d$p < 0.05, ]
# pp = p / 0.05: under the null (no true effect), pp ~ U(0,1)
pp <- d$p / 0.05
# Right-skew test: Fisher's combined method
# Under H0 (pp ~ U(0,1)), -2*sum(log(pp)) ~ chi-squared(2k)
# Under H1 (true effect), pp concentrates near 0 -> large T -> small p_skew
fisher_chisq <- -2 * sum(log(pp))
df_chisq <- 2 * nrow(d)
fisher_p <- pchisq(fisher_chisq, df = df_chisq, lower.tail = FALSE)
# Flatness test: binomial proportion of pp <= 0.5
prop_low <- sum(pp <= 0.5) / nrow(d)
z_flat <- (prop_low - 0.5) / sqrt(0.25 / nrow(d))
p_flat <- 2 * pnorm(-abs(z_flat))
cat(toJSON(list(
  fisher_chisq = fisher_chisq,
  fisher_df    = df_chisq,
  fisher_p     = fisher_p,
  prop_low     = prop_low,
  z_flat       = z_flat,
  p_flat       = p_flat,
  k            = nrow(d)
), auto_unbox = TRUE, digits = 12))
