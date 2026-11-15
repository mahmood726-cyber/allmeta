## mcid-oracle.R — reference for the MCID app. The app is deterministic
## formula arithmetic; the only "statistical" element is the exact
## qnorm(0.975) constant (the Cycle-7.1 fix away from 1.96). This pins
## that constant to R's value and the documented distribution/anchor/NI
## multiples (Norman 0.5·SD, Wyrwich 1·SEM, 1.96·SEM = 95% band around one
## measurement, SDC = 1.96·sqrt(2)·SEM for a change score (de Vet et al.,
## HQLO 2006;4:54), Juniper anchor, ICH-E10 / FDA 2016 NI margin
## M2 = (1 - f)·M1 where f is the preserved fraction of M1).
##
## Case 2 has f = 0.75: at f = 0.5 the correct M2 = (1 - f)·M1 and the
## wrong f·M1 coincide, so a fixture with only f = 0.5 cannot tell them apart.
##
## Run from anywhere: Rscript mcid/tests/fixtures/mcid-oracle.R
## (writes mcid-oracle.json next to this script).
suppressPackageStartupMessages(library(jsonlite))
z975 <- qnorm(0.975)
one <- function(inp) list(
  input     = inp,
  halfSD    = 0.5 * inp$sd,
  threeSD   = 0.3 * inp$sd,
  oneSEM    = inp$sem,
  semBand95 = z975 * inp$sem,
  sdc       = z975 * sqrt(2) * inp$sem,
  anchor    = inp$somewhat - inp$none,
  niMargin  = (1 - inp$frac) * inp$hist)
cases <- list(
  one(list(sd = 12, sem = 5, somewhat = 8, none = 3, hist = 10, frac = 0.5)),
  one(list(sd = 12, sem = 5, somewhat = 8, none = 3, hist = 8, frac = 0.75)))
oracle <- list(z975 = z975, cases = cases)
args <- commandArgs(trailingOnly = FALSE)
here <- dirname(normalizePath(sub("^--file=", "", args[grep("^--file=", args)][1])))
out <- file.path(here, "mcid-oracle.json")
writeLines(toJSON(oracle, auto_unbox = TRUE, digits = 16), out)
cat("wrote", out, "; qnorm(0.975)=", sprintf("%.16f", z975), "\n")
