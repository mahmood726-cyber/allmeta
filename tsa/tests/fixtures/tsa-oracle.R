## tsa-oracle.R — authoritative reference for the TSA app.
## The documented formulas (advanced-stats.md) evaluated with R's EXACT
## qnorm: required information size RIS = (z_{1-a/2}+z_{1-b})^2 / delta^2 * D;
## cumulative fixed-effect inverse-variance Z; O'Brien-Fleming monitoring
## boundary: Lan-DeMets O'Brien-Fleming-type alpha-spending (total two-sided spending a(t) = 2 - 2 Phi(z_{1-a/2}/sqrt t)),
## solved exactly with mvtnorm (Miwa 1024 steps, uniroot tol 1e-12). Run from the repository root.
suppressPackageStartupMessages({ library(jsonlite); library(mvtnorm) })

alpha <- 0.05; power <- 0.80; delta <- 0.30; D <- 1.2
za <- qnorm(1 - alpha/2); zb <- qnorm(power)
ris <- (za + zb)^2 / delta^2 * D

studies <- data.frame(
  label = paste0("S", 1:5),
  est = c(-0.20, -0.35, -0.10, -0.28, -0.15),
  se  = c(0.18, 0.22, 0.15, 0.20, 0.12))
v <- studies$se^2
sw <- cumsum(1/v)
swy <- cumsum(studies$est / v)
cumMu <- swy / sw
cumSE <- sqrt(1/sw)
cumZ  <- cumMu / cumSE

tGrid <- c(0.10, 0.25, 0.50, 0.75, 1.00)
inc <- diff(c(0, 2 * (1 - pnorm(za / sqrt(tGrid))))) / 2
S <- outer(tGrid, tGrid, function(a, b) sqrt(pmin(a, b) / pmax(a, b)))
ob <- numeric(length(tGrid)); ob[1] <- qnorm(inc[1], lower.tail = FALSE)
for (k in 2:length(tGrid)) ob[k] <- uniroot(function(x) as.numeric(pmvnorm(lower = c(-ob[1:(k - 1)], x),
  upper = c(ob[1:(k - 1)], Inf), sigma = S[1:k, 1:k], algorithm = Miwa(steps = 1024))) - inc[k], c(0, 12), tol = 1e-12)$root

oracle <- list(
  alpha=alpha, power=power, delta=delta, D=D,
  za=round(za,10), zb=round(zb,10), ris=round(ris,8),
  tGrid=tGrid, ob=round(ob,10),
  studies=lapply(seq_len(nrow(studies)), function(i)
    list(label=studies$label[i], est=studies$est[i], se=studies$se[i])),
  cumulative=lapply(seq_len(nrow(studies)), function(i)
    list(cumInfo=round(sw[i],10), cumMu=round(cumMu[i],10),
         cumSE=round(cumSE[i],10), z=round(cumZ[i],10))))
writeLines(toJSON(oracle, auto_unbox=TRUE, digits=12),
  "tsa/tests/fixtures/tsa-oracle.json")
cat("wrote tsa-oracle.json\n")
cat("za=",za," zb=",zb," ris=",ris,"\n"); print(round(cumZ,6)); print(round(ob,6))
