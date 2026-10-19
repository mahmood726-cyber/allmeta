# Auto-generated from the browser Meta-Regression app
# Run with: Rscript this_file.R  (requires the 'metafor' package)
library(metafor)

yi <- c(0.30120292079127586, 0.38218899330617917, 0.31630807101725006, -0.04043720011356849, 0.07420885448992089)
se <- c(0.062156882459646366, 0.05692877155970729, 0.07348054482455592, 0.05240056409033244, 0.06366589335697824)
x  <- c(218, 232, 156, 382, 259)
labels <- c("dat.aloe2013:1", "dat.aloe2013:2", "dat.aloe2013:3", "dat.aloe2013:4", "dat.aloe2013:5")

res <- rma(yi = yi, sei = se, mods = ~ x, method = "PM", test = "adhoc", slab = labels)
print(res)

# Expected browser output (for diff):
# β0 (intercept), β1 (slope), τ², HKSJ q, t-stat on β1, p-value.