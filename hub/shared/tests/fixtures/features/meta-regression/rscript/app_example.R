# Auto-generated from the browser Meta-Regression app
# Run with: Rscript this_file.R  (requires the 'metafor' package)
library(metafor)

yi <- c(-0.28, -0.22, -0.15, -0.1, 0.04, -0.05, -0.32, -0.2)
se <- c(0.12, 0.09, 0.11, 0.13, 0.15, 0.14, 0.11, 0.1)
x  <- c(32, 35, 42, 48, 55, 51, 29, 38)
labels <- c("Trial A", "Trial B", "Trial C", "Trial D", "Trial E", "Trial F", "Trial G", "Trial H")

# PM tau^2 is solved by uniroot(); tol = 1e-12 matches the page's convergence
# (metafor's default tol, .Machine$double.eps^0.25, can differ from the page at 1e-6).
res <- rma(yi = yi, sei = se, mods = ~ x, method = "PM", test = "adhoc", slab = labels,
           control = list(tol = 1e-12))
print(res)

# Expected browser output (for diff):
# β0 (intercept), β1 (slope), τ², HKSJ q, t-stat on β1, p-value.