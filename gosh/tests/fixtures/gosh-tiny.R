## gosh-tiny.R — R-parity for gosh all-subset meta-analysis
##
## The JS engine (gosh/index.html) computes FE (inverse-variance) or DL RE
## pooling for every non-empty subset of k=5 studies (2^5 - 1 = 31 subsets;
## subsets of size < 2 are skipped, leaving 26 subsets).
##
## This script uses metafor::gosh(rma.uni(...)) to produce the canonical
## reference values for the same fixture, then summarises:
##   - n_subsets    : number of subsets computed (k >= 2 only)
##   - median_est   : median pooled estimate across all subsets
##   - q25_est      : 25th percentile of pooled estimates
##   - q75_est      : 75th percentile of pooled estimates
##   - min_est      : minimum pooled estimate across all subsets
##   - max_est      : maximum pooled estimate across all subsets
##   - median_i2    : median I² across all subsets
##   - full_k_est   : pooled estimate from the full k=5 model
##   - full_k_i2    : I² from the full k=5 model
##
## Key values (2026-05-14, R 4.5.2, metafor 4.x):
##   GOSH with FE (method="FE"), k=5 → subsets of size 2-5 = 26 subsets.
##
## Usage (called by test_against_metafor.py):
##   Rscript --vanilla gosh-tiny.R gosh-tiny.csv [FE|DL]

suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))

args <- commandArgs(trailingOnly = TRUE)
csv_path <- if (length(args) >= 1) args[1] else stop("supply CSV path as argument")
method   <- if (length(args) >= 2) args[2] else "FE"

d <- read.csv(csv_path)
# columns: study, yi, vi

# Fit base model
m <- rma.uni(yi = d$yi, vi = d$vi, method = method, data = d)

# Full GOSH enumeration — all 2^k - 1 non-empty subsets
# For k=5 that is 31 total; metafor::gosh() skips k_i < 2, leaving 26 subsets.
g <- gosh(m, progbar = FALSE)

# The gosh object has a $res data.frame with columns:
#   k, QE, I2, H2, tau2 (for RE), estimate
subsets_df <- as.data.frame(g$res)

# Filter to subsets with k >= 2 (metafor default)
subsets_df <- subsets_df[subsets_df$k >= 2, ]

n_subsets  <- nrow(subsets_df)
est_vec    <- subsets_df$estimate
i2_vec     <- subsets_df$I2

q25  <- as.numeric(quantile(est_vec, 0.25))
q75  <- as.numeric(quantile(est_vec, 0.75))
med  <- as.numeric(median(est_vec))
mn   <- as.numeric(min(est_vec))
mx   <- as.numeric(max(est_vec))
medi2 <- as.numeric(median(i2_vec))

# Full-k model stats
full_k_est <- as.numeric(coef(m))
full_k_i2  <- as.numeric(m$I2)

result <- list(
  method     = method,
  k          = as.integer(nrow(d)),
  n_subsets  = as.integer(n_subsets),
  median_est = med,
  q25_est    = q25,
  q75_est    = q75,
  min_est    = mn,
  max_est    = mx,
  median_i2  = medi2,
  full_k_est = full_k_est,
  full_k_i2  = full_k_i2
)

cat(toJSON(result, auto_unbox = TRUE, digits = 12))
cat("\n")
