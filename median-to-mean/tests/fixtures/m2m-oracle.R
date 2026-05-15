## m2m-oracle.R — authoritative reference for median-to-mean.
## The published closed-form estimators evaluated with R's EXACT qnorm:
##   Wan et al. 2014 (mean+SD, C1/C2/C3), Luo et al. 2018 (refined mean),
##   Shi et al. 2020 (refined SD, C1/C3). This is the unambiguous ground
##   truth — no package needed; R only evaluates the paper equations.
suppressPackageStartupMessages(library(jsonlite))

wan <- function(s, n, a, q1, m, q3, b) {
  if (s == "C1") {
    mean <- (a + 2*q1 + 2*m + 2*q3 + b) / 8
    xi1 <- 2 * qnorm((n - 0.375) / (n + 0.25))
    xi2 <- 2 * qnorm((0.75*n - 0.125) / (n + 0.25))
    sd <- 0.5 * ((b - a)/xi1 + (q3 - q1)/xi2)
  } else if (s == "C2") {
    mean <- (a + 2*m + b) / 4
    xi <- 2 * qnorm((n - 0.375) / (n + 0.25))
    sd <- (b - a) / xi
  } else {                                  # C3
    mean <- (q1 + m + q3) / 3
    xi <- 2 * qnorm((0.75*n - 0.125) / (n + 0.25))
    sd <- (q3 - q1) / xi
  }
  list(mean = mean, sd = sd)
}
luo_mean <- function(s, n, a, q1, m, q3, b) {
  if (s == "C1") {
    w1 <- 2.2 / (2.2 + n^0.75); w2 <- 0.7 - 0.72 / n^0.55
    w1*((a+b)/2) + w2*((q1+q3)/2) + (1 - w1 - w2)*m
  } else if (s == "C2") {
    w <- 4 / (4 + n^0.75); w*((a+b)/2) + (1 - w)*m
  } else {
    w <- 0.7 + 0.39 / n; w*((q1+q3)/2) + (1 - w)*m
  }
}
shi_sd <- function(s, n, a, q1, m, q3, b) {
  if (s == "C1") {
    xi1 <- 2 * qnorm((n - 0.375) / (n + 0.25))
    xi2 <- 2 * qnorm((0.75*n - 0.125) / (n + 0.25))
    th <- 1 / (1 + 0.07 * n^0.6)
    th*(b - a)/xi1 + (1 - th)*(q3 - q1)/xi2
  } else if (s == "C3") {
    xi <- 2 * qnorm((0.75*n - 0.125) / (n + 0.25)); (q3 - q1)/xi
  } else NA
}

cases <- list(
  list(id="C1_n50", s="C1", n=50, a=2,  q1=4,  m=5,   q3=7,  b=10),
  list(id="C1_n20", s="C1", n=20, a=1,  q1=3,  m=4.8, q3=6,  b=9),
  list(id="C2_n40", s="C2", n=40, a=2,  q1=NA, m=5,   q3=NA, b=11),
  list(id="C2_n15", s="C2", n=15, a=1,  q1=NA, m=4,   q3=NA, b=8),
  list(id="C3_n60", s="C3", n=60, a=NA, q1=3,  m=5,   q3=8,  b=NA),
  list(id="C3_n18", s="C3", n=18, a=NA, q1=2.5,m=4.8, q3=7.2,b=NA))

out <- lapply(cases, function(c) {
  w <- wan(c$s, c$n, c$a, c$q1, c$m, c$q3, c$b)
  list(id=c$id, scenario=c$s, n=c$n, a=c$a, q1=c$q1, m=c$m, q3=c$q3, b=c$b,
       wan_mean=round(w$mean,10), wan_sd=round(w$sd,10),
       luo_mean=round(luo_mean(c$s,c$n,c$a,c$q1,c$m,c$q3,c$b),10),
       shi_sd=round(shi_sd(c$s,c$n,c$a,c$q1,c$m,c$q3,c$b),10))
})
writeLines(toJSON(out, auto_unbox=TRUE, digits=12, na="null"),
  "C:/Projects/allmeta/median-to-mean/tests/fixtures/m2m-oracle.json")
cat("wrote m2m-oracle.json\n"); print(out[[1]]); print(out[[5]])
