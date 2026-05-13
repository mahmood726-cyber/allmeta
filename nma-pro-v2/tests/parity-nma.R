suppressPackageStartupMessages(library(netmeta))
suppressPackageStartupMessages(library(jsonlite))

csv_path <- commandArgs(trailingOnly = TRUE)[1]
if (is.na(csv_path) || !file.exists(csv_path)) {
  csv_path <- file.path(dirname(sys.frame(1)$ofile), "nma-tiny.csv")
}

d <- read.csv(csv_path)
cat("Data loaded:", nrow(d), "rows\n", file = stderr())

r <- netmeta(
  TE     = d$yi,
  seTE   = d$sei,
  treat1 = d$treat1,
  treat2 = d$treat2,
  studlab = d$study,
  sm     = "SMD",
  random = TRUE,
  common = FALSE,
  method.tau = "REML"
)

ps <- netrank(r, small.values = "desirable")

# Convert named vector to list so jsonlite serialises it as a JSON object
# (named array), not an unnamed JSON array.
pscores_list <- as.list(ps$Pscore.random)

out <- list(
  TE_AB_random   = r$TE.random["A", "B"],
  seTE_AB_random = r$seTE.random["A", "B"],
  TE_AC_random   = r$TE.random["A", "C"],
  seTE_AC_random = r$seTE.random["A", "C"],
  TE_AD_random   = r$TE.random["A", "D"],
  seTE_AD_random = r$seTE.random["A", "D"],
  tau2           = r$tau^2,
  tau            = r$tau,
  I2             = r$I2,
  Q              = r$Q,
  k              = r$k,
  m              = r$m,
  pscores        = pscores_list
)

cat(toJSON(out, auto_unbox = TRUE, digits = 12))
cat("\n")
