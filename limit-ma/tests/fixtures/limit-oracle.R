## limit-oracle.R — deterministic R-parity oracle for the JS Rücker (2011)
## limit meta-analysis engine (metasens::limitmeta, method.adjust='beta0').
suppressPackageStartupMessages({library(metasens); library(meta); library(jsonlite)})

sink("C:/Projects/allmeta/limit-ma/tests/fixtures/_radialreg_src.txt")
cat("===== metasens:::radialregression =====\n")
print(metasens:::radialregression)
sink()

d   <- read.csv("C:/Projects/allmeta/limit-ma/tests/fixtures/limit-tiny.csv")
m   <- metagen(TE = d$yi, seTE = d$sei, method.tau = "DL")
lm1 <- limitmeta(m)

oracle <- list(
  fixture     = "limit-tiny",
  k           = lm1$k,
  TE_random   = as.numeric(lm1$TE.random),
  seTE_random = as.numeric(lm1$seTE.random),
  tau2        = as.numeric(lm1$tau^2),
  Q           = as.numeric(lm1$Q),
  Q_small     = as.numeric(lm1$Q.small),
  Q_resid     = as.numeric(lm1$Q.resid),
  G_squared   = as.numeric(lm1$G.squared),
  alpha_r     = as.numeric(lm1$alpha.r),
  beta_r      = as.numeric(lm1$beta.r),
  TE_adjust   = as.numeric(lm1$TE.adjust),
  seTE_adjust = as.numeric(lm1$seTE.adjust),
  TE_limit    = as.numeric(lm1$TE.limit),
  seTE_limit  = as.numeric(lm1$seTE.limit)
)
writeLines(toJSON(oracle, auto_unbox = TRUE, digits = 14),
           "C:/Projects/allmeta/limit-ma/tests/fixtures/limit-oracle.json")
cat("wrote limit-oracle.json\n"); print(oracle[c("TE_adjust","seTE_adjust",
  "alpha_r","beta_r","tau2","Q","Q_small","Q_resid","G_squared")])
