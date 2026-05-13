suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
m1=52.5; sd1=8.2; n1=30; m2=47.1; sd2=7.9; n2=30
df <- n1 + n2 - 2
Sp <- sqrt(((n1-1)*sd1^2 + (n2-1)*sd2^2) / df)
d  <- (m1 - m2) / Sp
J  <- 1 - 3/(4*df - 1)
g  <- d * J
vi_a <- (n1+n2)/(n1*n2) + g^2/(2*(n1+n2))
vi_b <- (n1+n2)/(n1*n2) + g^2/(2*df)
esc <- escalc("SMD", m1i=m1, sd1i=sd1, n1i=n1, m2i=m2, sd2i=sd2, n2i=n2)
cat(toJSON(list(d=d, g=g, vi_a=vi_a, vi_b=vi_b, esc_yi=as.numeric(esc$yi), esc_vi=as.numeric(esc$vi)), auto_unbox=TRUE, digits=14))
