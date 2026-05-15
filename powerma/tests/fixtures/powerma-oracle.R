## powerma-oracle.R — authoritative reference for the PowerMA/RIS app.
## Documented formulas evaluated with R's EXACT qnorm:
##   continuous: nPerArm = 2*(z_{1-a/2}+z_{1-b})^2 / (MD/SD)^2
##   binary:     d = |2asin(sqrt p1) - 2asin(sqrt p0)|,
##               nPerArm = (z_{1-a/2}+z_{1-b})^2 / d^2 * (1 + 1/ratio)
##   totalN = nPerArm*(1+ratio); eventsTarget = round(nPerArm*p0 +
##            nPerArm*ratio*p1)  [binary].
suppressPackageStartupMessages(library(jsonlite))

ss <- function(o) {
  za <- qnorm(1 - o$alpha/2); zb <- qnorm(o$power)
  if (o$outcome == "binary") {
    p1 <- o$p0 * (1 - o$rrr)
    d  <- abs(2*asin(sqrt(p1)) - 2*asin(sqrt(o$p0)))
    nPerArm <- (za + zb)^2 / d^2 * (1 + 1/o$ratio)
    totalN  <- nPerArm * (1 + o$ratio)
    ev <- round(nPerArm*o$p0 + nPerArm*o$ratio*p1)
  } else {
    d <- o$md / o$sdC
    nPerArm <- 2 * (za + zb)^2 / d^2
    totalN  <- nPerArm * (1 + o$ratio)
    ev <- NA
  }
  list(za=round(za,10), zb=round(zb,10),
       nPerArmRaw=round(nPerArm,8), totalNRaw=round(totalN,8),
       nPerArm=ceiling(nPerArm), totalN=ceiling(totalN),
       eventsTarget=if (is.na(ev)) NA else ev)
}

cases <- list(
  list(id="cont_a05_p80", outcome="continuous", alpha=0.05, power=0.80, ratio=1, md=0.5, sdC=1.0),
  list(id="cont_a01_p90", outcome="continuous", alpha=0.01, power=0.90, ratio=1, md=5,   sdC=10),
  list(id="bin_a05_p80",  outcome="binary", alpha=0.05, power=0.80, ratio=1, p0=0.20, rrr=0.25),
  list(id="bin_a05_p90_r2",outcome="binary",alpha=0.05, power=0.90, ratio=2, p0=0.30, rrr=0.20))

out <- lapply(cases, function(c) c(list(id=c$id, params=c), ss(c)))
writeLines(toJSON(out, auto_unbox=TRUE, digits=12, na="null"),
  "C:/Projects/allmeta/powerma/tests/fixtures/powerma-oracle.json")
cat("wrote powerma-oracle.json\n"); print(out[[1]]); print(out[[3]])
