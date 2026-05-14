suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))

args <- commandArgs(trailingOnly = TRUE)
csv  <- if (length(args) >= 1) args[1] else stop("Usage: pb-tiny.R <csv>")

d <- read.csv(csv)

# ---- pool (REML) ----
rma_fit <- rma.uni(yi = d$yi, sei = d$sei, method = "REML")

# ---- Egger: regtest(model="lm", predictor="sei") ----
egger <- regtest(rma_fit, model = "lm", predictor = "sei", ret.fit = TRUE)
# metafor 4.x: use coef() + summary()$coefficients — $b / $se are NULL
egger_intercept    <- unname(coef(egger$fit)[1])
egger_intercept_se <- unname(summary(egger$fit)$coefficients[1, "Std. Error"])

# ---- Begg: ranktest() ----
begg     <- ranktest(rma_fit)
begg_tau <- unname(begg$tau)
begg_p   <- unname(begg$pval)

# ---- Trim-and-fill ----
tf      <- trimfill(rma_fit)
tf_k0   <- tf$k0                        # imputed studies added
tf_est  <- unname(coef(tf))             # adjusted pooled estimate
tf_se   <- unname(tf$se)                # SE of adjusted estimate

cat(toJSON(list(
  k             = rma_fit$k,
  egger_zval    = egger$zval,
  egger_pval    = egger$pval,
  egger_b0      = egger_intercept,
  egger_se_b0   = egger_intercept_se,
  begg_tau      = begg_tau,
  begg_pval     = begg_p,
  tf_k0         = tf_k0,
  tf_est        = tf_est,
  tf_se         = tf_se
), auto_unbox = TRUE, digits = 12))
