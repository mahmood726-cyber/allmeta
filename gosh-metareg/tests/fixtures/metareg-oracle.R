## metareg-oracle.R — authoritative reference for gosh-metareg's wls().
## After the fix the app implements standard meta-regression DL: tau2 from
## the MODERATED residual Q with the trace denominator (Cochrane Handbook
## §10.11 / metafor method="DL"). Target = metafor::rma(mods=~mod,
## method="DL"). Two fixtures: residual tau2==0 and residual tau2>0.
suppressPackageStartupMessages({library(metafor); library(jsonlite)})

mk <- function(te, se, mod) {
  d  <- data.frame(te = te, se = se, mod = mod)
  dl <- rma(yi = te, sei = se, mods = ~ mod, data = d, method = "DL")
  list(studies = lapply(seq_len(nrow(d)), function(i)
         list(te = d$te[i], se = d$se[i], mod = d$mod[i])),
       tau2  = as.numeric(dl$tau2),
       b0    = as.numeric(dl$beta[1]),
       b1    = as.numeric(dl$beta[2]),
       se_b1 = as.numeric(dl$se[2]),
       I2    = as.numeric(dl$I2))
}

oracle <- list(
  # Tight linear trend -> residual heterogeneity ~ 0 -> DL tau2 = 0.
  lowResid = mk(c(0.10,0.18,0.26,0.33,0.42,0.49,0.57),
                c(0.08,0.09,0.10,0.08,0.11,0.09,0.10),
                c(10,20,30,40,50,60,70)),
  # Real scatter around the trend -> residual DL tau2 > 0.
  heteroResid = mk(c(0.10,0.30,0.22,0.50,0.35,0.62,0.55),
                   c(0.08,0.09,0.10,0.08,0.11,0.09,0.10),
                   c(10,20,30,40,50,60,70)))
writeLines(toJSON(oracle, auto_unbox = TRUE, digits = 12),
  "C:/Projects/allmeta/gosh-metareg/tests/fixtures/metareg-oracle.json")
cat("wrote metareg-oracle.json\n")
cat("lowResid:    tau2=", oracle$lowResid$tau2, " b1=", oracle$lowResid$b1,
    " se=", oracle$lowResid$se_b1, "\n")
cat("heteroResid: tau2=", oracle$heteroResid$tau2, " b1=", oracle$heteroResid$b1,
    " se=", oracle$heteroResid$se_b1, " I2=", oracle$heteroResid$I2, "\n")
