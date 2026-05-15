## mcid-oracle.R — reference for the MCID app. The app is deterministic
## formula arithmetic; the only "statistical" element is the exact
## qnorm(0.975) constant (the Cycle-7.1 fix away from 1.96). This pins
## that constant to R's value and the documented distribution/anchor/NI
## multiples (Norman 0.5·SD, Wyrwich 1·SEM, 1.96·SEM≈SDC, Juniper anchor,
## ICH-E10 NI margin).
suppressPackageStartupMessages(library(jsonlite))
inp <- list(sd = 12, sem = 5, somewhat = 8, none = 3, hist = 10, frac = 0.5)
z975 <- qnorm(0.975)
oracle <- list(
  input  = inp,
  z975   = z975,
  halfSD = 0.5 * inp$sd,
  threeSD= 0.3 * inp$sd,
  oneSEM = inp$sem,
  sdc    = z975 * inp$sem,
  anchor = inp$somewhat - inp$none,
  niMargin = inp$frac * inp$hist)
writeLines(toJSON(oracle, auto_unbox = TRUE, digits = 16),
  "C:/Projects/allmeta/mcid/tests/fixtures/mcid-oracle.json")
cat("wrote mcid-oracle.json; qnorm(0.975)=", sprintf("%.16f", z975), "\n")
