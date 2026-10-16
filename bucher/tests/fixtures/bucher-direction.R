# Independent Bucher A-vs-B via common comparator C reference.
# Usage: Rscript --vanilla bucher-direction.R bucher-tiny.csv
# Base R only. Explicit estimand: d(A,B) = d(A,C) - d(B,C).
d <- read.csv(commandArgs(trailingOnly=TRUE)[1], stringsAsFactors=FALSE)
required <- c("study","treat1","treat2","TE","seTE")
stopifnot(all(required %in% names(d)), all(is.finite(d$TE)),
          all(is.finite(d$seTE)), all(d$seTE > 0))
stopifnot(!anyDuplicated(d$study))
# The fixture contains an additional A-vs-B comparison, which is NOT part
# of the A-vs-C and B-vs-C indirect path.
ac <- d[d$treat1 == "A" & d$treat2 == "C",]
bc <- d[d$treat1 == "B" & d$treat2 == "C",]
stopifnot(nrow(ac) > 0, nrow(bc) > 0)
pool <- function(g) {
  w <- 1 / (g$seTE^2)
  c(mu=sum(w*g$TE)/sum(w), se=sqrt(1/sum(w)), k=nrow(g))
}
AC <- pool(ac); BC <- pool(bc)
mu <- unname(AC["mu"] - BC["mu"])
se <- unname(sqrt(AC["se"]^2 + BC["se"]^2))
ci <- mu + c(-1,1) * qnorm(.975) * se
p <- 2*pnorm(-abs(mu/se))
cat(sprintf("AC=%.15f SEAC=%.15f BC=%.15f SEBC=%.15f\n",
            AC["mu"],AC["se"],BC["mu"],BC["se"]))
cat(sprintf("AB=%.15f SEAB=%.15f CI=[%.15f, %.15f] p=%.15f\n",
            mu,se,ci[1],ci[2],p))
# This normal-Wald interval is not a Hartung-Knapp prediction interval.
# A multi-arm or correlated contrast requires covariance-aware NMA.
