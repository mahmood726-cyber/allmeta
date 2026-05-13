suppressPackageStartupMessages(library(mada))
suppressPackageStartupMessages(library(jsonlite))

# NOTE: mada::reitsma parameterises on logit(FPR), NOT logit(Spec).
# mu1 = mean logit(Sensitivity), mu2 = mean logit(FPR = 1-Specificity).
# This is the "Reitsma 2005 / Chu & Cole 2006" bivariate DTA model.
# When computing Spearman rho in the app, the comparison uses logit(Se) vs
# logit(FPR) — do NOT compute on logit(Spec) (lessons_webr_dta.md).
#
# The dta-sroc app implements MOSES SROC (Moses et al., Stat Med 1993):
#   D = logit(Se) - logit(FPR);  S = logit(Se) + logit(FPR)
#   Unweighted OLS: D = alpha + beta * S
# This section computes both Moses OLS (primary) and mada reitsma (secondary).

args <- commandArgs(trailingOnly = TRUE)
csv_path <- if (length(args) >= 1) args[1] else stop("supply CSV path as argument")
d <- read.csv(csv_path)

# ---- Moses SROC (primary) -----------------------------------------------
# Continuity correction: +0.5 to all cells of a row ONLY when any cell is 0.
# (advanced-stats.md: conditional correction only)
moses_rows <- d
has_zero <- apply(d[,c("TP","FP","FN","TN")], 1, function(row) any(row == 0))
moses_rows[has_zero, c("TP","FP","FN","TN")] <- moses_rows[has_zero, c("TP","FP","FN","TN")] + 0.5

se_vec  <- moses_rows$TP / (moses_rows$TP + moses_rows$FN)
fpr_vec <- moses_rows$FP / (moses_rows$FP + moses_rows$TN)
logitSe  <- log(se_vec  / (1 - se_vec))
logitFPR <- log(fpr_vec / (1 - fpr_vec))
D <- logitSe - logitFPR
S <- logitSe + logitFPR

ols_fit <- lm(D ~ S)
moses_alpha <- as.numeric(coef(ols_fit)[1])
moses_beta  <- as.numeric(coef(ols_fit)[2])

# ---- mada reitsma (secondary — documentary) -----------------------------
r <- reitsma(d)
mu1     <- as.numeric(r$coefficients[1])  # mean logit(Se)
mu2     <- as.numeric(r$coefficients[2])  # mean logit(FPR)
tau1_sq <- r$Psi[1,1]
tau2_sq <- r$Psi[2,2]
rho     <- r$Psi[1,2] / sqrt(r$Psi[1,1] * r$Psi[2,2])
k       <- nrow(d)

result <- list(
  moses = list(
    alpha = moses_alpha,
    beta  = moses_beta
  ),
  reitsma = list(
    mu1     = mu1,
    mu2     = mu2,
    tau1_sq = tau1_sq,
    tau2_sq = tau2_sq,
    rho     = rho,
    k       = k
  )
)

cat(toJSON(result, auto_unbox = TRUE, digits = 12))
