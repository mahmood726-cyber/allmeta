# Generates shared/tests/fixtures/upper-tail-grid.csv: dist;x;p_upper;params (R 4.6.0, lower.tail = FALSE).
# Run from shared/tests/fixtures:  Rscript upper-tail-grid.R
P <- c(0.3,0.1,1e-2,1e-3,1e-4,1e-5,1e-6,1e-7,1e-8,1e-9,1e-10,1e-12,1e-14,1e-15,1e-16,1e-17,1e-20,1e-30,1e-50,1e-100,1e-200,1e-300)
out <- list()
add <- function(dist, par, x, p) { x <- as.numeric(sprintf("%.17g", x)); p <- switch(dist, normal=pnorm(x,lower.tail=FALSE), chisq=pchisq(x,par$df,lower.tail=FALSE), t=pt(x,par$df,lower.tail=FALSE), F=pf(x,par$df1,par$df2,lower.tail=FALSE), gamma=pgamma(x,par$shape,lower.tail=FALSE)); out[[length(out)+1]] <<- c(dist, sprintf("%.17g", x), sprintf("%.17g", p), if (length(par)) paste(unlist(par), collapse=",") else "") }
for (p in P) { x <- qnorm(p, lower.tail=FALSE); add("normal", list(), x, pnorm(x, lower.tail=FALSE)) }
for (df in c(1,2,5,12,30,100)) for (p in P) { x <- qchisq(p, df, lower.tail=FALSE); add("chisq", list(df=df), x, pchisq(x, df, lower.tail=FALSE)) }
for (df in c(1,3,10,30,100)) for (p in P) { x <- qt(p, df, lower.tail=FALSE); if (is.finite(x)) add("t", list(df=df), x, pt(x, df, lower.tail=FALSE)) }
for (d in list(c(1,10),c(3,20),c(5,100))) for (p in P) { x <- qf(p, d[1], d[2], lower.tail=FALSE); if (is.finite(x)) add("F", list(df1=d[1],df2=d[2]), x, pf(x, d[1], d[2], lower.tail=FALSE)) }
for (sh in c(0.5,2,10)) for (p in P) { x <- qgamma(p, sh, lower.tail=FALSE); add("gamma", list(shape=sh), x, pgamma(x, sh, lower.tail=FALSE)) }
writeLines(vapply(out, paste, "", collapse=";"), "upper-tail-grid.csv")
cat(length(out), "\n")
