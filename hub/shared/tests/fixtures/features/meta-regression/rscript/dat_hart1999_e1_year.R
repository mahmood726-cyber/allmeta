# Auto-generated from the browser Meta-Regression app
# Run with: Rscript this_file.R  (requires the 'metafor' package)
library(metafor)

yi <- c(-0.7842099895068162, -0.9358932591196418, -1.5792551607873322, -0.38872831575264044, -1.2019299026961359, -1.140914668358799)
se <- c(0.40465131911125596, 0.4214636152117623, 0.6405126152203485, 0.5270462766947299, 0.43166584730171564, 0.2645751311064591)
x  <- c(1989, 1991, 1990, 1991, 1992, 1993)
labels <- c("dat.hart1999:1", "dat.hart1999:2", "dat.hart1999:3", "dat.hart1999:4", "dat.hart1999:5", "dat.hart1999:6")

# PM tau^2 is solved by uniroot(); tol = 1e-12 matches the page's convergence
# (metafor's default tol, .Machine$double.eps^0.25, can differ from the page at 1e-6).
res <- rma(yi = yi, sei = se, mods = ~ x, method = "PM", test = "adhoc", slab = labels,
           control = list(tol = 1e-12))
print(res)

# Expected browser output (for diff):
# β0 (intercept), β1 (slope), τ², HKSJ q, t-stat on β1, p-value.