suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
d <- read.csv(commandArgs(trailingOnly = TRUE)[1])
r <- rma.uni(yi = d$yi, sei = d$sei, method = "REML")
pet   <- regtest(r, model = "lm", predictor = "sei", ret.fit = TRUE)
peese <- regtest(r, model = "lm", predictor = "vi",  ret.fit = TRUE)
# metafor 4.x: ret.fit returns an lm object; use coef() + summary()$coefficients
# pet$fit$b and pet$fit$se are NULL in metafor 4.x — use lm accessors instead.
pet_b0      <- unname(coef(pet$fit)[1])
pet_se_b0   <- unname(summary(pet$fit)$coefficients[1, "Std. Error"])
peese_b0    <- unname(coef(peese$fit)[1])
peese_se_b0 <- unname(summary(peese$fit)$coefficients[1, "Std. Error"])
cat(toJSON(list(
  pet_zval    = pet$zval,
  pet_pval    = pet$pval,
  pet_b0      = pet_b0,
  pet_se_b0   = pet_se_b0,
  peese_b0    = peese_b0,
  peese_se_b0 = peese_se_b0,
  pool_b      = r$b[1,1],
  pool_se     = r$se,
  k           = r$k
), auto_unbox = TRUE, digits = 12))
