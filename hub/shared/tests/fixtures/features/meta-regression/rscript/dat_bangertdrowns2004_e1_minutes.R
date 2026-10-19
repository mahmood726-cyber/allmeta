# Auto-generated from the browser Meta-Regression app
# Run with: Rscript this_file.R  (requires the 'metafor' package)
library(metafor)

yi <- c(-0.04, 0.23, 0.03, 0.12, 0.52, 0.54, 0.2, -0.16, 0.42, 0.6, 0.58, 0.09, -0.13, 0.18, 0.27, -0.02, 0.33, 0.84, -0.44, 0.49, 0.58, 0.63, 0.04, 0.25)
se <- c(0.13784048752090222, 0.14832396974191325, 0.09486832980505137, 0.22803508501982758, 0.19235384061671346, 0.28809720581775866, 0.30166206257996714, 0.408656334834051, 0.22803508501982758, 0.30166206257996714, 0.2701851217221259, 0.31622776601683794, 0.19235384061671346, 0.26267851073127396, 0.1341640786499874, 0.09486832980505137, 0.23021728866442676, 0.3346640106136302, 0.4527692569068708, 0.19748417658131498, 0.2588435821108957, 0.40987803063838396, 0.12649110640673517, 0.2683281572999748)
x  <- c(10, 10, 20, 10, 6, 4, 10, 10, 8, 8, 10, 15, 35, 20, 15, 15, 8, 10, 55, 15, 5, 3, 15, 10)
labels <- c("dat.bangertdrowns2004:4", "dat.bangertdrowns2004:5", "dat.bangertdrowns2004:6", "dat.bangertdrowns2004:10", "dat.bangertdrowns2004:13", "dat.bangertdrowns2004:14", "dat.bangertdrowns2004:16", "dat.bangertdrowns2004:17", "dat.bangertdrowns2004:18", "dat.bangertdrowns2004:19", "dat.bangertdrowns2004:21", "dat.bangertdrowns2004:23", "dat.bangertdrowns2004:26", "dat.bangertdrowns2004:27", "dat.bangertdrowns2004:28", "dat.bangertdrowns2004:29", "dat.bangertdrowns2004:30", "dat.bangertdrowns2004:32", "dat.bangertdrowns2004:37", "dat.bangertdrowns2004:40", "dat.bangertdrowns2004:42", "dat.bangertdrowns2004:44", "dat.bangertdrowns2004:45", "dat.bangertdrowns2004:48")

# PM tau^2 is solved by uniroot(); tol = 1e-12 matches the page's convergence
# (metafor's default tol, .Machine$double.eps^0.25, can differ from the page at 1e-6).
res <- rma(yi = yi, sei = se, mods = ~ x, method = "PM", test = "adhoc", slab = labels,
           control = list(tol = 1e-12))
print(res)

# Expected browser output (for diff):
# β0 (intercept), β1 (slope), τ², HKSJ q, t-stat on β1, p-value.