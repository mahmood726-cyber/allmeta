suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))

d <- read.csv(commandArgs(trailingOnly = TRUE)[1])
# Compute 2x2 cell counts: ai=e1, bi=n1-e1, ci=e2, di=n2-e2
ai <- d$e1; bi <- d$n1 - d$e1; ci <- d$e2; di <- d$n2 - d$e2

# Peto OR via rma.peto
rp <- rma.peto(ai = ai, bi = bi, ci = ci, di = di)

# Mantel-Haenszel OR via rma.mh (measure="OR")
rmh <- rma.mh(ai = ai, bi = bi, ci = ci, di = di, measure = "OR")

cat(toJSON(list(
  peto_b    = as.numeric(rp$b),
  peto_se   = as.numeric(rp$se),
  peto_ci_lb = as.numeric(rp$ci.lb),
  peto_ci_ub = as.numeric(rp$ci.ub),
  peto_Q    = as.numeric(rp$QE),
  peto_QEp  = as.numeric(rp$QEp),
  peto_k    = as.integer(rp$k),
  mh_b      = as.numeric(rmh$b),
  mh_se     = as.numeric(rmh$se),
  mh_ci_lb  = as.numeric(rmh$ci.lb),
  mh_ci_ub  = as.numeric(rmh$ci.ub),
  mh_Q      = as.numeric(rmh$QE),
  mh_QEp    = as.numeric(rmh$QEp),
  mh_k      = as.integer(rmh$k)
), auto_unbox = TRUE, digits = 12))
