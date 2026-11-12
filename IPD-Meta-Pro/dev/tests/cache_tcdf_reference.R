# Reference for cache_tcdf.test.cjs (R 4.6.0, stats only): pairs of arguments that collide under the old
# toFixed cache keys, and t CDF at both signs.
o <- list(
  chi2 = lapply(list(c(4.4e-5, 1), c(4e-5, 1), c(12.34561, 7), c(12.34564, 7), c(0.00012, 3), c(0.000149, 3)),
                function(a) list(x = a[1], df = a[2], p = pchisq(a[1], a[2]))),
  lgamma = lapply(c(4e-7, 2e-7, 1e-7, 3.0000004, 3.0000001, 150.0000004),
                  function(z) list(z = z, v = lgamma(z))),
  pt = lapply(list(c(-2, 5), c(2, 5), c(-0.5, 3), c(0, 4), c(-3.7, 12), c(1.3, 2.5)),
              function(a) list(t = a[1], df = a[2], p = pt(a[1], a[2])))
)
jsonlite::write_json(o, "cache_tcdf_reference.json", digits = NA, auto_unbox = TRUE, pretty = TRUE)
str(o$chi2[[2]]); str(o$lgamma[[2]]); str(o$pt[[1]])
