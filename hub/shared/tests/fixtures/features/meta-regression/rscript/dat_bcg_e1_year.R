# Auto-generated from the browser Meta-Regression app
# Run with: Rscript this_file.R  (requires the 'metafor' package)
library(metafor)

yi <- c(-0.8893113339202054, -1.5853886572014306, -1.3480731482996933, -1.4415511900213054, -0.21754732221129558, -0.786115585818864, -1.6208982235983918, 0.011952333523840508, -0.4694176487381494, -1.3713448034727844, -0.3393588283383906, 0.44591340057137874, -0.017313948216879815)
se <- c(0.5706003548929507, 0.44111350171825825, 0.644490469571091, 0.14145681992130169, 0.2262966463950159, 0.08310005087789513, 0.4722470196542432, 0.06294107798423641, 0.2375588568402554, 0.27023100046632126, 0.11141011610962319, 0.7297299810204818, 0.26721650339001574)
x  <- c(1948, 1949, 1960, 1977, 1973, 1953, 1973, 1980, 1968, 1961, 1974, 1969, 1976)
labels <- c("dat.bcg:1", "dat.bcg:2", "dat.bcg:3", "dat.bcg:4", "dat.bcg:5", "dat.bcg:6", "dat.bcg:7", "dat.bcg:8", "dat.bcg:9", "dat.bcg:10", "dat.bcg:11", "dat.bcg:12", "dat.bcg:13")

# PM tau^2 is solved by uniroot(); tol = 1e-12 matches the page's convergence
# (metafor's default tol, .Machine$double.eps^0.25, can differ from the page at 1e-6).
res <- rma(yi = yi, sei = se, mods = ~ x, method = "PM", test = "adhoc", slab = labels,
           control = list(tol = 1e-12))
print(res)

# Expected browser output (for diff):
# β0 (intercept), β1 (slope), τ², HKSJ q, t-stat on β1, p-value.