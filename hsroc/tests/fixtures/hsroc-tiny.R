suppressPackageStartupMessages(library(mada))
suppressPackageStartupMessages(library(jsonlite))

# NOTE: mada::reitsma parameterises on logit(FPR), NOT logit(Spec).
#   mu1 = mean logit(Sensitivity)
#   mu2 = mean logit(FPR = 1 - Specificity)
#   Psi[1,1] = tau1_sq  (variance of logit(Se) random effect)
#   Psi[2,2] = tau2_sq  (variance of logit(FPR) random effect)
#   rho = Psi[1,2] / sqrt(Psi[1,1]*Psi[2,2])
#
# The hsroc app uses logit(FPR) throughout (not logit(1-Sp)):
#   logitFPR = Math.log(fpr/(1-fpr))  where fpr = 1 - sp
# This matches mada's parameterisation, so no sign-flip needed.

args <- commandArgs(trailingOnly = TRUE)
csv_path <- if (length(args) >= 1) args[1] else stop("supply CSV path as argument")
d <- read.csv(csv_path)

r <- reitsma(d)

mu1     <- as.numeric(r$coefficients[1])   # mean logit(Se)
mu2     <- as.numeric(r$coefficients[2])   # mean logit(FPR)
tau1_sq <- r$Psi[1, 1]
tau2_sq <- r$Psi[2, 2]
rho     <- r$Psi[1, 2] / sqrt(r$Psi[1, 1] * r$Psi[2, 2])
k       <- nrow(d)

result <- list(
  mu1     = mu1,
  mu2     = mu2,
  tau1_sq = tau1_sq,
  tau2_sq = tau2_sq,
  rho     = rho,
  k       = k
)

cat(toJSON(result, auto_unbox = TRUE, digits = 12))
