dfs <- c(1,2,3,5,12,30,50,100,200,500,1000,2000,5000,10000,50000,100000)
out <- list()
for (df in dfs) {
  xs <- c(df*c(0.01,0.1,0.5,0.8,0.9,0.95,0.99,1,1.01,1.05,1.1,1.2,1.5,2,3), df+2-1e-7, df+2, df+2+1e-7, df+2-1e-3, df+2+1e-3, df+2 - sqrt(df), df+2+sqrt(df), df+5*sqrt(2*df))
  xs <- xs[xs > 0]
  for (x in xs) out[[length(out)+1]] <- c(df, x, pchisq(x, df, lower.tail=FALSE))
}
m <- do.call(rbind, out)
m <- m[m[,3] > 1e-300, ]
cat("[", paste(sprintf("[%.17g,%.17g,%.17g]", m[,1], m[,2], m[,3]), collapse=",
"), "]")
